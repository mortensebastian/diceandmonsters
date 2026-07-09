/* ============================================================
   Dice & Monsters — Cloud Sync (collections)
   ------------------------------------------------------------
   Syncs a localStorage collection to Supabase for the Character,
   Adventure and Encounter pages. No UI of its own — sign-in is the
   global auth widget (auth-ui.js); this just moves data.

   Local-first: with no Supabase config it does nothing and the page
   runs on localStorage. Signed in, it merges the cloud copy with
   local (union by id; nothing is lost), keeps them in sync, and
   pushes local changes up (debounced).

   Page usage:
     CloudSync.attach({ kind:'characters', lsKey:'…', idKey:'id',
                        onRemoteChange: reloadAndRender });
   and call CloudSync.push('characters') after every local save.
   ============================================================ */
(function () {
  'use strict';

  var regs = {};

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

  function pullAndMerge(opts) {
    Cloud.getCollection(opts.kind).then(function (res) {
      if (res.error) return;
      var remote = (res.data && res.data.data) || [];
      var merged = mergeByKey(readLS(opts.lsKey), remote, opts.idKey);
      writeLS(opts.lsKey, merged);
      if (opts.onRemoteChange) opts.onRemoteChange();
      doPush(opts, merged);       // push the union so cloud gets local-only items
    });
  }
  function doPush(opts, data) {
    if (!Cloud.user()) return;
    Cloud.saveCollection(opts.kind, data).catch(function () { /* transient — retried on next change */ });
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
    Cloud.init();
    Cloud.onAuth(function (user) { if (user) pullAndMerge(opts); });
  }

  window.CloudSync = { attach: attach, push: push };
})();
