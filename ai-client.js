/* ============================================================
   Dice & Monsters — AI Client (transport)
   ------------------------------------------------------------
   Talks to Claude. Two swappable transports:
     - 'direct' (default): browser → api.anthropic.com with the
       user's own key (BYOK), stored only in localStorage.
     - 'relay': browser → a Supabase Edge Function that holds the
       key server-side. Wire this up later by setting
       AIClient.configure({ mode:'relay', endpoint:'…' }); no other
       code changes needed.

   Nothing here touches game state — callers pass {system, messages,
   tools} and get Claude's raw response back.
   ============================================================ */
(function () {
  'use strict';

  var KEY_LS = 'diceAndMonsters.anthropicKey';
  var MODEL_LS = 'diceAndMonsters.aiModel';
  var DEFAULT_MODEL = 'claude-opus-4-8';
  var ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
  var ANTHROPIC_VERSION = '2023-06-01';

  var cfg = { mode: 'direct', endpoint: ANTHROPIC_URL };

  // ---- Provider registry (ADDITIVE — Anthropic is the built-in default) ----
  // Optional extra providers (e.g. Gemini) register themselves here via
  // registerProvider(). They translate to/from the canonical Anthropic-shaped
  // response so nothing downstream (play.js, ai-dm.js) changes.
  // TO REMOVE GEMINI (or any add-on provider): delete its file (ai-gemini.js)
  // and its <script> tag. This registry then goes inert and the Anthropic path
  // below runs exactly as before — no other edits needed.
  var providers = {};
  var PROVIDER_LS = 'diceAndMonsters.aiProvider';
  function registerProvider(name, fn) { if (name && typeof fn === 'function') providers[name] = fn; }
  // Default provider is 'gemini' (the free tier). 'anthropic' is still the
  // built-in transport below; users switch to it in Settings to use their key.
  function getProvider() { try { return window.localStorage.getItem(PROVIDER_LS) || 'gemini'; } catch (e) { return 'gemini'; } }
  function setProvider(p) { try { window.localStorage.setItem(PROVIDER_LS, p || 'gemini'); } catch (e) { /* ignore */ } }

  // ---- Usage tracking (tokens + running cost of the AI DM chat) ----
  // Running tally for the whole session: how many tokens we've SENT to Claude
  // (input, incl. cached) and how many it has WRITTEN back (output). Read live
  // via getUsage(); subscribe via onUsage() to drive a UI; the Play page rides
  // it in the session snapshot so the count survives a reload.
  var sessionUsage = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  var usageSubscribers = [];

  // Per-model list prices, USD per 1M tokens:
  //   [ input, output, cacheRead (0.1x), cacheWrite 5m (1.25x) ].
  // Matched by substring on the model id; unknown models fall back to Opus.
  var PRICING = [
    { match: 'fable',  rate: [10, 50, 1.0, 12.5] },
    { match: 'mythos', rate: [10, 50, 1.0, 12.5] },
    { match: 'haiku',  rate: [1, 5, 0.1, 1.25] },
    { match: 'sonnet', rate: [3, 15, 0.3, 3.75] },
    { match: 'opus',   rate: [5, 25, 0.5, 6.25] },
    // Google Gemini — PLACEHOLDER rates (USD per 1M). VERIFY current pricing at
    // ai.google.dev/pricing before trusting the cost readout. Cache-write is 0
    // (Gemini bills context caching differently). Safe to delete with Gemini.
    { match: 'flash-lite', rate: [0.10, 0.40, 0.025, 0] },
    { match: 'flash',      rate: [0.30, 2.50, 0.075, 0] },
    { match: 'gemini',     rate: [0.30, 2.50, 0.075, 0] }
  ];
  var DEFAULT_RATE = [5, 25, 0.5, 6.25]; // Opus 4.8

  function rateFor(model) {
    var m = (model || getModel() || '').toLowerCase();
    for (var i = 0; i < PRICING.length; i++) {
      if (m.indexOf(PRICING[i].match) !== -1) return PRICING[i].rate;
    }
    return DEFAULT_RATE;
  }

  // USD estimate for a usage tally at the given model's list price.
  function estCost(u, model) {
    var r = rateFor(model);
    return ((u.input || 0) * r[0] + (u.output || 0) * r[1] +
            (u.cacheRead || 0) * r[2] + (u.cacheWrite || 0) * r[3]) / 1e6;
  }

  // A copy of the running tally, with derived totals and cost baked in.
  function getUsage() {
    var u = {
      calls: sessionUsage.calls,
      input: sessionUsage.input,
      output: sessionUsage.output,
      cacheRead: sessionUsage.cacheRead,
      cacheWrite: sessionUsage.cacheWrite
    };
    // Total tokens we sent up (fresh input + everything served from / written
    // to cache is still input we delivered for reading).
    u.totalIn = u.input + u.cacheRead + u.cacheWrite;
    u.totalOut = u.output;
    u.cost = estCost(u);
    return u;
  }

  // Restore the tally from a persisted snapshot (Play autosave / cloud save).
  function setUsage(u) {
    u = u || {};
    sessionUsage.calls = u.calls || 0;
    sessionUsage.input = u.input || 0;
    sessionUsage.output = u.output || 0;
    sessionUsage.cacheRead = u.cacheRead || 0;
    sessionUsage.cacheWrite = u.cacheWrite || 0;
    notifyUsage();
  }

  // Subscribe to usage updates. cb(session) is called after every API call
  // and whenever the tally is reset/restored. Returns an unsubscribe fn.
  function onUsage(cb) {
    if (typeof cb !== 'function') return function () {};
    usageSubscribers.push(cb);
    try { cb(getUsage()); } catch (e) { /* ignore */ }
    return function () {
      var i = usageSubscribers.indexOf(cb);
      if (i !== -1) usageSubscribers.splice(i, 1);
    };
  }

  function notifyUsage() {
    var snap = getUsage();
    for (var i = 0; i < usageSubscribers.length; i++) {
      try { usageSubscribers[i](snap); } catch (e) { /* ignore */ }
    }
  }

  function trackUsage(u, model) {
    if (!u) return;
    var call = {
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0,
      cacheWrite: u.cache_creation_input_tokens || 0
    };
    sessionUsage.calls++;
    sessionUsage.input += call.input;
    sessionUsage.output += call.output;
    sessionUsage.cacheRead += call.cacheRead;
    sessionUsage.cacheWrite += call.cacheWrite;
    try {
      console.log('[AI usage] call in=' + call.input + ' out=' + call.output +
        ' cacheRead=' + call.cacheRead + ' cacheWrite=' + call.cacheWrite +
        ' ~$' + estCost(call, model).toFixed(4) +
        '  | session: ' + sessionUsage.calls + ' calls, ~$' +
        estCost(sessionUsage, model).toFixed(3));
    } catch (e) { /* console unavailable */ }
    notifyUsage();
  }

  function resetUsage() {
    sessionUsage.calls = sessionUsage.input = sessionUsage.output =
      sessionUsage.cacheRead = sessionUsage.cacheWrite = 0;
    notifyUsage();
  }

  function configure(o) {
    if (o.mode) cfg.mode = o.mode;
    if (o.endpoint) cfg.endpoint = o.endpoint;
    else if (o.mode === 'direct') cfg.endpoint = ANTHROPIC_URL;
  }

  function getKey() { try { return window.localStorage.getItem(KEY_LS) || ''; } catch (e) { return ''; } }
  function setKey(k) { try { window.localStorage.setItem(KEY_LS, k || ''); } catch (e) { /* ignore */ } }
  function hasKey() { return cfg.mode === 'relay' || !!getKey(); }
  function getModel() { try { return window.localStorage.getItem(MODEL_LS) || DEFAULT_MODEL; } catch (e) { return DEFAULT_MODEL; } }
  function setModel(m) { try { window.localStorage.setItem(MODEL_LS, m || DEFAULT_MODEL); } catch (e) { /* ignore */ } }

  // req: { system, messages, tools?, model?, max_tokens? }
  // Returns the parsed Anthropic Messages response object.
  function complete(req) {
    var model = req.model || getModel();

    // Route to a registered add-on provider when one is active. It returns a
    // canonical (Anthropic-shaped) response; we track usage against the model
    // it reports so the cost estimate uses that provider's rates.
    var provider = req.provider || getProvider();
    if (provider && provider !== 'anthropic') {
      if (!providers[provider]) {
        // Provider selected but its file was removed → fall back to Anthropic.
        try { console.warn('[AI] provider "' + provider + '" not loaded; using Anthropic.'); } catch (e) {}
      } else {
        return Promise.resolve(providers[provider](req, model)).then(function (canonical) {
          trackUsage(canonical.usage, canonical.model || model);
          return canonical;
        });
      }
    }

    var body = {
      model: model,
      max_tokens: req.max_tokens || 1024,
      messages: req.messages
    };
    if (req.system) body.system = req.system;
    if (req.tools) body.tools = req.tools;
    if (req.tool_choice) body.tool_choice = req.tool_choice;

    var headers = { 'content-type': 'application/json' };
    if (cfg.mode === 'direct') {
      var key = getKey();
      if (!key) return Promise.reject(new Error('No API key set. Add your Anthropic key in the AI settings.'));
      headers['x-api-key'] = key;
      headers['anthropic-version'] = ANTHROPIC_VERSION;
      // Required for calling the API straight from a browser.
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    // In relay mode the Edge Function adds auth + the Anthropic key.

    return fetch(cfg.endpoint, {
      method: 'POST', headers: headers, body: JSON.stringify(body)
    }).then(function (res) {
      return res.text().then(function (txt) {
        if (!res.ok) {
          var msg = txt;
          try { var j = JSON.parse(txt); if (j.error && j.error.message) msg = j.error.message; } catch (e) { /* keep raw */ }
          throw new Error('Claude API ' + res.status + ': ' + msg);
        }
        var parsed = JSON.parse(txt);
        trackUsage(parsed.usage, model);
        return parsed;
      });
    });
  }

  // Convenience: pull the concatenated text out of a response.
  function textOf(response) {
    if (!response || !response.content) return '';
    return response.content
      .filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; })
      .join('\n')
      .trim();
  }

  // Convenience: the tool_use blocks in a response (for Phase 2+).
  function toolCallsOf(response) {
    if (!response || !response.content) return [];
    return response.content.filter(function (b) { return b.type === 'tool_use'; });
  }

  window.AIClient = {
    configure: configure,
    getKey: getKey, setKey: setKey, hasKey: hasKey,
    getModel: getModel, setModel: setModel, DEFAULT_MODEL: DEFAULT_MODEL,
    complete: complete, textOf: textOf, toolCallsOf: toolCallsOf,
    sessionUsage: sessionUsage, resetUsage: resetUsage,
    getUsage: getUsage, setUsage: setUsage, onUsage: onUsage, estCost: estCost,
    // Provider registry (add-on providers like Gemini plug in here).
    registerProvider: registerProvider, getProvider: getProvider, setProvider: setProvider
  };
})();
