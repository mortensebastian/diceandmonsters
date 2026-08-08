/* ============================================================
   Dice & Monsters — Captcha (sign-up bot guard)
   ------------------------------------------------------------
   One global: window.Captcha. UI-only + token plumbing, no game
   rules and no hard dependency on the network.

   Two modes, picked automatically:

   1) PROVIDER mode — window.SUPABASE_CONFIG.captcha =
      { provider: 'turnstile' | 'hcaptcha', siteKey: '…' }.
      Renders the provider widget and hands the resulting token to
      Cloud.signUp/signIn, which passes it as Supabase's
      `options.captchaToken`. This is the only mode that actually
      *stops* bots: Supabase (Auth → Attack Protection) verifies the
      token server-side, so hitting the REST endpoint directly
      without a token fails too. Setup: see SUPABASE.md.

   2) LOCAL mode — no provider configured (the default). Shows a
      small dice question plus a honeypot field and a "filled in
      impossibly fast" timing check. That stops naive form-filling
      bots and costs nothing, but it lives in the browser, so a
      determined script can skip it by calling Supabase directly.
      Treat it as a speed bump, not as security.

   API:
     Captcha.configured()          → true in provider mode
     Captcha.mount(container)      → build the widget/challenge
     Captcha.verify()              → Promise<{ ok, token, error }>
     Captcha.reset()               → new token / new question
     Captcha.required()            → false only if deliberately off
   ============================================================ */
