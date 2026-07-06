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
    editInitMode: 'd20'
  };

  var el = {};
  var statusTimer = null;
  var library = (window.MONSTER_DATA || []).slice(); // for the live "add monster" picker

  var esc = DM.esc, signed = DM.signed;

  /* ---- small local helpers that mirror the engine's needs ---- */
  function findCombatant(id) { return DM.findCombatant(state.combatants, id); }
  function label(c) { return DM.combatantLabel(c); }

  /* ---- Combat log ---- */
  function logLine(text, cls) {
    var line = document.createElement('div');
    line.className = 'log__line' + (cls ? ' log__line--' + cls : '');
    line.textContent = text;
    el.log.insertBefore(line, el.log.firstChild);
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
          metaHtml(c) +
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
  function performAttack(attacker, attack, target) {
    var r = DM.resolveAttack(attacker, attack, target);
    var who = label(attacker) + ' uses ' + attack.name;
    var vs = target ? (' on ' + label(target)) : '';

    if (r.alreadyDead) {
      logLine(label(attacker) + ' attacks ' + label(target) + ', but it is already dead.', 'miss');
      return;
    }
    if (!r.hit) {
      var why = r.fumble ? 'Critical miss!' : ('rolled ' + r.toHit + ' vs AC ' + target.ac + ' - miss.');
      logLine(who + vs + ': ' + why, 'miss');
      return;
    }
    var hitTxt = r.crit ? 'CRITICAL HIT!' :
      ('rolled ' + r.toHit + (target ? ' vs AC ' + target.ac : '') + ' - hit.');
    var dmgTxt = r.dmg + ' ' + (attack.type || '') + ' damage';

    if (r.appliedDamage) {
      var st = r.killed ? (' ' + label(target) + ' DIES!') : (' (' + target.hp + '/' + target.maxHp + ' HP left)');
      logLine(who + vs + ': ' + hitTxt + ' ' + dmgTxt + '.' + st, r.killed ? 'kill' : 'hit');
      refreshCard(target);
    } else if (target) {
      logLine(who + vs + ': ' + hitTxt + ' ' + dmgTxt + ' - ' + label(target) + ' tracks the damage themselves.', 'hit');
    } else {
      logLine(who + ': ' + hitTxt + ' ' + dmgTxt + '.', 'hit');
    }
  }

  function rollInitiative() {
    if (!state.combatants.length) return;
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
    if (!state.combatants.length) return;
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

  /* ---- Init ---- */
  function init() {
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

    // If the planner handed off an encounter, load it straight into play.
    var handoff = readSessionHandoff();
    if (handoff && handoff.combatants && handoff.combatants.length) {
      loadCombatantList(handoff.combatants, handoff.name || null);
    } else {
      renderAll();
      renderTurnOrder();
      logLine('Ready. Load a saved encounter, or build one in the planner and press “Start play session”.', 'spawn');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
