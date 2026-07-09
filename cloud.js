/* ============================================================
   Dice & Monsters — Cloud (Supabase)
   ------------------------------------------------------------
   Thin data layer over the Supabase client: auth + play_sessions
   CRUD + Realtime. Everything degrades gracefully — if there's no
   config or the Supabase script didn't load, Cloud.available() is
   false and the app runs fully on localStorage as before.

   The Supabase JS client is loaded from a CDN <script> and exposed
   as window.supabase (UMD build).
   ============================================================ */
(function () {
  'use strict';

  var cfg = window.SUPABASE_CONFIG;
  var client = null;
  var currentUser = null;
  var ready = false;          // initial getUser() resolved
  var authCbs = [];

  function available() {
    return !!(cfg && cfg.url && cfg.anonKey && window.supabase && window.supabase.createClient);
  }

  function emit() {
    authCbs.forEach(function (cb) { try { cb(currentUser); } catch (e) { /* ignore */ } });
  }

  function init() {
    if (client || !available()) return client;
    client = window.supabase.createClient(cfg.url, cfg.anonKey);
    client.auth.getUser().then(function (r) {
      currentUser = (r && r.data && r.data.user) || null;
      ready = true; emit();
    });
    client.auth.onAuthStateChange(function (_evt, session) {
      currentUser = session ? session.user : null;
      ready = true; emit();
    });
    return client;
  }

  // Register an auth listener. Fires immediately once we know the state.
  function onAuth(cb) {
    authCbs.push(cb);
    if (ready) cb(currentUser);
  }

  function user() { return currentUser; }
  function isReady() { return ready; }

  /* ---- Auth ---- */
  function signIn(email, password) { return client.auth.signInWithPassword({ email: email, password: password }); }
  function signUp(email, password) { return client.auth.signUp({ email: email, password: password }); }
  function signOut() { return client.auth.signOut(); }

  /* ---- Play sessions ---- */
  function listSessions() {
    return client.from('play_sessions')
      .select('id,title,updated_at,shared,group_id,owner')
      .order('updated_at', { ascending: false });
  }

  // rec: { id?, title, state, shared?, group_id? }
  function saveSession(rec) {
    var row = {
      title: rec.title,
      state: rec.state,
      owner: currentUser && currentUser.id,
      updated_at: new Date().toISOString()
    };
    if (rec.id) row.id = rec.id;
    if (rec.shared != null) row.shared = rec.shared;
    if (rec.group_id !== undefined) row.group_id = rec.group_id;
    return client.from('play_sessions').upsert(row).select().single();
  }

  function loadSession(id) {
    return client.from('play_sessions').select('*').eq('id', id).single();
  }

  function deleteSession(id) {
    return client.from('play_sessions').delete().eq('id', id);
  }

  // Realtime: watch one session's row for UPDATEs (for shared viewing).
  function subscribe(id, cb) {
    var ch = client.channel('play_' + id)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'play_sessions', filter: 'id=eq.' + id },
        function (payload) { cb(payload.new); })
      .subscribe();
    return ch;
  }
  function unsubscribe(ch) { if (ch && client) client.removeChannel(ch); }

  window.Cloud = {
    available: available, init: init, isReady: isReady,
    onAuth: onAuth, user: user,
    signIn: signIn, signUp: signUp, signOut: signOut,
    listSessions: listSessions, saveSession: saveSession,
    loadSession: loadSession, deleteSession: deleteSession,
    subscribe: subscribe, unsubscribe: unsubscribe,
    raw: function () { return client; }
  };
})();
