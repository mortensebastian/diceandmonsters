/* ============================================================
   Dice & Monsters — Gemini provider (OPTIONAL, self-contained)
   ------------------------------------------------------------
   Lets the AI DM run on Google Gemini instead of Claude. It plugs
   into AIClient via registerProvider('gemini', …) and translates
   to/from the canonical (Anthropic-shaped) response, so play.js,
   ai-dm.js and ai-player.js don't change.

   ▶ TO DELETE GEMINI ENTIRELY:
       1. Delete this file (ai-gemini.js).
       2. Remove its <script> tag from play.html (and any other page).
       3. If you set the provider, reset it:
            localStorage.removeItem('diceAndMonsters.aiProvider');
     That's it — the provider registry in ai-client.js goes inert and
     the app runs on Claude exactly as before. No other edits needed.

   ▶ TO TEST (BYOK — key stays in YOUR browser only, never the repo):
       localStorage.setItem('diceAndMonsters.geminiKey', '<your key>');
       localStorage.setItem('diceAndMonsters.geminiModel', 'gemini-flash-latest');
       localStorage.setItem('diceAndMonsters.aiProvider', 'gemini');
     then reload play.html. Switch back with aiProvider = 'anthropic'.

   NOTE: shipping YOUR key to other users' browsers is unsafe — for a
   real free tier, point ENDPOINT at a relay (Supabase edge function)
   that holds the key server-side. See cfg.endpoint below.
   ============================================================ */
