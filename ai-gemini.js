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
  function toGeminiTool(t) {
    return { name: t.name, description: t.description || '', parameters: t.input_schema || { type: 'object', properties: {} } };
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
            if (b.text) parts.push({ text: b.text });
          } else if (b.type === 'tool_use') {
            idToName[b.id] = b.name;
            parts.push({ functionCall: { name: b.name, args: b.input || {} } });
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
      if (typeof p.text === 'string' && p.text) {
        content.push({ type: 'text', text: p.text });
      } else if (p.functionCall) {
        sawTool = true;
        content.push({
          type: 'tool_use',
          id: 'g' + (n++),
          name: p.functionCall.name,
          input: p.functionCall.args || {}
        });
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

  // ---- the provider entry point (matches registerProvider's contract) ------
  // req: canonical { system, messages, tools?, model?, max_tokens? }
  function complete(req, passedModel) {
    // Prefer an explicitly-passed gemini model; otherwise our stored default.
    var model = (passedModel && /gemini/i.test(passedModel)) ? passedModel : getModel();
    var key = getKey();
    if (!key) return Promise.reject(new Error('No Gemini API key set. Add it in localStorage (diceAndMonsters.geminiKey).'));

    var body = {
      contents: toGeminiContents(req.messages),
      generationConfig: { maxOutputTokens: req.max_tokens || 1024 }
    };
    var sys = sysText(req.system);
    if (sys) body.system_instruction = { parts: [{ text: sys }] };
    if (req.tools && req.tools.length) {
      body.tools = [{ function_declarations: req.tools.map(toGeminiTool) }];
    }

    return fetch(cfg.endpoint(model, key), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
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
    });
  }

  // Register with AIClient if present (this file loads AFTER ai-client.js).
  if (window.AIClient && window.AIClient.registerProvider) {
    window.AIClient.registerProvider('gemini', complete);
  }

  // One global, for optional settings UI / console use.
  window.GeminiProvider = {
    complete: complete,
    getKey: getKey, setKey: setKey, hasKey: hasKey,
    getModel: getModel, setModel: setModel, DEFAULT_MODEL: DEFAULT_MODEL
  };
})();
