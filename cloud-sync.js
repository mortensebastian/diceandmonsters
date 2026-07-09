/* ============================================================
   Dice & Monsters — Cloud Sync (collections)
   ------------------------------------------------------------
   A small reusable auth bar + localStorage-collection sync, used
   by the Character, Adventure and Encounter pages so their lists
   (characters / adventures / encounters) save to Supabase.

   Local-first: with no Supabase config it does nothing and the
   page runs on localStorage as before. Signed in, it merges the
   cloud copy with local (union by id; nothing is lost), keeps
   them in sync, and pushes local changes up (debounced).

   Page usage:
     CloudSync.attach({
       kind: 'characters', lsKey: 'diceAndMonsters.characters',
       idKey: 'id', mount: '#cloud-bar',
       onRemoteChange: function () { reloadAndRender(); }
     });
   and call CloudSync.push('characters') after every local save.
   ============================================================ */
(function () {
  'use strict';

  var regs = {};        // kind -> options
  var barBuilt = false;

  function readLS(key) { try { return JSON.parse(window.localStorage.getItem(key)) || []; } catch (e) { return []; } }
  function writeLS(key, arr) { try { window.localStorage.setItem(key, JSON.stringify(arr)); } catch (e) { /* ignore */ } }

  function mergeByKey(local, remote, idKey) {
    var map = {}, order = [];
    function add(x) {
      if (!x || x[idKey] == null) return;
      var k = String(x[idKey]);
      if (!(k in map)) order.push(k);
      map[k] = x;
    }
    (remote || []).forEach(add);                 // cloud first (wins on conflict)
    (local || []).forEach(function (x) {          // add local-only items
      if (x && x[idKey] != null && !(String(x[idKey]) in map)) add(x);
    });
    return order.map(function (k) { return map[k]; });
  }

  /* ---- The shared auth bar ---- */
  var el = {};
  function ensureBar(mountSel) {
    if (barBuilt) return;
    var mount = document.querySelector(mountSel);
    if (!mount) return;
    mount.innerHTML =
      '<div class="csbar" hidden>' +
        '<span class="csbar__label">☁ Cloud sync</span>' +
        '<span class="csbar__auth">' +
          '<input type="email" class="csbar__input" id="cs-email" placeholder="email" autocomplete="username">' +
          '<input type="password" class="csbar__input" id="cs-pw" placeholder="password" autocomplete="current-password">' +
          '<button type="button" class="btn-cs-signin">Sign in</button>' +
          '<button type="button" class="btn-cs-signup">Sign up</button>' +
        '</span>' +
        '<span class="csbar__me" hidden><span id="cs-user"></span> ' +
          '<button type="button" class="btn-cs-signout">Sign out</button></span>' +
        '<span class="csbar__status" id="cs-status"></span>' +
      '</div>';
    el.bar = mount.querySelector('.csbar');
    el.auth = mount.querySelector('.csbar__auth');
    el.me = mount.querySelector('.csbar__me');
    el.user = mount.querySelector('#cs-user');
    el.email = mount.querySelector('#cs-email');
    el.pw = mount.querySelector('#cs-pw');
    el.status = mount.querySelector('#cs-status');
    mount.querySelector('.btn-cs-signin').addEventListener('click', doSignIn);
    mount.querySelector('.btn-cs-signup').addEventListener('click', doSignUp);
    mount.querySelector('.btn-cs-signout').addEventListener('click', function () { Cloud.signOut(); });
    el.pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSignIn(); });
    el.bar.hidden = false;
    barBuilt = true;
  }
  function setStatus(t) { if (el.status) el.status.textContent = t || ''; }
  function fade() { setTimeout(function () { setStatus(''); }, 1500); }
  function renderBar(user) {
    if (!el.bar) return;
    var signedIn = !!user;
    el.auth.hidden = signedIn;
    el.me.hidden = !signedIn;
    if (signedIn) el.user.textContent = user.email || 'signed in';
  }
  function doSignIn() {
    var email = (el.email.value || '').trim(), pw = el.pw.value || '';
    if (!email || !pw) { setStatus('Enter email and password.'); return; }
    setStatus('Signing in…');
    Cloud.signIn(email, pw).then(function (r) { setStatus(r.error ? r.error.message : ''); });
  }
  function doSignUp() {
    var email = (el.email.value || '').trim(), pw = el.pw.value || '';
    if (!email || !pw) { setStatus('Enter email and password.'); return; }
    setStatus('Creating account…');
    Cloud.signUp(email, pw).then(function (r) {
      if (r.error) { setStatus(r.error.message); return; }
      setStatus(r.data && r.data.session ? '' : 'Check your email to confirm, then sign in.');
    });
  }

  /* ---- Sync ---- */
  function pullAndMerge(opts) {
    Cloud.getCollection(opts.kind).then(function (res) {
      if (res.error) { setStatus(res.error.message); return; }
      var remote = (res.data && res.data.data) || [];
      var merged = mergeByKey(readLS(opts.lsKey), remote, opts.idKey);
      writeLS(opts.lsKey, merged);
      if (opts.onRemoteChange) opts.onRemoteChange();
      doPush(opts, merged);       // push the union so cloud gets local-only items
    });
  }
  function doPush(opts, data) {
    if (!Cloud.user()) return;
    Cloud.saveCollection(opts.kind, data).then(function (r) {
      if (r.error) setStatus('Cloud save failed: ' + r.error.message);
      else { setStatus('Synced.'); fade(); }
    }).catch(function () { setStatus('Cloud save failed.'); });
  }
  function push(kind) {
    var opts = regs[kind];
    if (!opts || !window.Cloud || !Cloud.available() || !Cloud.user()) return;
    clearTimeout(opts.timer);
    opts.timer = setTimeout(function () { doPush(opts, readLS(opts.lsKey)); }, 800);
  }

  function attach(opts) {
    opts.idKey = opts.idKey || 'id';
    regs[opts.kind] = opts;
    if (!window.Cloud || !Cloud.available()) return;   // local only
    ensureBar(opts.mount);
    Cloud.init();
    Cloud.onAuth(function (user) {
      renderBar(user);
      if (user) pullAndMerge(opts);
    });
  }

  window.CloudSync = { attach: attach, push: push };
})();
