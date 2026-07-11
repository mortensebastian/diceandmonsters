/* ============================================================
   Dice & Monsters — Player Gameplay (player client)
   ------------------------------------------------------------
   The screen a player uses when a (human or AI) DM runs the game.
   It renders ONLY the role-scoped player view: revealed combatants,
   the fog-limited map, revealed areas (no secret notes), initiative,
   and the DM's narration.

   ARCHITECTURE RULE: this client never receives hidden information.
   Its only data source is the already-projected player view that the
   DM side publishes (localStorage `playerProjection` now; a Supabase
   player-readable column later). If that isn't present — e.g. you
   open this page on the same device you're DMing on — it falls back
   to projecting the local autosave THROUGH visibility.js, so even the
   fallback strips hidden monsters, traps, DM notes and monster stats
   before anything is rendered. The full snapshot is never retained.

   Player HP/inventory live on the character sheet (players have no HP
   counter in combat state), so "your character" is read from the local
   sheet — it is the player's own data, on the player's own device.
   ============================================================ */
(function () {
  'use strict';

  var PROJECTION_KEY = 'diceAndMonsters.playerProjection'; // safe view published by the DM
  var AUTOSAVE_KEY   = 'diceAndMonsters.playAutosave';     // full DM snapshot (same-device fallback)
  var SELF_KEY       = 'diceAndMonsters.playerSelfName';
  var CHARS_KEY      = 'diceAndMonsters.characters';

  var view = null;        // the ONLY combat state this client holds — already player-safe
  var selfName = '';
  var el = {};

  // Cloud (live multiplayer) state. When a cloud session is open, its
  // already-sanitized `view` is the source of truth; the full DM state is
  // never fetched here (RLS forbids it), so nothing hidden can arrive.
  var cloudView = null;
  var cloudSessionId = null;
  var cloudChannel = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function readLS(key) {
    try { var raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }

  /* ---- Source the player-safe view ---------------------------------- */
  // Source priority: a live cloud session (already sanitized server-side) →
  // the DM's locally-published projection → projecting the local autosave
  // ourselves (same-device demo). Every path yields a player-safe view.
  function loadView() {
    if (cloudView) return cloudView;
    var projected = readLS(PROJECTION_KEY);
    if (projected && projected.role === 'player') return projected;
    var raw = readLS(AUTOSAVE_KEY);
    if (raw && window.Visibility) return window.Visibility.playerView(raw, {});
    return null;
  }

  /* ---- Your own character (from the local sheet — your data) --------- */
  function myToken() {
    if (!view || !view.combatants) return null;
    var i, c;
    for (i = 0; i < view.combatants.length; i++) {
      c = view.combatants[i];
      if (c.kind === 'player' && String(c.name).toLowerCase() === selfName.toLowerCase()) return c;
    }
    return null;
  }
  function mySheet() {
    var chars = readLS(CHARS_KEY) || [];
    for (var i = 0; i < chars.length; i++) {
      if (String(chars[i].name || '').toLowerCase() === selfName.toLowerCase()) return chars[i];
    }
    return null;
  }

  /* ---- Rendering ---------------------------------------------------- */
  function renderSelfPicker() {
    var players = (view && view.combatants || []).filter(function (c) { return c.kind === 'player'; });
    var opts = ['<option value="">— pick your character —</option>'];
    players.forEach(function (c) {
      opts.push('<option value="' + esc(c.name) + '"' +
        (c.name.toLowerCase() === selfName.toLowerCase() ? ' selected' : '') + '>' + esc(c.name) + '</option>');
    });
    el.selfSelect.innerHTML = opts.join('');
  }

  function renderSelf() {
    var tok = myToken();
    if (!selfName || !tok) { el.self.hidden = true; return; }
    el.self.hidden = false;
    el.selfName.textContent = tok.name;

    var sheet = mySheet();
    // HP comes from your sheet (players track their own); fall back gracefully.
    var hp = sheet && sheet.hp ? sheet.hp : null;
    if (hp && hp.max) {
      var cur = (hp.current != null ? hp.current : hp.max);
      var pct = Math.max(0, Math.min(100, Math.round((cur / hp.max) * 100)));
      el.hpFill.style.width = pct + '%';
      el.hpFill.className = 'player-hp__fill' + (pct <= 25 ? ' is-low' : (pct <= 50 ? ' is-mid' : ''));
      el.hpText.textContent = cur + ' / ' + hp.max;
      el.hpFill.parentNode.parentNode.parentNode.hidden = false;
    } else {
      el.hpText.textContent = 'on your sheet';
      el.hpFill.style.width = '0%';
    }
    var ac = (sheet && sheet.ac != null && sheet.ac !== '') ? sheet.ac : (tok.ac != null ? tok.ac : '—');
    el.selfAc.textContent = ac;
    el.selfInit.textContent = (tok.initiative != null ? tok.initiative : '—');
    el.selfSheet.href = 'character.html';

    var conds = tok.conditions || [];
    el.selfConds.innerHTML = conds.length
      ? conds.map(function (c) { return '<span class="turn__cond">' + esc(c) + '</span>'; }).join('')
      : '<span class="player-none">No conditions.</span>';
  }

  function renderScene() {
    var sc = view && view.scene;
    if (!sc || !sc.readAloud) { el.scene.hidden = true; return; }
    el.scene.hidden = false;
    el.sceneTitle.textContent = sc.title || 'Scene';
    el.sceneTitle.hidden = !sc.title;
    el.sceneText.textContent = sc.readAloud;
  }

  function renderTurnOrder() {
    var list = (view && view.combatants || []).filter(function (c) { return c.initiative != null; });
    list.sort(function (a, b) { return (b.initiative - a.initiative) || (a.id - b.id); });
    if (!list.length) { el.tracker.hidden = true; return; }
    el.tracker.hidden = false;
    el.turn.innerHTML = list.map(function (c) {
      var active = (view.activeId != null && c.id === view.activeId);
      var mine = (c.kind === 'player' && c.name.toLowerCase() === selfName.toLowerCase());
      return '<div class="turn__row' + (active ? ' turn__row--active' : '') +
        (c.dead ? ' turn__row--dead' : '') + '">' +
        '<span class="turn__init">' + (c.initiative != null ? c.initiative : '–') + '</span>' +
        '<span class="turn__name">' + esc(c.name) + (mine ? ' <span class="player-you">you</span>' : '') + '</span>' +
        '<span class="turn__tag">' + esc(c.kind) + '</span>' +
      '</div>';
    }).join('');
  }

  function renderFoes() {
    var foes = (view && view.combatants || []).filter(function (c) {
      return c.kind !== 'player';
    });
    if (!foes.length) { el.foesWrap.hidden = true; return; }
    el.foesWrap.hidden = false;
    el.foes.innerHTML = foes.map(function (c) {
      var band = c.dead ? 'down' : (c.health || 'unknown');
      return '<div class="player-foe' + (c.dead ? ' is-down' : '') + '">' +
        '<span class="player-foe__dot player-foe__dot--' + esc(c.kind) + '"></span>' +
        '<span class="player-foe__name">' + esc(c.name) + '</span>' +
        '<span class="player-foe__band player-foe__band--' + band.replace(/\s+/g, '-') + '">' + esc(band) + '</span>' +
      '</div>';
    }).join('');
  }

  function renderChat() {
    var lines = (view && view.chatLog || []).filter(function (m) { return m.role === 'dm'; });
    el.chatEmpty.hidden = lines.length > 0;
    el.chat.innerHTML = lines.map(function (m) {
      return '<div class="ai__msg ai__msg--dm"><div class="ai__msg-text">' + esc(m.text) + '</div></div>';
    }).join('');
    el.chat.scrollTop = el.chat.scrollHeight;
  }

  function renderMap() {
    if (!window.Battlemap) return;
    window.Battlemap.setMode('view');
    window.Battlemap.setMap((view && view.map) || null);
    window.Battlemap.setCombatants((view && view.combatants) || []);
  }

  function renderAll() {
    renderSelfPicker();
    renderScene();
    renderSelf();
    renderMap();
    renderTurnOrder();
    renderFoes();
    renderChat();
    var connected = !!(view && (view.combatants.length || (view.chatLog && view.chatLog.length)));
    el.conn.textContent = connected ? '● live' : 'Waiting for the DM to start a session…';
    el.conn.className = 'player-conn' + (connected ? ' is-live' : '');
  }

  /* ---- Live refresh (poll + cross-tab storage events) --------------- */
  function refresh() {
    var next = loadView();
    view = next || { role: 'player', combatants: [], activeId: null, scene: null, chatLog: [], map: null };
    renderAll();
  }

  function initBattlemap() {
    var BM = window.Battlemap, canvas = document.querySelector('#battlemap-canvas');
    if (!BM || !canvas) return;
    BM.init({
      canvas: canvas,
      wrap: document.querySelector('#battlemap-wrap'),
      distanceEl: document.querySelector('#battlemap-dist'),
      onAreaSelect: showAreaCard
    });
    BM.setMode('view');
    el.areaCard = document.querySelector('#battlemap-area');
    if (el.areaCard) {
      el.areaCard.querySelector('.bm-areacard__close')
        .addEventListener('click', function () { el.areaCard.hidden = true; });
    }
  }

  // Players only ever see an area's read-aloud text — the projection
  // already stripped the DM notes, so there is nothing secret to leak.
  function showAreaCard(area) {
    if (!el.areaCard) return;
    if (!area) { el.areaCard.hidden = true; return; }
    el.areaCard.querySelector('.bm-areacard__title').textContent =
      'Area ' + area.n + (area.title ? ' — ' + area.title : '');
    var read = el.areaCard.querySelector('.bm-areacard__read');
    read.textContent = area.read || '';
    read.hidden = !area.read;
    el.areaCard.hidden = false;
  }

  /* ---- Cloud lobby: join the DM's live session --------------------- */
  function pcStatus(t) { if (el.pcStatus) el.pcStatus.textContent = t || ''; }

  function initCloud() {
    el.cloud = document.querySelector('#player-cloud');
    if (!el.cloud || !window.Cloud || !Cloud.available()) return;   // no cloud → local only
    el.cloud.hidden = false;
    el.pcSignin  = document.querySelector('#player-cloud-signin');
    el.pcPanel   = document.querySelector('#player-cloud-panel');
    el.pcCode    = document.querySelector('#player-join-code');
    el.pcSession = document.querySelector('#player-session');
    el.pcStatus  = document.querySelector('#player-cloud-status');
    el.pcOpen    = document.querySelector('.btn-player-open');
    el.pcLeave   = document.querySelector('.btn-player-leave');

    document.querySelector('.btn-player-join').addEventListener('click', doJoin);
    el.pcOpen.addEventListener('click', function () { if (el.pcSession.value) openSession(el.pcSession.value); });
    el.pcLeave.addEventListener('click', leaveSession);

    var deepLink = null;
    try { deepLink = new URLSearchParams(window.location.search).get('s'); } catch (e) { /* ignore */ }

    Cloud.init();
    Cloud.onAuth(function (user) {
      var signedIn = !!user;
      if (el.pcSignin) el.pcSignin.hidden = signedIn;
      if (el.pcPanel) el.pcPanel.hidden = !signedIn;
      if (signedIn) {
        refreshSessions(function () { if (deepLink) { openSession(deepLink); deepLink = null; } });
      }
    });
  }
  function refreshSessions(done) {
    Cloud.listPlayerViews().then(function (res) {
      if (res.error) { pcStatus(res.error.message); return; }
      var rows = res.data || [];
      el.pcSession.innerHTML = rows.length
        ? rows.map(function (r) { return '<option value="' + r.session_id + '">' + esc(r.title || 'Untitled') + '</option>'; }).join('')
        : '<option value="">No shared sessions yet</option>';
      el.pcSession.disabled = !rows.length;
      if (done) done();
    });
  }
  function doJoin() {
    var code = (el.pcCode.value || '').trim();
    if (!code) { pcStatus('Enter the invite code from your DM.'); return; }
    pcStatus('Joining…');
    Cloud.joinGroup(code).then(function (res) {
      if (res.error) { pcStatus(res.error.message); return; }
      el.pcCode.value = ''; pcStatus('Joined. Pick the session below.');
      refreshSessions();
    });
  }
  function openSession(id) {
    if (!id) return;
    pcStatus('Opening…');
    Cloud.loadPlayerView(id).then(function (res) {
      if (res.error) { pcStatus('Could not open: ' + res.error.message); return; }
      if (!res.data) { pcStatus('Not available — ask your DM to share, and make sure you joined the group.'); return; }
      cloudSessionId = id;
      cloudView = res.data.view || null;
      subscribeCloud(id);
      pcStatus('Live: “' + (res.data.title || 'session') + '”.');
      if (el.pcLeave) el.pcLeave.hidden = false;
      refresh();
    });
  }
  function subscribeCloud(id) {
    if (cloudChannel) { Cloud.unsubscribe(cloudChannel); cloudChannel = null; }
    cloudChannel = Cloud.subscribePlayerView(id, function (row) {
      cloudView = row ? row.view : null;
      refresh();
    });
  }
  function leaveSession() {
    if (cloudChannel) { Cloud.unsubscribe(cloudChannel); cloudChannel = null; }
    cloudSessionId = null; cloudView = null;
    if (el.pcLeave) el.pcLeave.hidden = true;
    pcStatus('Left the session.');
    refresh();
  }

  function init() {
    el.selfSelect = document.querySelector('#player-self-select');
    el.conn       = document.querySelector('#player-conn');
    el.scene      = document.querySelector('#player-scene');
    el.sceneTitle = document.querySelector('#player-scene-title');
    el.sceneText  = document.querySelector('#player-scene-text');
    el.self       = document.querySelector('#player-self');
    el.selfName   = document.querySelector('#player-self-name');
    el.selfSheet  = document.querySelector('#player-self-sheet');
    el.hpFill     = document.querySelector('#player-hp-fill');
    el.hpText     = document.querySelector('#player-hp-text');
    el.selfAc     = document.querySelector('#player-self-ac');
    el.selfInit   = document.querySelector('#player-self-init');
    el.selfConds  = document.querySelector('#player-self-conds');
    el.tracker    = document.querySelector('#player-tracker');
    el.turn       = document.querySelector('#player-turn');
    el.foesWrap   = document.querySelector('#player-foes-wrap');
    el.foes       = document.querySelector('#player-foes');
    el.chat       = document.querySelector('#player-chat');
    el.chatEmpty  = document.querySelector('#player-chat-empty');

    try { selfName = window.localStorage.getItem(SELF_KEY) || ''; } catch (e) { selfName = ''; }

    el.selfSelect.addEventListener('change', function () {
      selfName = el.selfSelect.value || '';
      try { window.localStorage.setItem(SELF_KEY, selfName); } catch (e) { /* ignore */ }
      renderSelf();
      renderTurnOrder();
    });

    initBattlemap();
    initCloud();
    refresh();

    // Live updates: cross-tab storage events (instant) + a slow poll.
    window.addEventListener('storage', function (ev) {
      if (!ev || ev.key === PROJECTION_KEY || ev.key === AUTOSAVE_KEY || ev.key === null) refresh();
    });
    window.setInterval(refresh, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