(function () {
  'use strict';

  var KEY_LS   = 'diceAndMonsters.geminiKey';
  var MODEL_LS = 'diceAndMonsters.geminiModel';
  var DEFAULT_MODEL = 'gemini-flash-latest';   // change freely; verify the id at ai.google.dev

  var cfg = {
    // Direct browser → Google. For a shared free tier, replace this with a
    // relay URL and have the relay inject the key (then getKey() can be empty).
    endpoint: function (model, key) {
      return 'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
    }
  };

  function getKey()   { try { return window.localStorage.getItem(KEY_LS) || ''; } catch (e) { return ''; } }
  function setKey(k)  { try { window.localStorage.setItem(KEY_LS, k || ''); } catch (e) { /* ignore */ } }
  function hasKey()   { return !!getKey(); }
  function getModel() { try { return window.localStorage.getItem(MODEL_LS) || DEFAULT_MODEL; } catch (e) { return DEFAULT_MODEL; } }
  function setModel(m){ try { window.localStorage.setItem(MODEL_LS, m || DEFAULT_MODEL); } catch (e) { /* ignore */ } }

  // Relay URL (Supabase edge function). When set, the key stays server-side and
  // the browser never holds it — this is the mode for a shared free tier.
  var RELAY_LS = 'diceAndMonsters.geminiRelay';
  // The relay URL is derived from the Supabase project by default (the URL is
  // public — only the key behind it is secret), so the free tier works with no
  // per-user setup. A localStorage value overrides it; set it to '' to force
  // direct BYOK for local dev.
  // The deployed edge function's slug. It happens to be 'hyper-action' (the
  // dashboard's auto-generated name — a function's slug can't be renamed after
  // creation), but the code in it IS the Gemini relay. If you ever recreate the
  // function with the slug 'gemini', change this back to 'gemini'.
  var RELAY_FN = 'hyper-action';
  function defaultRelay() {
    try {
      var u = window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url;
      return u ? (u.replace(/\/+$/, '') + '/functions/v1/' + RELAY_FN) : '';
    } catch (e) { return ''; }
  }
  function getRelay() {
    try { var v = window.localStorage.getItem(RELAY_LS); if (v != null) return v; } catch (e) { /* ignore */ }
    return defaultRelay();
  }
  function setRelay(u) { try { window.localStorage.setItem(RELAY_LS, u || ''); } catch (e) { /* ignore */ } }

  // The Supabase publishable/anon key (public) — the `apikey` header the
  // functions gateway expects.
  function anonKey() {
    try { return (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) || ''; } catch (e) { return ''; }
  }

  // A Supabase session token so the relay can gate on a user. Free-tier players
  // never sign up: if there's no session we create an ANONYMOUS one (requires
  // "Anonymous sign-ins" enabled in the Supabase project). Falls back to the
  // anon key, which the relay rejects with "Sign in required".
  function authToken() {
    var c;
    try { c = window.Cloud && window.Cloud.raw && window.Cloud.raw(); } catch (e) { /* ignore */ }
    if (!(c && c.auth && c.auth.getSession)) return Promise.resolve(anonKey());
    return c.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      if (s && s.access_token) return s.access_token;
      if (c.auth.signInAnonymously) {
        return c.auth.signInAnonymously().then(function (r2) {
          var s2 = r2 && r2.data && r2.data.session;
          return (s2 && s2.access_token) || anonKey();
        }).catch(function () { return anonKey(); });
      }
      return anonKey();
    }).catch(function () { return anonKey(); });
  }

  // ---- helpers -------------------------------------------------------------

  function asText(x) {
    if (x == null) return '';
    if (typeof x === 'string') return x;
    // tool_result content may be a string or an array of {type:'text',text}.
    if (Array.isArray(x)) {
      return x.map(function (b) { return (b && b.text) ? b.text : ''; }).join('\n');
    }
    return String(x);
  }

  // system may be a plain string or [{type:'text',text,cache_control?}] (we
  // ignore cache_control — Gemini has its own caching).
  function sysText(system) {
    if (!system) return '';
    if (typeof system === 'string') return system;
    if (Array.isArray(system)) {
      return system.map(function (b) { return (b && b.text) ? b.text : ''; }).join('\n\n');
    }
    return String(system);
  }

  // Anthropic tool  →  Gemini functionDeclaration (input_schema IS JSON Schema).
  // Gemini rejects a parameters schema with no properties, so no-argument tools
  // (roll_initiative, advance_turn) must omit `parameters` entirely — otherwise
  // the whole tools array is invalid and every DM call 400s.
  function toGeminiTool(t) {
    var d = { name: t.name, description: t.description || '' };
    var s = t.input_schema;
    if (s && s.properties && Object.keys(s.properties).length) d.parameters = s;
    return d;
  }

  // Canonical message array  →  Gemini `contents`.
  // Roles: user/assistant → user/model. tool_use → functionCall (model turn);
  // tool_result → functionResponse (user turn). Gemini keys functionResponse by
  // NAME, not id, so we map each tool_use id → name as we walk the transcript.
  function toGeminiContents(messages) {
    var idToName = {};
    var out = [];
    (messages || []).forEach(function (m) {
      var role = (m.role === 'assistant') ? 'model' : 'user';
      var parts = [];
      var content = m.content;

      if (typeof content === 'string') {
        if (content) parts.push({ text: content });
      } else if (Array.isArray(content)) {
        content.forEach(function (b) {
          if (!b) return;
          if (b.type === 'text') {
            if (b.text) {
              var tp = { text: b.text };
              if (b.thoughtSignature) tp.thoughtSignature = b.thoughtSignature;
              parts.push(tp);
            }
          } else if (b.type === 'tool_use') {
            idToName[b.id] = b.name;
            var fp = { functionCall: { name: b.name, args: b.input || {} } };
            if (b.thoughtSignature) fp.thoughtSignature = b.thoughtSignature;
            parts.push(fp);
          } else if (b.type === 'tool_result') {
            var name = idToName[b.tool_use_id] || b.tool_use_id || 'tool';
            var resp = { content: asText(b.content) };
            if (b.is_error) resp.is_error = true;
            parts.push({ functionResponse: { name: name, response: resp } });
          }
        });
      }

      if (parts.length) out.push({ role: role, parts: parts });
    });
    return out;
  }

  // Gemini response  →  canonical (Anthropic-shaped) response.
  function fromGemini(res, model) {
    if (res && res.error) {
      throw new Error('Gemini API: ' + (res.error.message || JSON.stringify(res.error)));
    }
    var cand = (res && res.candidates && res.candidates[0]) || {};
    var parts = (cand.content && cand.content.parts) || [];
    var content = [], sawTool = false, n = 0;

    parts.forEach(function (p) {
      if (p == null) return;
      // Gemini 2.5+ attaches an opaque thoughtSignature to (some) parts and
      // REQUIRES it echoed back verbatim on the next request — otherwise the
      // follow-up tool-loop call 400s. Carry it on the canonical block so
      // toGeminiContents can restore it.
      var sig = p.thoughtSignature || p.thought_signature;
      if (typeof p.text === 'string' && p.text) {
        var tb = { type: 'text', text: p.text };
        if (sig) tb.thoughtSignature = sig;
        content.push(tb);
      } else if (p.functionCall) {
        sawTool = true;
        var tu = {
          type: 'tool_use',
          id: 'g' + (n++),
          name: p.functionCall.name,
          input: p.functionCall.args || {}
        };
        if (sig) tu.thoughtSignature = sig;
        content.push(tu);
      }
    });

    var u = res.usageMetadata || {};
    return {
      model: model,
      content: content,
      stop_reason: sawTool ? 'tool_use' : 'end_turn',
      usage: {
        input_tokens:  u.promptTokenCount || 0,
        output_tokens: u.candidatesTokenCount || 0,
        cache_read_input_tokens: u.cachedContentTokenCount || 0,
        cache_creation_input_tokens: 0
      }
    };
  }

  // Build the Gemini generateContent request body from a canonical request.
  function buildBody(req) {
    var body = {
      contents: toGeminiContents(req.messages),
      generationConfig: { maxOutputTokens: req.max_tokens || 1024 }
    };
    var sys = sysText(req.system);
    if (sys) body.system_instruction = { parts: [{ text: sys }] };
    if (req.tools && req.tools.length) {
      body.tools = [{ function_declarations: req.tools.map(toGeminiTool) }];
    }
    return body;
  }

  // Normalize a fetch Response (from Google directly OR from the relay, which
  // returns Google's JSON verbatim) into the canonical Anthropic-shaped result.
  function parseResponse(res, model) {
    return res.text().then(function (txt) {
      var parsed;
      try { parsed = JSON.parse(txt); } catch (e) { parsed = null; }
      if (!res.ok) {
        var msg = txt;
        if (parsed && parsed.error && parsed.error.message) msg = parsed.error.message;
        throw new Error('Gemini API ' + res.status + ': ' + msg);
      }
      return fromGemini(parsed, model);
    });
  }

  // ---- the provider entry point (matches registerProvider's contract) ------
  // req: canonical { system, messages, tools?, model?, max_tokens? }
  //
  // Two transports:
  //  • RELAY (free tier): a relay URL is set → POST { model, request } to it
  //    with the user's Supabase session token. The key lives ONLY server-side.
  //  • DIRECT (BYOK/dev): no relay → call Google directly with the localStorage
  //    key. Never ship a shared key this way.
  function complete(req, passedModel) {
    var model = (passedModel && /gemini/i.test(passedModel)) ? passedModel : getModel();
    var body = buildBody(req);
    var relay = getRelay();

    if (relay) {
      return authToken().then(function (token) {
        var headers = { 'content-type': 'application/json' };
        var ak = anonKey();
        if (ak) headers['apikey'] = ak;
        if (token) headers['authorization'] = 'Bearer ' + token;
        return fetch(relay, {
          method: 'POST', headers: headers,
          body: JSON.stringify({ model: model, request: body })
        }).then(function (res) { return parseResponse(res, model); });
      });
    }

    var key = getKey();
    if (!key) return Promise.reject(new Error('No Gemini API key set (and no relay configured). Set diceAndMonsters.geminiKey for direct use, or diceAndMonsters.geminiRelay for the server-side relay.'));
    return fetch(cfg.endpoint(model, key), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) { return parseResponse(res, model); });
  }

  // Register with AIClient if present (this file loads AFTER ai-client.js).
  if (window.AIClient && window.AIClient.registerProvider) {
    window.AIClient.registerProvider('gemini', complete);
  }

  // One global, for optional settings UI / console use.
  window.GeminiProvider = {
    complete: complete,
    getKey: getKey, setKey: setKey, hasKey: hasKey,
    getModel: getModel, setModel: setModel, DEFAULT_MODEL: DEFAULT_MODEL,
    getRelay: getRelay, setRelay: setRelay
  };
})();