(function () {
  'use strict';

  var SCRIPTS = {
    turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    hcaptcha: 'https://js.hcaptcha.com/1/api.js?render=explicit'
  };
  var MIN_FILL_MS = 1500;   // humans need at least this long to type email + password
  var WAIT_MS = 20000;      // how long we wait for a provider token

  var cfg = null;           // { provider, siteKey } when configured
  var mode = 'local';       // 'turnstile' | 'hcaptcha' | 'local'
  var el = {};              // { root, box, hp, q, input, note }
  var widgetId = null;
  var mountedAt = 0;
  var answer = null;
  var scriptLoading = null;

  function config() {
    var c = window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.captcha;
    if (!c || !c.siteKey) return null;
    var p = (c.provider || 'turnstile').toLowerCase();
    if (p !== 'turnstile' && p !== 'hcaptcha') return null;
    return { provider: p, siteKey: c.siteKey };
  }

  function configured() { return !!config(); }

  // A site can switch the guard off entirely with captcha: { off: true }.
  function required() {
    var c = window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.captcha;
    return !(c && c.off === true);
  }

  function api() { return mode === 'hcaptcha' ? window.hcaptcha : window.turnstile; }

  function loadScript(provider) {
    if (scriptLoading) return scriptLoading;
    scriptLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = SCRIPTS[provider];
      s.async = true; s.defer = true;
      s.onload = function () { resolve(true); };
      s.onerror = function () { reject(new Error('captcha script blocked')); };
      document.head.appendChild(s);
    });
    return scriptLoading;
  }

  /* ---- Local challenge ---- */
  var DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  function newQuestion() {
    var a = 1 + Math.floor(Math.random() * 6);
    var b = 1 + Math.floor(Math.random() * 6);
    // Half the time ask for the sum, half for the higher die — both are
    // trivial for a human reading the pips and awkward for a dumb script.
    if (Math.random() < 0.5) {
      answer = a + b;
      return 'You roll ' + DICE[a - 1] + ' and ' + DICE[b - 1] + ' — what do they add up to?';
    }
    if (a === b) b = (b % 6) + 1;
    answer = Math.max(a, b);
    return 'You roll ' + DICE[a - 1] + ' and ' + DICE[b - 1] + ' — what is the highest die?';
  }

  function renderLocal(msg) {
    el.box.innerHTML =
      '<div class="captcha__q"></div>' +
      '<input type="text" class="captcha__in" inputmode="numeric" autocomplete="off" ' +
        'placeholder="answer" aria-label="Captcha answer">' +
      (msg ? '<div class="captcha__note"></div>' : '');
    el.q = el.box.querySelector('.captcha__q');
    el.input = el.box.querySelector('.captcha__in');
    el.note = el.box.querySelector('.captcha__note');
    el.q.textContent = newQuestion();
    if (el.note) el.note.textContent = msg;
  }

  /* ---- Mount ---- */
  function mount(container) {
    if (!container) return;
    cfg = config();
    mode = cfg ? cfg.provider : 'local';
    mountedAt = Date.now();
    widgetId = null;

    container.innerHTML =
      '<div class="captcha">' +
        // Honeypot: off-screen, never focusable, no autofill. A human
        // never sees it; form-filling bots fill every input they find.
        '<input type="text" class="captcha__hp" tabindex="-1" autocomplete="off" ' +
          'aria-hidden="true" name="nickname">' +
        '<div class="captcha__box"></div>' +
      '</div>';
    el.root = container.querySelector('.captcha');
    el.hp = container.querySelector('.captcha__hp');
    el.box = container.querySelector('.captcha__box');
    el.q = el.input = el.note = null;

    if (!cfg) { renderLocal(''); return; }

    el.box.textContent = 'Loading verification…';
    loadScript(cfg.provider).then(function () {
      var lib = api();
      if (!lib || !lib.render) throw new Error('captcha unavailable');
      el.box.innerHTML = '';
      widgetId = lib.render(el.box, {
        sitekey: cfg.siteKey,
        theme: 'dark',
        'error-callback': function () { /* verify() reports it */ }
      });
    })['catch'](function () {
      // Offline / blocked / bad key — fall back to the local question so
      // sign-up is still reachable. Supabase still enforces its own check
      // if attack protection is on, and will say so.
      mode = 'local';
      renderLocal('Verification service unreachable — answer this instead.');
    });
  }

  // New token / new question. Deliberately does NOT restart the timing
  // check: it measures how long the form has been on screen, so a second
  // attempt (e.g. sign in right after a failed sign-up) isn't punished.
  function reset() {
    if (el.hp) el.hp.value = '';
    if (mode === 'local') { if (el.box) renderLocal(el.note ? el.note.textContent : ''); return; }
    var lib = api();
    if (lib && lib.reset && widgetId !== null) { try { lib.reset(widgetId); } catch (e) { /* ignore */ } }
  }

  function tooFast() { return Date.now() - mountedAt < MIN_FILL_MS; }
  function trapped() { return !!(el.hp && el.hp.value); }

  function fail(msg) { return Promise.resolve({ ok: false, token: null, error: msg }); }

  function verify() {
    if (!required()) return Promise.resolve({ ok: true, token: null, error: null });
    if (!el.root) return fail('Verification not ready — reopen the form.');
    if (trapped() || tooFast()) { reset(); return fail('Could not verify you are human. Please try again.'); }

    if (mode === 'local') {
      var given = ((el.input && el.input.value) || '').trim();
      if (!given) return fail('Answer the dice question.');
      if (parseInt(given, 10) !== answer) {
        renderLocal('That is not it — here is another one.');
        return fail('Wrong answer — try the new question.');
      }
      return Promise.resolve({ ok: true, token: null, error: null });
    }

    // Provider mode: poll for the token the widget hands back.
    var lib = api();
    if (!lib || !lib.getResponse || widgetId === null) return fail('Verification not ready — try again in a moment.');
    return new Promise(function (resolve) {
      var deadline = Date.now() + WAIT_MS;
      (function poll() {
        var t = '';
        try { t = lib.getResponse(widgetId) || ''; } catch (e) { t = ''; }
        if (t) { resolve({ ok: true, token: t, error: null }); return; }
        if (Date.now() > deadline) { resolve({ ok: false, token: null, error: 'Complete the verification check first.' }); return; }
        setTimeout(poll, 300);
      })();
    });
  }

  window.Captcha = {
    configured: configured,
    required: required,
    mount: mount,
    verify: verify,
    reset: reset
  };
})();
