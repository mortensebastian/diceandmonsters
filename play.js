/* ============================================================
   Dice & Monsters — Play (gameplay page)
   ------------------------------------------------------------
   The live table. Combatants arrive here from the Encounter
   Planner ("Start play session") or from a saved encounter, and
   this page runs the fight: initiative, turn order, attacks,
   damage/heal, conditions and the combat log.

   All the game math lives in combat-engine.js (window.DM); this
   file is only the gameplay UI + combat log.
   ============================================================ */
(function () {
  'use strict';

  var DM = window.DM;
  if (!DM) { return; }

  var SESSION_KEY = 'diceAndMonsters.playSession';   // handoff from the planner
  var ENCOUNTERS_KEY = 'diceAndMonsters.encounters'; // saved encounters (prep)

  var state = {
    combatants: [],
    activeId: null,
    editingInitId: null,
    editInitMode: 'd20',
    log: [],        // structured combat log ({text, cls, ts}) for the AI + persistence
    scene: null,    // optional { title, text } grounding for the AI DM
    chatLog: []     // AI DM chat bubbles ({role, text}) for display + persistence
  };

  var AUTOSAVE_KEY = 'diceAndMonsters.playAutosave';
  var saveTimer = null;
  var cloudSessionId = null;     // id of the active cloud session, if any
  var cloudSessionTitle = '';
  var cloudTimer = null;
  var cloudGroups = [];          // groups I belong to
  var viewerMode = false;        // watching someone else's shared session (read-only)
  var liveChannel = null;        // active realtime subscription

  var el = {};
  var statusTimer = null;
  var library = (window.MONSTER_DATA || []).slice(); // for the live "add monster" picker

  var esc = DM.esc, signed = DM.signed;

  /* ---- small local helpers that mirror the engine's needs ---- */
  function findCombatant(id) { return DM.findCombatant(state.combatants, id); }
  function label(c) { return DM.combatantLabel(c); }

  /* ---- Combat log ---- */
  function logLine(text, cls) {
    state.log.push({ text: text, cls: cls || '', ts: Date.now() });
    if (state.log.length > 300) state.log.shift();
    appendLogLine(text, cls);
    scheduleSave();
  }

  // DOM-only: insert a log line (newest on top). Used by logLine and on restore.
  function appendLogLine(text, cls) {
    var line = document.createElement('div');
    line.className = 'log__line' + (cls ? ' log__line--' + cls : '');
    line.textContent = text;
    el.log.insertBefore(line, el.log.firstChild);
  }

  /* ---- Autosave / restore (local; the same shape we'll sync to Supabase) ---- */
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistState, 400);
  }
  // The full serialized session — used for local autosave AND cloud saves.
  function snapshot() {
    return {
      v: 1,
      combatants: state.combatants.map(DM.serializeCombatant),
      activeId: state.activeId,
      log: state.log,
      scene: state.scene,
      chatLog: state.chatLog,
      aiMessages: aiMessages,
      map: window.Battlemap ? window.Battlemap.getMap() : null
    };
  }
  function persistState() {
    if (viewerMode) return;   // viewers never write
    var snap = snapshot();
    try { window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snap)); }
    catch (e) { /* storage full / blocked — stays in memory */ }
    publishPlayerView(snap);
    cloudAutosave();
  }
  // Publish the role-scoped PLAYER projection — the only combat state a
  // player client is ever given. Hidden creatures, DM notes, monster
  // stats, the raw log and AI transcript are stripped here, before this
  // leaves the DM's seat (localStorage now; a player-readable Supabase
  // column later). This is where the "hidden info is never sent" rule
  // is enforced at the data layer, not in the player UI.
  var PLAYER_VIEW_KEY = 'diceAndMonsters.playerProjection';
  function publishPlayerView(snap) {
    if (!window.Visibility) return;
    try {
      window.localStorage.setItem(PLAYER_VIEW_KEY,
        JSON.stringify(window.Visibility.playerView(snap, {})));
    } catch (e) { /* ignore */ }
  }
  function clearAutosave() {
    try { window.localStorage.removeItem(AUTOSAVE_KEY); } catch (e) { /* ignore */ }
  }
  function applySnapshot(data) {
    var combatants = (data.combatants || []).map(DM.deserializeCombatant);
    state.combatants = combatants;
    combatants.forEach(function (c) { DM.bumpIdPast(c.id); });
    state.activeId = (data.activeId != null) ? data.activeId : null;
    state.log = data.log || [];
    state.scene = data.scene || null;
    state.chatLog = data.chatLog || [];
    aiMessages = data.aiMessages || [];
    if (window.Battlemap) window.Battlemap.setMap(data.map || null);

    renderAll();
    renderTurnOrder();
    // Rebuild the combat log (state.log is oldest-first; insert keeps newest on top).
    el.log.innerHTML = '';
    state.log.forEach(function (e) { appendLogLine(e.text, e.cls); });
    // Rebuild the AI chat + scene field.
    if (el.aiOutput) {
      el.aiOutput.innerHTML = '';
      state.chatLog.forEach(function (m) { appendChatBubble(m.role, m.text); });
    }
    if (el.aiScene) el.aiScene.value = (state.scene && state.scene.text) || '';
  }
  function restoreState() {
    var raw;
    try { raw = window.localStorage.getItem(AUTOSAVE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return false; }
    if (!data) return false;
    if (!(data.combatants && data.combatants.length) && !(data.chatLog && data.chatLog.length)) return false;
    applySnapshot(data);
    return true;
  }

  function status(text) {
    if (!el.status) return;
    el.status.textContent = text;
    el.status.classList.add('save-status--show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { el.status.classList.remove('save-status--show'); }, 1400);
  }

  /* ---- Card rendering (ported, sourced from the engine) ---- */
  function hpClass(c) {
    var ratio = c.hp / c.maxHp;
    if (c.dead) return 'hpbar__fill--dead';
    if (ratio <= 0.33) return 'hpbar__fill--low';
    if (ratio <= 0.66) return 'hpbar__fill--mid';
    return '';
  }
  function hpBarHtml(c) {
    if (!DM.hasHp(c)) return '';
    var ratio = Math.round(c.hp / c.maxHp * 100);
    return '<div class="hpbar">' +
      '<div class="hpbar__fill ' + hpClass(c) + '" style="width:' + ratio + '%"></div>' +
      '<span class="hpbar__label">' + c.hp + ' / ' + c.maxHp + ' HP' +
        (c.dead ? ' &middot; DEAD' : '') + '</span>' +
    '</div>';
  }
  function attackButtonsHtml(c) {
    if (!c.attacks.length) return '';
    return '<div class="attacks">' + c.attacks.map(function (a, i) {
      var dice = a.sides > 0 ? (a.count + 'd' + a.sides) : '';
      var bonus = a.bonus ? signed(a.bonus) : '';
      var dmg = (dice + (dice && bonus ? ' ' : '') + bonus).trim() || '0';
      var tag = a.ranged ? ' &#10148;' : '';
      return '<button class="btn-attack" data-action="attack" data-attack="' + i + '">' +
        esc(a.name) + tag + '<span class="btn-attack__meta">' +
        signed(a.toHit) + ' to hit &middot; ' + dmg + ' ' + esc(a.type) + '</span></button>';
    }).join('') + '</div>';
  }
  function targetSelectHtml(c) {
    var others = state.combatants.filter(function (o) {
      return o.id !== c.id && !o.dead && DM.canBeTargeted(o);
    });
    if (!c.attacks.length) return '';
    var opts = '<option value="">- none / just roll -</option>';
    opts += others.map(function (o) {
      return '<option value="' + o.id + '">#' + o.id + ' ' + esc(o.name) +
        ' (AC ' + o.ac + ')</option>';
    }).join('');
    return '<label class="target">Target: <select data-role="target">' + opts + '</select></label>';
  }
  function manualHtml(c) {
    if (!DM.hasHp(c)) return '';
    return '<div class="manual">' +
      '<input type="number" min="0" class="manual__input" data-role="amount" placeholder="HP">' +
      '<button class="btn-damage" data-action="damage">Damage</button>' +
      '<button class="btn-heal" data-action="heal">Heal</button>' +
      '<button class="btn-remove" data-action="remove">Remove</button>' +
    '</div>';
  }
  function metaHtml(c) {
    var initTitle = c.initRoll != null
      ? ' title="d20 ' + c.initRoll + ', mod ' + signed(c.initMod) + '"' : '';
    var init = c.initiative != null
      ? '<span class="badge badge--init"' + initTitle + '>Init ' + c.initiative + '</span>' : '';
    if (c.kind === 'player') {
      var ac = c.ac != null ? '<span class="badge badge--ac">AC ' + c.ac + '</span>' : '';
      return '<span class="item__meta"><span class="badge badge--player">Player</span>' + ac + init + '</span>';
    }
    if (c.kind === 'npc') {
      return '<span class="item__meta"><span class="badge badge--npc">NPC</span>' +
        '<span class="badge badge--ac">AC ' + c.ac + '</span>' + init + '</span>';
    }
    var t = c.template || {};
    return '<span class="item__meta">' + esc(t.size || '') + ' ' + esc(t.type || '') +
      ' &middot; CR ' + esc(t.crLabel || '') + ' &middot; AC ' + c.ac +
      (t.acDesc ? ' (' + esc(t.acDesc) + ')' : '') + ' ' + init + '</span>';
  }
  function statsHtml(c) {
    if (c.kind !== 'monster' || !c.template) return '';
    var t = c.template;
    var stats = ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(function (k) {
      return k.toUpperCase() + ' ' + signed(DM.abilityMod(t[k]));
    }).join(' &middot; ');
    return '<div class="item__stats">' + stats + '</div>';
  }
  function conditionsHtml(c) {
    var chips = c.conditions.map(function (cond) {
      var info = DM.conditionInfo(cond);
      return '<span class="chip" data-action="remove-condition" data-cond="' +
        esc(cond) + '" title="' + esc(info || 'Custom condition') +
        ' (click to remove)">' + esc(cond) + ' &times;</span>';
    }).join('');
    var effects = c.conditions.map(function (cond) {
      var info = DM.conditionInfo(cond);
      return info ? '<li><b>' + esc(cond) + '</b> – ' + esc(info) + '</li>' : '';
    }).filter(Boolean).join('');
    var effectsHtml = effects ? '<ul class="cond-effects">' + effects + '</ul>' : '';
    return '<div class="conditions">' +
      '<span class="conditions__label">Conditions:</span>' +
      '<span class="conditions__chips">' +
        (chips || '<span class="conditions__none">none</span>') +
      '</span>' +
      '<input class="conditions__input" data-role="condition" list="conditions-list" placeholder="add…">' +
      '<button class="btn-cond" data-action="add-condition">+</button>' +
    '</div>' + effectsHtml;
  }
  function playerControlsHtml(c) {
    return '<div class="manual">' +
      '<label class="ac-edit">AC <input type="number" min="0" ' +
        'class="manual__input manual__input--ac" data-role="ac" ' +
        'value="' + (c.ac != null ? c.ac : '') + '" placeholder="–"></label>' +
      '<button class="btn-set-ac" data-action="set-ac">Set AC</button>' +
      '<button class="btn-remove" data-action="remove">Remove</button>' +
    '</div>';
  }
  // Per-creature visibility toggle. Players never receive a hidden
  // creature (it's stripped in visibility.js before the projection is
  // published) — this is not a UI hide, it controls what's sent.
  function revealToggleHtml(c) {
    if (c.kind === 'player') return '';
    var shown = !c.hidden;
    return '<button class="item__reveal ' + (shown ? 'is-shown' : 'is-hidden') +
      '" data-action="toggle-hidden" title="' +
      (shown ? 'Visible to players — click to hide' : 'Hidden from players — click to reveal') +
      '">' + (shown ? '👁 shown' : '🙈 hidden') + '</button>';
  }
  function cardHtml(c) {
    var active = c.id === state.activeId ? ' item--active' : '';
    var dead = c.dead ? ' item--dead' : '';
    var kindCls = ' item--' + c.kind;
    var inner = c.kind === 'player'
      ? playerControlsHtml(c)
      : (targetSelectHtml(c) + attackButtonsHtml(c) + manualHtml(c));
    var controls = '<div class="item__controls">' + inner + conditionsHtml(c) + '</div>';
    return '' +
      '<div class="item' + kindCls + active + dead + '" data-id="' + c.id + '">' +
        '<div class="item__head">' +
          '<span class="item__name">#' + c.id + ' ' + esc(c.name) + '</span>' +
          metaHtml(c) + revealToggleHtml(c) +
        '</div>' +
        hpBarHtml(c) + statsHtml(c) + controls +
      '</div>';
  }

  function renderAll() {
    if (!state.combatants.length) {
      el.list.innerHTML = '<p class="empty">No combatants at the table. ' +
        'Build one in the <a href="encounter.html">Encounter Planner</a> and press ' +
        '“Start play session”, or load a saved encounter above.</p>';
    } else {
      el.list.innerHTML = state.combatants.map(cardHtml).join('');
    }
    var alive = state.combatants.filter(function (c) { return !c.dead; }).length;
    el.encMeta.textContent = state.combatants.length
      ? (state.combatants.length + ' at the table - ' + alive + ' alive') : '';
    syncBattlemap();
  }

  // Push the live roster to the battlemap and keep it locked for viewers.
  function syncBattlemap() {
    if (!window.Battlemap) return;
    window.Battlemap.setMode(viewerMode ? 'view' : 'play');
    window.Battlemap.setCombatants(state.combatants);
  }

  function renderTurnOrder() {
    if (!state.combatants.length) {
      el.turnOrder.innerHTML = '<p class="turn__hint">Nothing at the table yet.</p>';
      el.nextBtn.disabled = true;
      return;
    }
    el.nextBtn.disabled = !state.combatants.some(function (c) { return c.initiative != null; });

    el.turnOrder.innerHTML = DM.trackerOrder(state.combatants).map(function (c) {
      var cls = 'turn__row';
      if (c.id === state.activeId) cls += ' turn__row--active';
      if (c.dead) cls += ' turn__row--dead';

      var initGroup;
      if (c.id === state.editingInitId) {
        var mode = state.editInitMode;
        var curVal = mode === 'total'
          ? (c.initiative != null ? c.initiative : '')
          : (c.initRoll != null ? c.initRoll : '');
        var modChip = mode === 'd20'
          ? '<span class="turn__initmod" title="initiative modifier">' + signed(c.initMod) + '</span>' : '';
        var toggle = '<span class="init-mode">' +
          '<button class="' + (mode === 'd20' ? 'active' : '') + '" data-action="init-mode" data-mode="d20" title="Enter the d20 roll; the modifier is added">d20</button>' +
          '<button class="' + (mode === 'total' ? 'active' : '') + '" data-action="init-mode" data-mode="total" title="Enter the final initiative directly">Total</button>' +
        '</span>';
        initGroup = '<span class="turn__initgroup">' +
          '<input type="number" class="turn__init-input" data-role="track-init" ' +
            'value="' + curVal + '" placeholder="' + (mode === 'total' ? 'total' : 'd20') + '" ' +
            'title="' + (mode === 'total' ? 'final initiative' : 'd20 roll') + '">' +
          modChip + toggle +
          '<button class="btn-track-save" data-action="save-init" title="Save" aria-label="Save">&#10003;</button>' +
        '</span>';
      } else {
        var brk = c.initRoll != null
          ? '<span class="turn__initbreak" title="d20 ' + c.initRoll + ' + initiative modifier ' +
              signed(c.initMod) + '">(' + esc(DM.initBreakdown(c)) + ')</span>' : '';
        initGroup = '<span class="turn__initgroup">' +
          '<span class="turn__init">' + (c.initiative != null ? c.initiative : '–') + '</span>' +
          brk +
          '<button class="btn-track-edit" data-action="edit-init" title="Edit initiative" aria-label="Edit initiative">&#9998;</button>' +
        '</span>';
      }

      var conds = c.conditions.length
        ? '<span class="turn__cond">' + c.conditions.map(esc).join(', ') + '</span>' : '';

      return '<div class="' + cls + '" data-id="' + c.id + '">' +
        initGroup +
        '<span class="turn__name">' + esc(c.name) + '</span>' +
        conds +
        '<span class="turn__tag">' + (c.kind === 'player' ? 'player' : c.kind) +
          (c.dead ? ' &middot; dead' : '') + '</span>' +
      '</div>';
    }).join('');

    var input = el.turnOrder.querySelector('input[data-role="track-init"]');
    if (input) { input.focus(); input.select(); }
  }

  function refreshCard(c) {
    var node = el.list.querySelector('.item[data-id="' + c.id + '"]');
    if (!node || !DM.hasHp(c)) return;
    node.classList.toggle('item--dead', c.dead);
    var fill = node.querySelector('.hpbar__fill');
    if (fill) {
      fill.style.width = Math.round(c.hp / c.maxHp * 100) + '%';
      fill.className = 'hpbar__fill ' + hpClass(c);
    }
    var lbl = node.querySelector('.hpbar__label');
    if (lbl) lbl.textContent = c.hp + ' / ' + c.maxHp + ' HP' + (c.dead ? ' · DEAD' : '');
    var alive = state.combatants.filter(function (x) { return !x.dead; }).length;
    el.encMeta.textContent = state.combatants.length + ' at the table - ' + alive + ' alive';
    renderTurnOrder();
  }
  function rerenderCard(c) {
    var node = el.list.querySelector('.item[data-id="' + c.id + '"]');
    if (node) node.outerHTML = cardHtml(c);
  }
  function updateActiveHighlight() {
    var nodes = el.list.querySelectorAll('.item');
    for (var i = 0; i < nodes.length; i++) {
      var id = parseInt(nodes[i].getAttribute('data-id'), 10);
      nodes[i].classList.toggle('item--active', id === state.activeId);
    }
  }

  /* ---- Combat actions (log lines built here from engine results) ---- */
  // Resolve an attack, write the combat log, and RETURN a summary string
  // (used both by the human attack buttons and the AI DM's monster_action tool).
  function performAttack(attacker, attack, target) {
    var r = DM.resolveAttack(attacker, attack, target);
    var who = label(attacker) + ' uses ' + attack.name;
    var vs = target ? (' on ' + label(target)) : '';
    var summary, cls;

    if (r.alreadyDead) {
      summary = label(attacker) + ' attacks ' + label(target) + ', but it is already dead.';
      logLine(summary, 'miss');
      return summary;
    }
    if (!r.hit) {
      var why = r.fumble ? 'Critical miss!' : ('rolled ' + r.toHit + ' vs AC ' + target.ac + ' - miss.');
      summary = who + vs + ': ' + why;
      logLine(summary, 'miss');
      return summary;
    }
    var hitTxt = r.crit ? 'CRITICAL HIT!' :
      ('rolled ' + r.toHit + (target ? ' vs AC ' + target.ac : '') + ' - hit.');
    var dmgTxt = r.dmg + ' ' + (attack.type || '') + ' damage';

    if (r.appliedDamage) {
      var st = r.killed ? (' ' + label(target) + ' DIES!') : (' (' + target.hp + '/' + target.maxHp + ' HP left)');
      summary = who + vs + ': ' + hitTxt + ' ' + dmgTxt + '.' + st;
      cls = r.killed ? 'kill' : 'hit';
      refreshCard(target);
    } else if (target) {
      summary = who + vs + ': ' + hitTxt + ' ' + dmgTxt + ' - ' + label(target) + ' tracks the damage themselves.';
      cls = 'hit';
    } else {
      summary = who + ': ' + hitTxt + ' ' + dmgTxt + '.';
      cls = 'hit';
    }
    logLine(summary, cls);
    return summary;
  }

  function rollInitiative() {
    if (viewerMode || !state.combatants.length) return;
    var order = DM.rollInitiativeAll(state.combatants);
    logLine('--- Initiative rolled ---', 'turn');
    order.forEach(function (c) {
      logLine(label(c) + ': ' + c.initiative + DM.initLogBreak(c), 'turn');
    });
    var alive = DM.orderedAlive(state.combatants);
    state.activeId = alive.length ? alive[0].id : null;
    renderAll();
    renderTurnOrder();
    if (state.activeId) logLine('First up: ' + label(findCombatant(state.activeId)) + '.', 'turn');
  }

  function nextTurn() {
    if (viewerMode) return;
    var res = DM.nextTurnId(state.combatants, state.activeId);
    if (res.id == null) { state.activeId = null; return; }
    if (res.newRound) logLine('--- New round ---', 'turn');
    state.activeId = res.id;
    logLine('Turn: ' + label(findCombatant(state.activeId)) + '.', 'turn');
    updateActiveHighlight();
    renderTurnOrder();
  }

  function removeCombatant(id) {
    var c = findCombatant(id);
    state.combatants = state.combatants.filter(function (x) { return x.id !== id; });
    if (state.activeId === id) {
      var order = DM.orderedAlive(state.combatants);
      state.activeId = order.length ? order[0].id : null;
    }
    renderAll();
    renderTurnOrder();
    if (c) logLine(label(c) + ' removed.', 'spawn');
  }

  function clearTable() {
    if (viewerMode || !state.combatants.length) return;
    if (!window.confirm('Clear the table? This removes all combatants from play.')) return;
    state.combatants = [];
    state.activeId = null;
    renderAll();
    renderTurnOrder();
    logLine('Table cleared.', 'spawn');
  }

  /* ---- Card + tracker event handling ---- */
  function readTarget(cardNode) {
    var sel = cardNode.querySelector('select[data-role="target"]');
    var id = sel && sel.value ? parseInt(sel.value, 10) : NaN;
    return isNaN(id) ? null : findCombatant(id);
  }
  function readAmount(cardNode) {
    var input = cardNode.querySelector('input[data-role="amount"]');
    var v = parseInt(input && input.value, 10);
    return isNaN(v) || v < 0 ? 0 : v;
  }
  function onListClick(ev) {
    if (viewerMode) return;
    var btn = ev.target.closest('[data-action]');
    if (!btn) return;
    var cardNode = btn.closest('.item');
    var id = parseInt(cardNode.getAttribute('data-id'), 10);
    var c = findCombatant(id);
    if (!c) return;
    var action = btn.getAttribute('data-action');

    if (action === 'attack') {
      var attack = c.attacks[parseInt(btn.getAttribute('data-attack'), 10)];
      performAttack(c, attack, readTarget(cardNode));
    } else if (action === 'damage') {
      var dmg = readAmount(cardNode);
      if (dmg > 0) {
        DM.applyDamage(c, dmg);
        logLine(label(c) + ' takes ' + dmg + ' damage.' +
          (c.dead ? ' It DIES!' : ' (' + c.hp + '/' + c.maxHp + ' HP)'), c.dead ? 'kill' : 'hit');
        refreshCard(c);
      }
    } else if (action === 'heal') {
      var amt = readAmount(cardNode);
      if (amt > 0) {
        DM.applyHeal(c, amt);
        logLine(label(c) + ' heals ' + amt + ' HP (' + c.hp + '/' + c.maxHp + ').', 'heal');
        refreshCard(c);
      }
    } else if (action === 'set-ac') {
      var acInput = cardNode.querySelector('input[data-role="ac"]');
      var rawAc = (acInput && acInput.value || '').trim();
      var ac = parseInt(rawAc, 10);
      c.ac = (rawAc === '' || isNaN(ac) || ac < 0) ? null : ac;
      logLine(label(c) + (c.ac != null ? ' now has AC ' + c.ac + ' - can be targeted.' : ' has no AC set.'), 'spawn');
      renderAll();
      renderTurnOrder();
    } else if (action === 'add-condition') {
      var condInput = cardNode.querySelector('input[data-role="condition"]');
      if (DM.addCondition(c, condInput && condInput.value)) {
        var added = c.conditions[c.conditions.length - 1];
        var info = DM.conditionInfo(added);
        logLine(label(c) + ' is now ' + added + (info ? ' - ' + info : '') + '.', 'spawn');
        rerenderCard(c);
        renderTurnOrder();
      }
    } else if (action === 'remove-condition') {
      DM.removeCondition(c, btn.getAttribute('data-cond'));
      rerenderCard(c);
      renderTurnOrder();
    } else if (action === 'toggle-hidden') {
      DM.setHidden(c, !c.hidden);
      logLine(label(c) + (c.hidden ? ' is now hidden from players.' : ' is revealed to players.'), 'spawn');
      rerenderCard(c);
      persistState();   // republish the player projection immediately
    } else if (action === 'remove') {
      removeCombatant(id);
    }
  }

  function commitTrackInit(c) {
    var input = el.turnOrder.querySelector(
      '.turn__row[data-id="' + c.id + '"] input[data-role="track-init"]');
    var raw = (input && input.value || '').trim();
    var n = parseInt(raw, 10);
    if (raw === '' || isNaN(n)) {
      c.initRoll = null; c.initiative = null;
    } else if (state.editInitMode === 'total') {
      c.initRoll = null; c.initiative = n;
    } else {
      DM.setInitiative(c, n);
    }
    state.editingInitId = null;
    logLine(label(c) + (c.initiative != null
      ? ' now has initiative ' + c.initiative + DM.initLogBreak(c) + '.'
      : ' removed from the initiative order.'), 'turn');
    rerenderCard(c);
    renderTurnOrder();
  }
  function onTrackClick(ev) {
    if (viewerMode) return;
    var btn = ev.target.closest('[data-action]');
    if (!btn) return;
    var id = parseInt(btn.closest('.turn__row').getAttribute('data-id'), 10);
    var c = findCombatant(id);
    if (!c) return;
    var action = btn.getAttribute('data-action');
    if (action === 'edit-init') {
      state.editingInitId = id;
      state.editInitMode = 'd20';
      renderTurnOrder();
    } else if (action === 'save-init') {
      commitTrackInit(c);
    } else if (action === 'init-mode') {
      var inp = btn.closest('.turn__row').querySelector('input[data-role="track-init"]');
      var keep = inp ? inp.value : '';
      state.editInitMode = btn.getAttribute('data-mode');
      renderTurnOrder();
      var inp2 = el.turnOrder.querySelector('.turn__row[data-id="' + id + '"] input[data-role="track-init"]');
      if (inp2) inp2.value = keep;
    }
  }
  function onTrackKeydown(ev) {
    if (!ev.target.matches || !ev.target.matches('input[data-role="track-init"]')) return;
    var id = parseInt(ev.target.closest('.turn__row').getAttribute('data-id'), 10);
    if (ev.key === 'Enter') {
      ev.preventDefault();
      var c = findCombatant(id);
      if (c) commitTrackInit(c);
    } else if (ev.key === 'Escape') {
      state.editingInitId = null;
      renderTurnOrder();
    }
  }
  function onListKeydown(ev) {
    if (ev.key !== 'Enter') return;
    var input = ev.target;
    if (!input.matches || !input.matches('input[data-role]')) return;
    var action = { ac: 'set-ac', condition: 'add-condition', amount: 'damage' }[input.getAttribute('data-role')];
    if (!action) return;
    var btn = input.closest('.item').querySelector('button[data-action="' + action + '"]');
    if (btn) { ev.preventDefault(); btn.click(); }
  }

  /* ---- Loading combatants into play ---- */
  function loadCombatantList(serialized, sourceName) {
    state.combatants = (serialized || []).map(DM.deserializeCombatant);
    state.combatants.forEach(function (c) { DM.bumpIdPast(c.id); });
    state.activeId = null;
    state.editingInitId = null;
    renderAll();
    renderTurnOrder();
    logLine('Loaded ' + state.combatants.length + ' combatant' +
      (state.combatants.length === 1 ? '' : 's') +
      (sourceName ? ' from "' + sourceName + '"' : '') + '.', 'spawn');
  }

  // Load a handoff from the planner (serialized combatants) OR from an
  // adventure scene (monsters by slug + scene text for the AI DM).
  function loadHandoff(data) {
    var combatants = [];
    if (data.combatants && data.combatants.length) {
      combatants = data.combatants.map(DM.deserializeCombatant);
    } else if (data.monsters && data.monsters.length) {
      data.monsters.forEach(function (m) {
        var tpl = DM.templateBySlug(m.slug);
        if (!tpl) return;
        var n = m.count || 1;
        for (var i = 0; i < n; i++) combatants.push(DM.createMonster(tpl));
      });
    }
    state.combatants = combatants;
    combatants.forEach(function (c) { DM.bumpIdPast(c.id); });
    state.activeId = null;
    state.editingInitId = null;

    // The planner / adventure ships the map it was built on; adopt it (or a
    // clean default when there is none) so the fight starts on the right map.
    if (window.Battlemap) window.Battlemap.setMap(data.map || null);

    if (data.scene) {
      state.scene = { title: data.scene.title || '', text: data.scene.text || '' };
      if (el.aiScene) el.aiScene.value = state.scene.text || '';
    }

    renderAll();
    renderTurnOrder();
    var src = data.name ? ' from "' + data.name + '"' : '';
    logLine('Loaded ' + combatants.length + ' combatant' +
      (combatants.length === 1 ? '' : 's') + src + '.', 'spawn');
    if (data.scene) {
      logLine('Scene "' + (data.scene.title || 'scene') + '" loaded into the AI DM. ' +
        'Press “Describe scene” to begin.', 'turn');
    }
  }

  function readSessionHandoff() {
    var raw;
    try { raw = window.localStorage.getItem(SESSION_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try { window.localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function loadSavedEncounters() {
    try { return JSON.parse(window.localStorage.getItem(ENCOUNTERS_KEY)) || []; }
    catch (e) { return []; }
  }
  function populateSavedSelect() {
    var saved = loadSavedEncounters();
    if (!saved.length) {
      el.loadSelect.innerHTML = '<option value="">No saved encounters</option>';
      el.loadBtn.disabled = true;
      return;
    }
    el.loadBtn.disabled = false;
    el.loadSelect.innerHTML = saved.map(function (s, i) {
      return '<option value="' + i + '">' + esc(s.name) + '</option>';
    }).join('');
  }
  function loadSelectedEncounter() {
    var saved = loadSavedEncounters();
    var i = parseInt(el.loadSelect.value, 10);
    var entry = saved[i];
    if (!entry) return;
    if (state.combatants.length &&
        !window.confirm('Load "' + entry.name + '"? This replaces what is on the table.')) return;
    loadCombatantList(entry.combatants, entry.name);
    status('Loaded');
  }

  /* ---- Add combatants mid-session ---- */
  // If combat is already underway, give the newcomer an initiative now.
  function rollInitiativeIfActive(c) {
    var inProgress = state.combatants.some(function (x) {
      return x.id !== c.id && x.initiative != null;
    });
    if (inProgress) {
      DM.setInitiative(c, DM.rollDie(20));
      logLine(label(c) + ' rolls initiative ' + c.initiative + DM.initLogBreak(c) + '.', 'turn');
    }
  }

  function addCombatant(c, note) {
    if (viewerMode) return;
    state.combatants.push(c);
    rollInitiativeIfActive(c);
    renderAll();
    renderTurnOrder();
    logLine(label(c) + ' joins the fight' + (note ? ' ' + note : '') + '.', 'spawn');
  }

  function populateMonsterSelect() {
    var q = (el.monsterSearch.value || '').trim().toLowerCase();
    var matches = library.filter(function (m) {
      return !q || m.name.toLowerCase().indexOf(q) !== -1;
    });
    el.monsterSelect.innerHTML = matches.map(function (m) {
      return '<option value="' + m.slug + '">' + esc(m.name) +
        '  (CR ' + esc(m.crLabel) + ')</option>';
    }).join('');
    el.monsterCount.textContent = matches.length + ' of ' + library.length + ' monsters';
    el.addMonsterBtn.disabled = matches.length === 0;
  }

  function addMonsterBySlug(slug) {
    var tpl = DM.templateBySlug(slug);
    if (!tpl) return;
    var c = DM.createMonster(tpl);
    addCombatant(c, '(' + c.maxHp + ' HP, AC ' + c.ac + ')');
  }

  function submitPlayer() {
    var name = (el.playerName.value || '').trim();
    if (!name) return;
    var initMod = parseInt(el.playerInit.value, 10);
    var ac = parseInt(el.playerAc.value, 10);
    var c = DM.createPlayer(name, isNaN(initMod) ? 0 : initMod, isNaN(ac) ? null : ac);
    var extra = [];
    if (!isNaN(initMod) && initMod) extra.push('init ' + signed(initMod));
    if (!isNaN(ac)) extra.push('AC ' + ac);
    addCombatant(c, extra.length ? '(' + extra.join(', ') + ')' : '');
    el.playerName.value = ''; el.playerInit.value = ''; el.playerAc.value = '';
    el.playerName.focus();
  }

  function loadCharacters() {
    try { return JSON.parse(window.localStorage.getItem('diceAndMonsters.characters')) || []; }
    catch (e) { return []; }
  }
  function populateCharImport() {
    if (!el.charImport) return;
    var sheets = loadCharacters();
    if (!sheets.length) {
      el.charImport.innerHTML = '<option value="">No saved characters</option>';
      el.importCharBtn.disabled = true;
      return;
    }
    el.importCharBtn.disabled = false;
    function opt(s) { return '<option value="' + s.id + '">' + esc(s.name || 'Unnamed') + '</option>'; }
    var pcs = sheets.filter(function (s) { return (s.category || 'pc') === 'pc'; });
    var npcs = sheets.filter(function (s) { return s.category === 'npc'; });
    var html = '';
    if (pcs.length) html += '<optgroup label="My characters">' + pcs.map(opt).join('') + '</optgroup>';
    if (npcs.length) html += '<optgroup label="NPCs">' + npcs.map(opt).join('') + '</optgroup>';
    el.charImport.innerHTML = html;
  }
  function addCharacterFromSheet(id) {
    var sheets = loadCharacters(), sheet = null;
    for (var i = 0; i < sheets.length; i++) if (sheets[i].id === id) sheet = sheets[i];
    if (!sheet) return;
    var isNpc = sheet.category === 'npc';
    var c = isNpc ? DM.createNpcFromSheet(sheet) : DM.createPlayerFromSheet(sheet);
    var note = isNpc
      ? '(NPC, ' + c.maxHp + ' HP, AC ' + c.ac + ')'
      : '(player, AC ' + (c.ac != null ? c.ac : '–') + ')';
    addCombatant(c, note);
  }

  /* ---- AI Dungeon Master (Phase 2: conversation + tool use) ---- */
  var aiBusy = false;
  var aiMessages = [];           // the ongoing Anthropic conversation
  var MAX_TOOL_ITERS = 8;

  function aiStatus(text) { if (el.aiStatus) el.aiStatus.textContent = text || ''; }

  function appendChatBubble(role, text) {
    if (!text) return;
    var block = document.createElement('div');
    block.className = 'ai__msg ai__msg--' + role;
    // DM lines get a ▶ replay button so ElevenLabs can read them aloud again.
    if (role === 'dm' && window.Voice && Voice.hasKey()) {
      var span = document.createElement('span');
      span.className = 'ai__msg-text';
      span.textContent = text;
      block.appendChild(span);
      var replay = document.createElement('button');
      replay.type = 'button';
      replay.className = 'btn-ai-replay';
      replay.textContent = '▶';
      replay.title = 'Read this aloud';
      replay.addEventListener('click', function () {
        aiStatus('Speaking…');
        Voice.speak(text)
          .then(function () { aiStatus(''); })
          .catch(function (e) { aiStatus((e && e.message) || 'Voice error.'); });
      });
      block.appendChild(replay);
    } else {
      block.textContent = text;
    }
    el.aiOutput.appendChild(block);
    el.aiOutput.scrollTop = el.aiOutput.scrollHeight;
  }
  function renderChat(role, text) {
    if (!text) return;
    appendChatBubble(role, text);
    state.chatLog.push({ role: role, text: text });
    // Read new DM narration aloud when voice is on (never the player's own lines).
    if (role === 'dm' && window.Voice && Voice.isAuto() && Voice.hasKey() && !viewerMode) {
      Voice.enqueue(text).catch(function (e) { aiStatus((e && e.message) || 'Voice error.'); });
    }
    scheduleSave();
  }

  function setAiBusy(busy) {
    aiBusy = busy;
    [el.aiSceneBtn, el.aiRoundBtn, el.aiSendBtn].forEach(function (b) { if (b) b.disabled = busy; });
    if (el.aiInput) el.aiInput.disabled = busy;
  }

  function toolResult(id, text, isError) {
    return { type: 'tool_result', tool_use_id: id, content: String(text), is_error: !!isError };
  }

  // Execute one Claude tool call against the real engine. Validates first,
  // returns a tool_result the model reads back (errors included, so it retries).
  function executeToolCall(block) {
    var input = block.input || {};
    var id = block.id;
    try {
      if (block.name === 'add_combatants') {
        var specs = input.creatures;
        if (!Array.isArray(specs) || !specs.length) {
          return toolResult(id, 'Provide a non-empty "creatures" array.', true);
        }
        var added = [], notes = [];
        specs.forEach(function (spec) {
          if (!spec || !spec.name) { notes.push('Skipped a creature with no name.'); return; }
          var n = Math.max(1, Math.min(20, parseInt(spec.count, 10) || 1));
          var tpl = spec.fromLibrary ? DM.templateByName(spec.name) : null;
          if (spec.fromLibrary && !tpl) {
            notes.push('No library monster matched "' + spec.name +
              '"; used the custom stats you gave (or defaults — hp 1, ac 10, no attacks).');
          }
          for (var i = 0; i < n; i++) {
            var c = tpl ? DM.createMonster(tpl) : DM.createCustomCreature(spec);
            addCombatant(c, '(' + c.maxHp + ' HP, AC ' + c.ac + ')');
            added.push(c);
          }
        });
        if (!added.length) return toolResult(id, notes.join(' ') || 'Nothing was added.', true);
        renderAll();
        var lines = added.map(function (c) {
          return label(c) + ' — ' + c.maxHp + ' HP, AC ' + c.ac +
            (c.attacks && c.attacks.length
              ? ', attacks: ' + c.attacks.map(function (a) { return a.name; }).join(', ')
              : ', no attacks');
        });
        return toolResult(id, 'Added to the table:\n' + lines.join('\n') +
          (notes.length ? '\n\n' + notes.join(' ') : ''));
      }
      if (block.name === 'roll_initiative') {
        if (!state.combatants.length) {
          return toolResult(id, 'No combatants on the table yet — add some first with add_combatants.', true);
        }
        rollInitiative();
        var ord = DM.orderedAlive(state.combatants).map(function (c) {
          return label(c) + ' (init ' + c.initiative + ')';
        });
        var first = state.activeId != null ? findCombatant(state.activeId) : null;
        return toolResult(id, 'Initiative rolled. Order: ' + (ord.join(', ') || '(nobody)') + '.' +
          (first ? ' First turn: ' + label(first) + '.' : ''));
      }
      if (block.name === 'monster_action') {
        var attacker = findCombatant(input.combatantId);
        if (!attacker) return toolResult(id, 'No combatant with id ' + input.combatantId + '.', true);
        if (attacker.kind === 'player') return toolResult(id, label(attacker) + ' is a player character — you cannot act for it.', true);
        var attack = attacker.attacks && attacker.attacks[input.attackIndex];
        if (!attack) return toolResult(id, label(attacker) + ' has no attack at index ' + input.attackIndex + '.', true);
        var target = (input.targetId != null) ? findCombatant(input.targetId) : null;
        if (input.targetId != null && !target) return toolResult(id, 'No target with id ' + input.targetId + '.', true);
        if (input.say) renderChat('dm', input.say);
        var summary = performAttack(attacker, attack, target);
        renderAll();
        return toolResult(id, summary);
      }
      if (block.name === 'set_condition') {
        var c = findCombatant(input.combatantId);
        if (!c) return toolResult(id, 'No combatant with id ' + input.combatantId + '.', true);
        if (input.mode === 'remove') {
          DM.removeCondition(c, input.condition);
          logLine(label(c) + ' is no longer ' + input.condition + '.', 'spawn');
        } else {
          DM.addCondition(c, input.condition);
          logLine(label(c) + ' is now ' + input.condition + '.', 'spawn');
        }
        rerenderCard(c); renderTurnOrder();
        return toolResult(id, label(c) + ' conditions: ' + (c.conditions.join(', ') || 'none') + '.');
      }
      if (block.name === 'apply_damage') {
        var t = findCombatant(input.combatantId);
        if (!t) return toolResult(id, 'No combatant with id ' + input.combatantId + '.', true);
        if (!DM.hasHp(t)) return toolResult(id, label(t) + ' has no HP counter (a player tracks their own HP).', true);
        DM.applyDamage(t, input.amount);
        var sd = label(t) + ' takes ' + input.amount + ' damage' + (input.note ? ' (' + input.note + ')' : '') + '. ' +
          (t.dead ? 'It DIES!' : '(' + t.hp + '/' + t.maxHp + ' HP)');
        logLine(sd, t.dead ? 'kill' : 'hit'); refreshCard(t);
        return toolResult(id, sd);
      }
      if (block.name === 'apply_heal') {
        var h = findCombatant(input.combatantId);
        if (!h) return toolResult(id, 'No combatant with id ' + input.combatantId + '.', true);
        if (!DM.hasHp(h)) return toolResult(id, label(h) + ' has no HP counter.', true);
        DM.applyHeal(h, input.amount);
        var sh = label(h) + ' heals ' + input.amount + (input.note ? ' (' + input.note + ')' : '') + '. (' + h.hp + '/' + h.maxHp + ' HP)';
        logLine(sh, 'heal'); refreshCard(h);
        return toolResult(id, sh);
      }
      if (block.name === 'move_token') {
        var mv = findCombatant(input.combatantId);
        if (!mv) return toolResult(id, 'No combatant with id ' + input.combatantId + '.', true);
        if (!window.Battlemap) return toolResult(id, 'There is no battlemap in this session.', true);
        var sz = window.Battlemap.size();
        var nx = parseInt(input.x, 10), ny = parseInt(input.y, 10);
        if (isNaN(nx) || isNaN(ny) || nx < 0 || ny < 0 || nx >= sz.cols || ny >= sz.rows) {
          return toolResult(id, 'Cell ' + input.x + ',' + input.y + ' is off the ' + sz.cols + '×' + sz.rows + ' map.', true);
        }
        var from = (mv.x != null && mv.y != null) ? (mv.x + ',' + mv.y) : 'off-map';
        mv.x = nx; mv.y = ny;
        if (input.say) renderChat('dm', input.say);
        renderAll();   // re-syncs the battlemap
        logLine(label(mv) + ' moves to ' + nx + ',' + ny + '.', 'spawn');
        scheduleSave();
        return toolResult(id, label(mv) + ' moved from ' + from + ' to ' + nx + ',' + ny + '.');
      }
      if (block.name === 'advance_turn') {
        nextTurn();
        var act = state.activeId != null ? findCombatant(state.activeId) : null;
        return toolResult(id, act ? ('Now ' + label(act) + "'s turn.") : 'No living combatants in the order.');
      }
      return toolResult(id, 'Unknown tool: ' + block.name, true);
    } catch (e) {
      return toolResult(id, 'Tool error: ' + ((e && e.message) || e), true);
    }
  }

  function finishChat() {
    renderAll();
    renderTurnOrder();
    aiStatus('');
    setAiBusy(false);
    scheduleSave();
  }

  function runLoop(iter) {
    var noTools = iter > MAX_TOOL_ITERS;   // hard stop: last call is text-only
    var req = { system: window.AIDM.CHAT_SYSTEM, messages: aiMessages, max_tokens: 1024 };
    if (!noTools) req.tools = window.AIDM.TOOLS;

    window.AIClient.complete(req).then(function (res) {
      aiMessages.push({ role: 'assistant', content: res.content });
      renderChat('dm', window.AIClient.textOf(res));

      var toolCalls = window.AIClient.toolCallsOf(res);
      if (!noTools && res.stop_reason === 'tool_use' && toolCalls.length) {
        var results = toolCalls.map(executeToolCall);
        aiMessages.push({ role: 'user', content: results });
        runLoop(iter + 1);
      } else {
        finishChat();
      }
    }).catch(function (err) {
      aiStatus((err && err.message) || 'Something went wrong.');
      setAiBusy(false);
    });
  }

  function sendChat(userText, displayLabel) {
    if (viewerMode || aiBusy) return;
    userText = (userText || '').trim();
    if (!userText) return;
    if (!window.AIClient || !window.AIDM || !window.AIContext) { aiStatus('AI scripts not loaded.'); return; }
    if (!window.AIClient.hasKey()) { aiStatus('Add your Anthropic API key in Settings first.'); showAiSettings(true); return; }

    var sceneText = (el.aiScene && el.aiScene.value.trim()) || '';
    state.scene = sceneText ? { text: sceneText } : null;
    var ctx = window.AIContext.build(state, {
      scene: state.scene,
      areas: window.Battlemap ? window.Battlemap.getAreas() : null,
      grid: window.Battlemap ? window.Battlemap.grid() : null
    });

    renderChat('user', displayLabel || userText);
    aiMessages.push({ role: 'user', content: window.AIDM.stateBlock(ctx) + '\n\n' + userText });

    setAiBusy(true);
    aiStatus('The DM is thinking…');
    runLoop(0);
  }

  function resetChat() {
    aiMessages = [];
    state.chatLog = [];
    if (window.Voice) Voice.stop();
    if (el.aiOutput) el.aiOutput.innerHTML = '';
    scheduleSave();
    aiStatus('Chat reset.');
    setTimeout(function () { aiStatus(''); }, 1400);
  }

  function showAiSettings(open) {
    if (!el.aiSettings) return;
    el.aiSettings.hidden = !open;
    if (el.aiSettingsBtn) el.aiSettingsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function saveAiSettings() {
    window.AIClient.setKey((el.aiKey.value || '').trim());
    var model = (el.aiModel.value || '').trim();
    window.AIClient.setModel(model || window.AIClient.DEFAULT_MODEL);
    el.aiModel.value = window.AIClient.getModel();
    if (window.Voice) {
      if (el.voiceKey) Voice.setKey(el.voiceKey.value);
      if (el.voiceId) { Voice.setVoice(el.voiceId.value); el.voiceId.value = Voice.getVoice(); }
      if (el.voiceModel) { Voice.setTtsModel(el.voiceModel.value); el.voiceModel.value = Voice.getTtsModel(); }
      updateVoiceUi();
    }
    aiStatus('Saved.');
    setTimeout(function () { aiStatus(''); }, 1400);
  }

  /* ---- Voice (ElevenLabs TTS + STT) — optional, degrades to silent ---- */
  function updateVoiceUi() {
    if (!window.Voice) return;
    var has = Voice.hasKey();
    if (el.aiSpeakBtn) {
      el.aiSpeakBtn.hidden = !has;
      var on = has && Voice.isAuto();
      el.aiSpeakBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      el.aiSpeakBtn.textContent = on ? '🔊 Voice on' : '🔊 Voice off';
    }
    if (el.aiMicBtn) el.aiMicBtn.hidden = !(has && Voice.canRecord());
  }

  // Keep the preset dropdown matched to the current Voice ID (or "Custom").
  function syncVoicePreset() {
    if (!el.voicePreset || !el.voiceId) return;
    var id = (el.voiceId.value || '').trim();
    var known = (Voice.PRESETS || []).some(function (p) { return p.id === id; });
    el.voicePreset.value = known ? id : '';
  }

  // Keep the model dropdown matched to the current Voice model id (or "Custom").
  function syncModelPreset() {
    if (!el.voiceModelPreset || !el.voiceModel) return;
    var id = (el.voiceModel.value || '').trim();
    var known = (Voice.MODELS || []).some(function (m) { return m.id === id; });
    el.voiceModelPreset.value = known ? id : '';
  }

  function toggleVoice() {
    if (!window.Voice) return;
    if (!Voice.hasKey()) { aiStatus('Add your ElevenLabs key in Settings first.'); showAiSettings(true); return; }
    var on = !Voice.isAuto();
    Voice.setAuto(on);
    if (!on) Voice.stop();
    updateVoiceUi();
  }

  function micDown() {
    if (!window.Voice || Voice.isRecording()) return;
    if (!Voice.hasKey()) { aiStatus('Add your ElevenLabs key in Settings first.'); showAiSettings(true); return; }
    Voice.stop();   // don't record the DM talking over the player
    Voice.startRecording().then(function () {
      if (el.aiMicBtn) { el.aiMicBtn.setAttribute('aria-pressed', 'true'); el.aiMicBtn.textContent = '⏺'; }
      aiStatus('Listening… release to send.');
    }).catch(function (e) { aiStatus((e && e.message) || 'Mic unavailable.'); });
  }

  function micUp() {
    if (!window.Voice || !Voice.isRecording()) return;
    if (el.aiMicBtn) { el.aiMicBtn.setAttribute('aria-pressed', 'false'); el.aiMicBtn.textContent = '🎤'; }
    aiStatus('Transcribing…');
    Voice.stopAndTranscribe().then(function (text) {
      text = (text || '').trim();
      if (!text) { aiStatus('Didn\'t catch that.'); return; }
      aiStatus('');
      sendChat(text);
    }).catch(function (e) { aiStatus((e && e.message) || 'Transcription failed.'); });
  }

  function initAi() {
    el.aiSettingsBtn = document.querySelector('.btn-ai-settings');
    el.aiSettings    = document.querySelector('#ai-settings');
    el.aiKey         = document.querySelector('#ai-key');
    el.aiModel       = document.querySelector('#ai-model');
    el.aiSaveBtn     = document.querySelector('.btn-ai-save');
    el.aiScene       = document.querySelector('#ai-scene');
    el.aiSceneBtn    = document.querySelector('.btn-ai-scene');
    el.aiRoundBtn    = document.querySelector('.btn-ai-round');
    el.aiResetBtn    = document.querySelector('.btn-ai-reset');
    el.aiInput       = document.querySelector('#ai-input');
    el.aiSendBtn     = document.querySelector('.btn-ai-send');
    el.aiStatus      = document.querySelector('#ai-status');
    el.aiOutput      = document.querySelector('#ai-output');
    el.voiceKey      = document.querySelector('#voice-key');
    el.voicePreset   = document.querySelector('#voice-preset');
    el.voiceId       = document.querySelector('#voice-id');
    el.voiceModelPreset = document.querySelector('#voice-model-preset');
    el.voiceModel    = document.querySelector('#voice-model');
    el.aiSpeakBtn    = document.querySelector('.btn-ai-speak');
    el.aiMicBtn      = document.querySelector('.btn-ai-mic');
    if (!el.aiOutput || !window.AIClient) return;

    el.aiKey.value = window.AIClient.getKey();
    el.aiModel.value = window.AIClient.getModel();
    if (window.Voice) {
      if (el.voiceKey) el.voiceKey.value = Voice.getKey();
      if (el.voiceId) el.voiceId.value = Voice.getVoice();
      if (el.voiceModel) el.voiceModel.value = Voice.getTtsModel();
      if (el.voicePreset) {
        // Build the preset menu (curated narrator voices) + a "Custom" fallback.
        (Voice.PRESETS || []).forEach(function (p) {
          var o = document.createElement('option');
          o.value = p.id; o.textContent = p.name;
          el.voicePreset.appendChild(o);
        });
        var custom = document.createElement('option');
        custom.value = ''; custom.textContent = 'Custom (use Voice ID below)';
        el.voicePreset.appendChild(custom);
        syncVoicePreset();
        // Picking a preset fills the Voice ID field; "Custom" leaves it editable.
        el.voicePreset.addEventListener('change', function () {
          if (el.voicePreset.value && el.voiceId) el.voiceId.value = el.voicePreset.value;
        });
        if (el.voiceId) el.voiceId.addEventListener('input', syncVoicePreset);
      }
      if (el.voiceModelPreset) {
        // Build the TTS-model menu + a "Custom" fallback.
        (Voice.MODELS || []).forEach(function (m) {
          var o = document.createElement('option');
          o.value = m.id; o.textContent = m.name;
          el.voiceModelPreset.appendChild(o);
        });
        var mcustom = document.createElement('option');
        mcustom.value = ''; mcustom.textContent = 'Custom (use Voice model ID below)';
        el.voiceModelPreset.appendChild(mcustom);
        syncModelPreset();
        el.voiceModelPreset.addEventListener('change', function () {
          if (el.voiceModelPreset.value && el.voiceModel) el.voiceModel.value = el.voiceModelPreset.value;
        });
        if (el.voiceModel) el.voiceModel.addEventListener('input', syncModelPreset);
      }
      if (el.aiSpeakBtn) el.aiSpeakBtn.addEventListener('click', toggleVoice);
      if (el.aiMicBtn) {
        // Push-to-talk: hold the mic (mouse or touch) to record, release to send.
        el.aiMicBtn.addEventListener('mousedown', micDown);
        el.aiMicBtn.addEventListener('mouseup', micUp);
        el.aiMicBtn.addEventListener('mouseleave', function () { if (Voice.isRecording()) micUp(); });
        el.aiMicBtn.addEventListener('touchstart', function (e) { e.preventDefault(); micDown(); });
        el.aiMicBtn.addEventListener('touchend', function (e) { e.preventDefault(); micUp(); });
      }
      updateVoiceUi();
    }

    el.aiScene.addEventListener('input', function () {
      var v = el.aiScene.value.trim();
      state.scene = v ? { text: v, title: (state.scene && state.scene.title) || '' } : null;
      scheduleSave();
    });
    el.aiSettingsBtn.addEventListener('click', function () { showAiSettings(el.aiSettings.hidden); });
    el.aiSaveBtn.addEventListener('click', saveAiSettings);
    el.aiSceneBtn.addEventListener('click', function () {
      sendChat('Set the scene for the players, based on the scene text and the current situation.', '▶ Describe scene');
    });
    el.aiRoundBtn.addEventListener('click', function () {
      sendChat("It's the monsters' and NPCs' turn — run their actions against the party now, one creature at a time, then stop.", "▶ Run monsters’ turn");
    });
    el.aiResetBtn.addEventListener('click', resetChat);
    el.aiSendBtn.addEventListener('click', function () {
      var v = el.aiInput.value; el.aiInput.value = ''; sendChat(v);
    });
    el.aiInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var v = el.aiInput.value; el.aiInput.value = ''; sendChat(v); }
    });
  }

  /* ---- Cloud sync (Supabase; optional — degrades to local only) ---- */
  function cloudStatus(text) { if (el.cloudStatus) el.cloudStatus.textContent = text || ''; }
  function cloudActiveLabel() {
    if (el.cloudActive) {
      el.cloudActive.textContent = cloudSessionId
        ? ('Active cloud session: “' + cloudSessionTitle + '” — changes autosave to the cloud.')
        : '';
    }
  }

  // Debounced push of the current session to its cloud row (if one is active).
  function cloudAutosave() {
    if (!window.Cloud || !Cloud.available() || !Cloud.user() || !cloudSessionId) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(function () {
      Cloud.saveSession({ id: cloudSessionId, title: cloudSessionTitle, state: snapshot() })
        .then(function (res) { if (res && res.error) cloudStatus('Cloud save failed: ' + res.error.message); })
        .catch(function (e) { cloudStatus('Cloud save failed.'); });
    }, 2000);
  }

  function refreshCloudList() {
    if (!Cloud.user()) return;
    Cloud.listSessions().then(function (res) {
      if (res.error) { cloudStatus(res.error.message); return; }
      var rows = res.data || [];
      el.cloudList.innerHTML = rows.length
        ? rows.map(function (r) {
            return '<option value="' + r.id + '">' + esc(r.title) +
              (r.owner !== (Cloud.user() && Cloud.user().id) ? ' (shared)' : '') + '</option>';
          }).join('')
        : '<option value="">No cloud saves yet</option>';
      el.cloudList.disabled = !rows.length;
    });
  }

  function updateCloudUI(user) {
    if (!el.cloud) return;
    var signedIn = !!user;
    el.cloudPanel.hidden = !signedIn;
    if (el.cloudSigninHint) el.cloudSigninHint.hidden = signedIn;
    if (signedIn) { refreshCloudList(); refreshGroups(); cloudActiveLabel(); }
    else { cloudSessionId = null; cloudSessionTitle = ''; leaveViewerMode(); }
  }

  function doSaveToCloud() {
    var title = (el.cloudTitle.value || '').trim() || cloudSessionTitle;
    if (!title) { cloudStatus('Give the session a name first.'); return; }
    cloudStatus('Saving…');
    Cloud.saveSession({ id: cloudSessionId || undefined, title: title, state: snapshot() })
      .then(function (res) {
        if (res.error) { cloudStatus('Save failed: ' + res.error.message); return; }
        cloudSessionId = res.data.id;
        cloudSessionTitle = res.data.title;
        el.cloudTitle.value = '';
        cloudStatus('Saved to cloud.');
        cloudActiveLabel();
        refreshCloudList();
        setTimeout(function () { cloudStatus(''); }, 1600);
      });
  }

  function doOpenFromCloud() {
    var id = el.cloudList.value;
    if (!id) return;
    if (state.combatants.length &&
        !window.confirm('Open this cloud session? It replaces what is on the table.')) return;
    cloudStatus('Loading…');
    Cloud.loadSession(id).then(function (res) {
      if (res.error) { cloudStatus('Load failed: ' + res.error.message); return; }
      var row = res.data;
      var mine = row.owner === (Cloud.user() && Cloud.user().id);
      applySnapshot(row.state || {});

      if (mine) {
        leaveViewerMode();               // clear any prior viewing; take full control
        cloudSessionId = row.id;
        cloudSessionTitle = row.title;
        // reflect this session's share state in the controls
        if (el.cloudShared) el.cloudShared.checked = !!row.shared;
        if (row.group_id && el.cloudGroups) { el.cloudGroups.value = row.group_id; updateInviteDisplay(); }
        persistState();
        cloudActiveLabel();
        logLine('Opened cloud session “' + row.title + '”.', 'spawn');
      } else {
        // Someone else's shared session: watch it live, read-only.
        enterViewerMode(row.title);
        subscribeLive(row.id);
        logLine('Watching shared session “' + row.title + '” (live).', 'turn');
      }
      cloudStatus('Opened “' + row.title + '”.');
      setTimeout(function () { cloudStatus(''); }, 1600);
    });
  }

  function doDeleteFromCloud() {
    var id = el.cloudList.value;
    if (!id) return;
    if (!window.confirm('Delete this cloud session permanently?')) return;
    Cloud.deleteSession(id).then(function (res) {
      if (res.error) { cloudStatus('Delete failed: ' + res.error.message); return; }
      if (id === cloudSessionId) { cloudSessionId = null; cloudSessionTitle = ''; cloudActiveLabel(); }
      cloudStatus('Deleted.');
      refreshCloudList();
    });
  }

  /* ---- Groups + sharing + live viewing (4b) ---- */
  function refreshGroups() {
    if (!Cloud.user() || !el.cloudGroups) return;
    Cloud.listGroups().then(function (res) {
      if (res.error) { cloudStatus(res.error.message); return; }
      cloudGroups = res.data || [];
      el.cloudGroups.innerHTML = cloudGroups.length
        ? cloudGroups.map(function (g) { return '<option value="' + g.id + '">' + esc(g.name) + '</option>'; }).join('')
        : '<option value="">No groups yet</option>';
      el.cloudGroups.disabled = !cloudGroups.length;
      updateInviteDisplay();
    });
  }
  function selectedGroup() {
    var id = el.cloudGroups && el.cloudGroups.value;
    for (var i = 0; i < cloudGroups.length; i++) if (cloudGroups[i].id === id) return cloudGroups[i];
    return null;
  }
  function updateInviteDisplay() {
    var g = selectedGroup();
    if (el.cloudInvite) el.cloudInvite.textContent = g ? ('Invite code: ' + g.invite_code) : '';
  }
  function doCreateGroup() {
    var name = window.prompt('Name this group / party:');
    if (!name || !name.trim()) return;
    Cloud.createGroup(name.trim()).then(function (res) {
      if (res.error) { cloudStatus(res.error.message); return; }
      cloudStatus('Group created.');
      refreshGroups();
    });
  }
  function doJoinGroup() {
    var code = (el.cloudJoinCode.value || '').trim();
    if (!code) { cloudStatus('Enter an invite code.'); return; }
    Cloud.joinGroup(code).then(function (res) {
      if (res.error) { cloudStatus(res.error.message); return; }
      el.cloudJoinCode.value = '';
      cloudStatus('Joined group.');
      refreshGroups();
      refreshCloudList();   // shared sessions in that group now appear
    });
  }
  function doToggleShare() {
    if (!cloudSessionId) { cloudStatus('Save this session to the cloud first.'); el.cloudShared.checked = false; return; }
    var g = selectedGroup();
    var shared = el.cloudShared.checked;
    if (shared && !g) { cloudStatus('Select or create a group to share with.'); el.cloudShared.checked = false; return; }
    Cloud.setSessionShare(cloudSessionId, g ? g.id : null, shared).then(function (res) {
      if (res.error) { cloudStatus('Share failed: ' + res.error.message); el.cloudShared.checked = !shared; return; }
      cloudStatus(shared
        ? ('Shared live with “' + g.name + '”. Players open it from their Cloud saves.')
        : 'Sharing turned off.');
    });
  }

  function subscribeLive(id) {
    if (liveChannel) { Cloud.unsubscribe(liveChannel); liveChannel = null; }
    liveChannel = Cloud.subscribe(id, function (row) {
      if (row && row.state) applySnapshot(row.state);
    });
  }
  function enterViewerMode(title) {
    viewerMode = true;
    cloudSessionId = null; cloudSessionTitle = '';
    document.body.classList.add('play-viewer');
    if (el.viewerBanner) {
      el.viewerBanner.hidden = false;
      el.viewerText.textContent = 'Watching “' + title + '” — live, read-only.';
    }
    cloudActiveLabel();
  }
  function leaveViewerMode() {
    viewerMode = false;
    document.body.classList.remove('play-viewer');
    if (el.viewerBanner) el.viewerBanner.hidden = true;
    if (liveChannel) { Cloud.unsubscribe(liveChannel); liveChannel = null; }
  }
  function doLeaveViewer() {
    leaveViewerMode();
    if (!restoreState()) {
      state.combatants = []; state.activeId = null; state.log = []; state.chatLog = [];
      renderAll(); renderTurnOrder();
      if (el.log) el.log.innerHTML = '';
      if (el.aiOutput) el.aiOutput.innerHTML = '';
      logLine('Left the shared session.', 'spawn');
    }
  }

  function initCloud() {
    el.cloud       = document.querySelector('#cloud');
    if (!el.cloud || !window.Cloud || !Cloud.available()) return;   // no config / script → stay local
    el.cloudPanel  = document.querySelector('#cloud-panel');
    el.cloudSigninHint = document.querySelector('#cloud-signin-hint');
    el.cloudTitle  = document.querySelector('#cloud-title');
    el.cloudList   = document.querySelector('#cloud-list');
    el.cloudActive = document.querySelector('#cloud-active');
    el.cloudStatus = document.querySelector('#cloud-status');
    el.cloudGroups = document.querySelector('#cloud-groups');
    el.cloudJoinCode = document.querySelector('#cloud-join-code');
    el.cloudShared = document.querySelector('#cloud-shared');
    el.cloudInvite = document.querySelector('#cloud-invite');
    el.viewerBanner = document.querySelector('#viewer-banner');
    el.viewerText = document.querySelector('#viewer-banner-text');

    el.cloud.hidden = false;
    Cloud.init();
    Cloud.onAuth(updateCloudUI);

    document.querySelector('.btn-cloud-save').addEventListener('click', doSaveToCloud);
    document.querySelector('.btn-cloud-open').addEventListener('click', doOpenFromCloud);
    document.querySelector('.btn-cloud-delete').addEventListener('click', doDeleteFromCloud);
    document.querySelector('.btn-group-create').addEventListener('click', doCreateGroup);
    document.querySelector('.btn-group-join').addEventListener('click', doJoinGroup);
    document.querySelector('.btn-viewer-leave').addEventListener('click', doLeaveViewer);
    el.cloudShared.addEventListener('change', doToggleShare);
    el.cloudGroups.addEventListener('change', updateInviteDisplay);
  }

  /* ---- Init ---- */
  /* ---- Battlemap wiring ---- */
  // Highlight the matching combatant card WITHOUT scrolling — grabbing a token
  // must not yank the page up to the card list (that broke dragging).
  function selectMapToken(id) {
    var nodes = el.list.querySelectorAll('.item');
    for (var i = 0; i < nodes.length; i++) {
      var nid = parseInt(nodes[i].getAttribute('data-id'), 10);
      nodes[i].classList.toggle('item--selected', id != null && nid === id);
    }
  }

  // The Game Session only moves tokens; the map is designed in the planner /
  // adventure and arrives via the handoff or the restored session snapshot.
  function initBattlemap() {
    var BM = window.Battlemap;
    var canvas = document.querySelector('#battlemap-canvas');
    if (!BM || !canvas) return;

    BM.init({
      canvas: canvas,
      wrap: document.querySelector('#battlemap-wrap'),
      distanceEl: document.querySelector('#battlemap-dist'),
      onMove: function () { scheduleSave(); },
      onChange: function () { scheduleSave(); },   // fog paint / marker drops → save + republish
      onSelect: function (id) { selectMapToken(id); },
      onAreaSelect: showAreaCard,
      onMarkerSelect: showMarkerCard
    });
    BM.setMode(viewerMode ? 'view' : 'play');

    // Tapping a numbered area shows its notes locally (never logged or synced,
    // so DM secrets stay on the DM's screen). Viewers see only read-aloud text.
    el.areaCard = document.querySelector('#battlemap-area');
    if (el.areaCard) {
      el.areaCard.querySelector('.bm-areacard__close')
        .addEventListener('click', function () { el.areaCard.hidden = true; });
    }
  }

  // DM visibility controls (fog of war + reveal/hide creatures). Each
  // action re-publishes the player projection so player screens update.
  function initRevealPanel() {
    var BM = window.Battlemap;
    var fog = document.querySelector('#reveal-fog');
    if (fog && BM) {
      fog.checked = BM.isFog();
      fog.addEventListener('change', function () { BM.setFog(fog.checked); persistState(); });
    }
    var auto = document.querySelector('#reveal-auto');
    if (auto && BM) {
      auto.checked = BM.isAutoReveal();
      auto.addEventListener('change', function () { BM.setAutoReveal(auto.checked); persistState(); });
    }
    bindClick('.btn-reveal-map', function () { if (BM) BM.revealAll(); persistState(); });
    bindClick('.btn-reset-fog', function () { if (BM) BM.clearRevealed(); persistState(); });
    bindClick('.btn-hide-all', function () { setAllHidden(true); });
    bindClick('.btn-reveal-all', function () { setAllHidden(false); });

    // Fog brush: Move / Reveal / Hide (drives the battlemap tool in play mode).
    var brush = document.querySelector('#reveal-brush');
    if (brush && BM) {
      brush.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-brush]');
        if (!b) return;
        var which = b.getAttribute('data-brush');
        BM.setTool(which === 'select' ? 'select' : which);
        setActiveBrush(which);
      });
    }
    // Marker drop buttons: arm the marker tool with a type.
    var markerBtns = document.querySelectorAll('.btn-marker');
    for (var i = 0; i < markerBtns.length; i++) {
      markerBtns[i].addEventListener('click', function (ev) {
        if (!BM) return;
        BM.setMarkerType(ev.currentTarget.getAttribute('data-marker'));
        BM.setTool('marker');
        setActiveBrush(null);   // marker mode isn't one of the brush segments
      });
    }
    initMarkerCard();
  }
  function setActiveBrush(which) {
    var seg = document.querySelector('#reveal-brush');
    if (!seg) return;
    var btns = seg.querySelectorAll('[data-brush]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-active', which && btns[i].getAttribute('data-brush') === which);
    }
  }

  var activeMarker = null;
  function initMarkerCard() {
    el.markerCard = document.querySelector('#battlemap-marker');
    if (!el.markerCard) return;
    el.markerCard.querySelector('.bm-markercard__close')
      .addEventListener('click', function () { el.markerCard.hidden = true; window.Battlemap.selectMarker && window.Battlemap.selectMarker(null); });
    var label = el.markerCard.querySelector('#marker-label');
    var note = el.markerCard.querySelector('#marker-note');
    label.addEventListener('input', function () { if (activeMarker) { activeMarker.label = label.value; scheduleSave(); } });
    note.addEventListener('input', function () { if (activeMarker) { activeMarker.note = note.value; scheduleSave(); } });
    el.markerCard.querySelector('.btn-marker-reveal').addEventListener('click', function () {
      if (!activeMarker) return;
      window.Battlemap.revealMarker(activeMarker, !activeMarker.revealed);
      renderMarkerCard();
      persistState();
    });
    el.markerCard.querySelector('.btn-marker-remove').addEventListener('click', function () {
      if (!activeMarker) return;
      window.Battlemap.removeMarker(activeMarker);
      activeMarker = null;
      el.markerCard.hidden = true;
      persistState();
    });
  }
  function showMarkerCard(mk) {
    if (!el.markerCard) return;
    activeMarker = mk || null;
    if (!mk) { el.markerCard.hidden = true; return; }
    renderMarkerCard();
    el.markerCard.hidden = false;
  }
  function renderMarkerCard() {
    if (!el.markerCard || !activeMarker) return;
    var types = window.Battlemap.markerTypes();
    var t = types[activeMarker.type] || {};
    el.markerCard.querySelector('.bm-markercard__title').textContent =
      (t.glyph || '') + ' ' + (t.label || 'Marker') + (activeMarker.revealed ? ' — shown to players' : ' — hidden');
    el.markerCard.querySelector('#marker-label').value = activeMarker.label || '';
    el.markerCard.querySelector('#marker-note').value = activeMarker.note || '';
    el.markerCard.querySelector('.btn-marker-reveal').textContent =
      activeMarker.revealed ? 'Hide from players' : 'Reveal to players';
  }
  function bindClick(sel, fn) {
    var b = document.querySelector(sel);
    if (b) b.addEventListener('click', fn);
  }
  function setAllHidden(hidden) {
    if (viewerMode) return;
    var n = 0;
    state.combatants.forEach(function (c) {
      if (c.kind !== 'player') { DM.setHidden(c, hidden); n++; }
    });
    if (!n) return;
    logLine(hidden ? 'All creatures hidden from players.' : 'All creatures revealed to players.', 'spawn');
    renderAll();
    persistState();
  }

  function showAreaCard(area) {
    if (!el.areaCard) return;
    if (!area) { el.areaCard.hidden = true; return; }
    el.areaCard.querySelector('.bm-areacard__title').textContent =
      'Area ' + area.n + (area.title ? ' — ' + area.title : '');
    var read = el.areaCard.querySelector('.bm-areacard__read');
    read.textContent = area.read || '';
    read.hidden = !area.read;
    var dm = el.areaCard.querySelector('.bm-areacard__dm');
    // Viewers (shared session) never see the secret DM notes.
    dm.textContent = (!viewerMode && area.dm) ? ('DM: ' + area.dm) : '';
    dm.hidden = viewerMode || !area.dm;
    el.areaCard.hidden = false;
  }

  // Which seat is this: 'ai' (AI DM runs the game) or 'dm' (a human DM).
  // The two share this game session; the role only toggles the AI panel
  // and the page's framing. The player screen is the separate player.html.
  function currentRole() {
    try {
      return (new URLSearchParams(window.location.search).get('role') === 'dm') ? 'dm' : 'ai';
    } catch (e) { return 'ai'; }
  }
  function applyRole() {
    var role = currentRole();
    var h1 = document.querySelector('.topbar h1');
    var tag = document.querySelector('.topbar .tagline');
    // A body class drives the per-role layout in CSS, so each seat shows
    // only its own components (no shared DOM peeking through).
    document.body.classList.add('role-' + role);
    // Highlight the matching gameplay nav entry.
    var navLink = document.querySelector('.nav__link[data-role-link="' + role + '"]');
    if (navLink) navLink.classList.add('nav__link--active');

    if (role === 'dm') {
      if (h1) h1.textContent = 'DM Console';
      if (tag) tag.textContent = 'You run the world. Reveal the map and creatures as the players discover them.';
      document.title = 'DM Console — Dice & Monsters';
    } else {
      // AI is the DM: the human is a player, so the DM reveal controls
      // (hidden via CSS) don't apply here; the AI DM panel does.
      if (h1) h1.textContent = 'Play vs AI DM';
      if (tag) tag.textContent = 'The AI is your Dungeon Master — it sees the whole map; you see only what your party has found.';
      document.title = 'Play vs AI DM — Dice & Monsters';
    }
  }

  function init() {
    applyRole();
    el.loadSelect = document.querySelector('#play-load');
    el.loadBtn    = document.querySelector('.btn-play-load');
    el.clearBtn   = document.querySelector('.btn-play-clear');
    el.initBtn    = document.querySelector('.btn-init');
    el.nextBtn    = document.querySelector('.btn-next');
    el.turnOrder  = document.querySelector('#turn-order');
    el.list       = document.querySelector('.monster__list');
    el.encMeta    = document.querySelector('#encounter-meta');
    el.log        = document.querySelector('#log');
    el.status     = document.querySelector('#play-status');
    el.monsterSearch = document.querySelector('#play-monster-search');
    el.monsterSelect = document.querySelector('#play-monster-select');
    el.monsterCount  = document.querySelector('#play-monster-count');
    el.addMonsterBtn = document.querySelector('.btn-play-add-monster');
    el.playerName    = document.querySelector('#play-player-name');
    el.playerInit    = document.querySelector('#play-player-init');
    el.playerAc      = document.querySelector('#play-player-ac');
    el.addPlayerBtn  = document.querySelector('.btn-play-add-player');
    el.charImport    = document.querySelector('#play-char-import');
    el.importCharBtn = document.querySelector('.btn-play-import-char');

    populateSavedSelect();

    // Live "add to the fight" controls
    populateMonsterSelect();
    el.monsterSearch.addEventListener('input', populateMonsterSelect);
    el.addMonsterBtn.addEventListener('click', function () {
      if (el.monsterSelect.value) addMonsterBySlug(el.monsterSelect.value);
    });
    el.addPlayerBtn.addEventListener('click', submitPlayer);
    el.playerName.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitPlayer(); });
    populateCharImport();
    el.charImport.addEventListener('focus', populateCharImport);
    el.importCharBtn.addEventListener('click', function () {
      if (el.charImport.value) addCharacterFromSheet(el.charImport.value);
    });

    el.loadSelect.addEventListener('focus', populateSavedSelect);
    el.loadBtn.addEventListener('click', loadSelectedEncounter);
    el.clearBtn.addEventListener('click', clearTable);
    el.initBtn.addEventListener('click', rollInitiative);
    el.nextBtn.addEventListener('click', nextTurn);
    el.list.addEventListener('click', onListClick);
    el.list.addEventListener('keydown', onListKeydown);
    el.turnOrder.addEventListener('click', onTrackClick);
    el.turnOrder.addEventListener('keydown', onTrackKeydown);

    initAi();
    initCloud();
    initBattlemap();
    initRevealPanel();

    // If the planner or an adventure scene handed off a session, load it.
    var handoff = readSessionHandoff();
    var hasHandoff = handoff && (
      (handoff.combatants && handoff.combatants.length) ||
      (handoff.monsters && handoff.monsters.length) ||
      handoff.scene);
    if (hasHandoff) {
      clearAutosave();          // a fresh session replaces any prior autosave
      loadHandoff(handoff);
    } else if (restoreState()) {
      aiStatus('Restored your last session.');
      setTimeout(function () { aiStatus(''); }, 2000);
    } else {
      renderAll();
      renderTurnOrder();
      logLine('Ready. Load a saved encounter, build one in the planner, or press “Play this scene” in an adventure.', 'spawn');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
