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
    var body = {
      model: req.model || getModel(),
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
        return JSON.parse(txt);
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
    complete: complete, textOf: textOf, toolCallsOf: toolCallsOf
  };
})();
