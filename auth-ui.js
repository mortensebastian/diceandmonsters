/* ============================================================
   Dice & Monsters — Global auth widget
   ------------------------------------------------------------
   One shared sign-in control for every page, pinned top-right.
   Signed out: a "Sign in" button that opens a small email/password
   form. Signed in: "Logged in as <email>" + Sign out — no sign-in
   / sign-up shown. Supabase auth is shared across pages (same
   origin), so signing in once covers the whole site.

   Only appears when Supabase is configured (window.Cloud.available()).
   Include after cloud.js on every page.
   ============================================================ */
(function () {
  'use strict';
  var el = {};

  function build() {
    if (!window.Cloud || !Cloud.available()) return;

    var wrap = document.createElement('div');
    wrap.className = 'authwidget';
    wrap.innerHTML =
      '<div class="authwidget__signed" hidden>Logged in as <b id="aw-email"></b>' +
        '<button type="button" class="btn-aw-signout">Sign out</button></div>' +
      '<div class="authwidget__out">' +
        '<button type="button" class="btn-aw-toggle">Sign in</button>' +
        '<div class="authwidget__form" hidden>' +
          '<input type="email" id="aw-email-in" placeholder="email" autocomplete="username">' +
          '<input type="password" id="aw-pw" placeholder="password" autocomplete="current-password">' +
          '<div class="authwidget__captcha" hidden></div>' +
          '<div class="authwidget__btns">' +
            '<button type="button" class="btn-aw-signin">Sign in</button>' +
            '<button type="button" class="btn-aw-signup">Sign up</button>' +
          '</div>' +
          '<div class="authwidget__status" id="aw-status"></div>' +
        '</div>' +
      '</div>';
    // Sit inside the nav bar (in normal flow, so it never covers page
    // buttons). Pages without a nav (the home page) get a top-right pin.
    var nav = document.querySelector('.nav');
    if (nav) { wrap.className += ' authwidget--nav'; nav.appendChild(wrap); }
    else { wrap.className += ' authwidget--fixed'; document.body.appendChild(wrap); }

    el.signed = wrap.querySelector('.authwidget__signed');
    el.out = wrap.querySelector('.authwidget__out');
    el.email = wrap.querySelector('#aw-email');
    el.form = wrap.querySelector('.authwidget__form');
    el.emailIn = wrap.querySelector('#aw-email-in');
    el.pw = wrap.querySelector('#aw-pw');
    el.status = wrap.querySelector('#aw-status');
    el.captcha = wrap.querySelector('.authwidget__captcha');

    wrap.querySelector('.btn-aw-toggle').addEventListener('click', function () {
      el.form.hidden = !el.form.hidden;
      if (el.form.hidden) return;
      el.emailIn.focus();
      // A real provider widget guards sign-in too (Supabase attack
      // protection covers both), so show it as soon as the form opens.
      // The local fallback question only gates sign-up — see doSignUp.
      if (guarded() && Captcha.configured()) showCaptcha();
    });
    wrap.querySelector('.btn-aw-signin').addEventListener('click', doSignIn);
    wrap.querySelector('.btn-aw-signup').addEventListener('click', doSignUp);
    wrap.querySelector('.btn-aw-signout').addEventListener('click', function () { Cloud.signOut(); });
    el.pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSignIn(); });

    Cloud.init();
    Cloud.onAuth(render);
  }

  function render(user) {
    var inn = !!user;
    el.signed.hidden = !inn;
    el.out.hidden = inn;
    if (inn) { el.email.textContent = user.email || 'signed in'; el.form.hidden = true; }
  }

  function status(t) { if (el.status) el.status.textContent = t || ''; }
  function creds() { return { email: (el.emailIn.value || '').trim(), pw: el.pw.value || '' }; }

  /* ---- Captcha (bot guard on account creation) ---- */
  var captchaShown = false;

  function guarded() { return !!(window.Captcha && Captcha.required()); }

  function showCaptcha() {
    if (!guarded() || captchaShown) return;
    el.captcha.hidden = false;
    Captcha.mount(el.captcha);
    captchaShown = true;
  }

  function doSignIn() {
    var c = creds();
    if (!c.email || !c.pw) { status('Enter email and password.'); return; }
    // Sign-in only needs a token when a real provider is configured; the
    // local question is a sign-up speed bump and shouldn't nag returning users.
    if (!guarded() || !Captcha.configured()) {
      status('Signing in…');
      Cloud.signIn(c.email, c.pw).then(function (r) { status(r.error ? r.error.message : ''); });
      return;
    }
    showCaptcha();
    status('Verifying…');
    Captcha.verify().then(function (v) {
      if (!v.ok) { status(v.error); return; }
      status('Signing in…');
      Cloud.signIn(c.email, c.pw, v.token).then(function (r) {
        status(r.error ? r.error.message : '');
        Captcha.reset();   // tokens are single-use
      });
    });
  }

  function doSignUp() {
    var c = creds();
    if (!c.email || !c.pw) { status('Enter email and password.'); return; }
    if (!guarded()) { createAccount(c, null); return; }
    if (!captchaShown) {
      showCaptcha();
      status('Verify you are human, then press Sign up.');
      return;
    }
    status('Verifying…');
    Captcha.verify().then(function (v) {
      if (!v.ok) { status(v.error); return; }
      createAccount(c, v.token);
    });
  }

  function createAccount(c, token) {
    status('Creating account…');
    Cloud.signUp(c.email, c.pw, token).then(function (r) {
      if (window.Captcha) Captcha.reset();
      if (r.error) { status(r.error.message); return; }
      status(r.data && r.data.session ? '' : 'Check your email to confirm, then sign in.');
    });
  }

  document.addEventListener('DOMContentLoaded', build);
})();
