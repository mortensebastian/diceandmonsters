/* ============================================================
   Dice & Monsters
   ------------------------------------------------------------
   Structured into clear layers:
     1. Dice     - randomness and dice rolls
     2. Data     - the monster library + state
     3. Model    - combatants (monster OR player)
     4. Combat   - attacks, damage, death, initiative, turn order
     5. UI       - rendering, combat log, events

   A "combatant" is either a monster or a player. Players have
   only a name for now (+ optional initiative modifier / AC), but
   the model has room for hp/maxHp/ac/stats so a full character
   sheet can be attached later without reworking the rest.
   ============================================================ */
(function () {
  'use strict';

  /* =========================================================
     1. DICE
     ========================================================= */

  function rollDie(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  function rollDice(count, sides) {
    var sum = 0;
    for (var i = 0; i < count; i++) sum += rollDie(sides);
    return sum;
  }

  function abilityMod(score) {
    return Math.floor((score - 10) / 2);
  }

  function signed(n) {
    return (n >= 0 ? '+' : '') + n;
  }

  // Escape user input (names, conditions) for safe insertion into HTML.
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* =========================================================
     2. DATA + STATE
     ========================================================= */

  var library = []; // all monsters from the file

  var state = {
    combatants: [],     // monsters and players mixed together
    nextId: 1,
    activeId: null,     // whose turn it is (id), or null
    editingInitId: null, // combatant being edited in the tracker, or null
    editInitMode: 'd20', // tracker edit field: 'd20' roll or final 'total'
    saved: []            // saved encounters (also persisted to localStorage)
  };

  var STORAGE_KEY = 'diceAndMonsters.encounters';

  /* =========================================================
     3. MODEL
     ========================================================= */

  // Shared "shell" for a combatant. Players get null where they
  // lack numbers for now - fill them in later for HP/stats.
  function baseCombatant(kind, name) {
    return {
      id: state.nextId++,
      kind: kind,        // 'monster' | 'player'
      name: name,
      hp: null,          // set for anything with an HP counter
      maxHp: null,
      ac: null,
      dead: false,
      initiative: null,  // total: initRoll + initMod (set when rolled)
      initRoll: null,    // the raw d20 result, so we can show the breakdown
      initMod: 0,         // modifier added to the d20 (Dex mod, feats, …)
      conditions: [],     // conditions, e.g. "Poisoned", "Prone"
      attacks: []
    };
  }

  // Roll HP from hit dice (e.g. "18d10+36").
  function rollHp(template) {
    var m = /(\d+)d(\d+)([+\-]\d+)?/.exec(template.hitDice || '');
    if (!m) return template.hp;
    var count = +m[1], sides = +m[2], bonus = m[3] ? +m[3] : 0;
    return Math.max(1, rollDice(count, sides) + bonus);
  }

  function createMonster(template) {
    var c = baseCombatant('monster', template.name);
    c.template = template;
    c.maxHp = rollHp(template);
    c.hp = c.maxHp;
    c.ac = template.ac;
    c.initMod = abilityMod(template.dex);
    c.attacks = template.attacks || [];
    return c;
  }

  // Player: name + optional initiative modifier + optional AC.
  // HP is the player's own business (the DM shouldn't know it);
  // the DM needs AC to decide whether a monster's attack hits.
  function createPlayer(name, initMod, ac) {
    var c = baseCombatant('player', name);
    c.initMod = initMod || 0;
    c.ac = (ac == null ? null : ac);
    return c;
  }

  // ---- Importing from saved character sheets ----

  function loadCharacters() {
    try { return JSON.parse(window.localStorage.getItem('diceAndMonsters.characters')) || []; }
    catch (e) { return []; }
  }

  function sheetInitMod(sheet) {
    var dex = sheet.abilities ? sheet.abilities.dex : 10;
    return abilityMod(dex) + (sheet.initBonus || 0);
  }

  // Best-effort parse of a freeform sheet attack into the combat model.
  function parseSheetAttack(at) {
    var toHit = parseInt(at.bonus, 10); if (isNaN(toHit)) toHit = 0;
    var dmg = String(at.damage || '');
    var count = 0, sides = 0, bonus = 0, type = '';
    var m = /(\d+)\s*d\s*(\d+)\s*([+\-]\s*\d+)?/i.exec(dmg);
    if (m) {
      count = +m[1]; sides = +m[2];
      if (m[3]) bonus = parseInt(m[3].replace(/\s+/g, ''), 10) || 0;
    } else {
      var f = /([+\-]?\d+)/.exec(dmg);
      if (f) bonus = parseInt(f[1], 10) || 0;
    }
    var tm = /([a-zA-Z]+)\s*$/.exec(dmg.trim());
    if (tm && tm[1].toLowerCase() !== 'd') type = tm[1].toLowerCase();
    var ranged = /(bow|ranged|thrown|sling|dart|javelin|crossbow)/i.test(at.name || '');
    return {
      name: at.name || 'Attack', toHit: toHit,
      count: count, sides: sides, bonus: bonus, type: type, ranged: ranged
    };
  }

  // PC sheet -> player combatant (AC + initiative only; no HP).
  function createPlayerFromSheet(sheet) {
    return createPlayer(sheet.name || 'Player', sheetInitMod(sheet),
      (sheet.ac != null && sheet.ac !== '' ? sheet.ac : null));
  }

  // NPC sheet -> DM-controlled combatant with HP, AC and attacks.
  function createNpcFromSheet(sheet) {
    var c = baseCombatant('npc', sheet.name || 'NPC');
    var maxHp = (sheet.hp && sheet.hp.max) ? sheet.hp.max : 0;
    c.maxHp = maxHp > 0 ? maxHp : 1;
    c.hp = c.maxHp;
    c.ac = (sheet.ac != null && sheet.ac !== '') ? sheet.ac : 10;
    c.initMod = sheetInitMod(sheet);
    c.attacks = (sheet.attacks || []).map(parseSheetAttack);
    return c;
  }

  function findCombatant(id) {
    for (var i = 0; i < state.combatants.length; i++) {
      if (state.combatants[i].id === id) return state.combatants[i];
    }
    return null;
  }

  function combatantLabel(c) {
    return '#' + c.id + ' ' + c.name;
  }

  // Does this combatant have an HP counter? (Players: no - their own.)
  function hasHp(c) {
    return c.maxHp != null;
  }

  // Can it be targeted? Requires an AC to roll against. Monsters
  // always have one; players get it when the DM types in their AC.
  function canBeTargeted(c) {
    return c.ac != null;
  }

  // Short explanations of the standard 5e conditions.
  var CONDITION_INFO = {
    'blinded': "Can't see; auto-fails sight-based checks. Attacks against it have advantage, its own have disadvantage.",
    'charmed': "Can't attack the charmer; the charmer has advantage on social checks against it.",
    'concentration': 'On taking damage, make a Con save (DC 10 or half the damage) to keep the spell.',
    'deafened': "Can't hear; auto-fails checks that require hearing.",
    'frightened': "Disadvantage on checks and attacks while the source is in sight; can't move closer to it.",
    'grappled': 'Speed becomes 0; gains no bonus to speed.',
    'incapacitated': "Can't take actions or reactions.",
    'invisible': 'Attacks against it have disadvantage; its own attacks have advantage.',
    'paralyzed': "Incapacitated and can't move; attacks have advantage, hits within 5 ft are critical.",
    'petrified': 'Turned to stone: unconscious, resistance to all damage, immune to poison and disease.',
    'poisoned': 'Disadvantage on attack rolls and ability checks.',
    'prone': 'Disadvantage on attacks; melee against it has advantage, ranged has disadvantage.',
    'restrained': 'Speed 0; attacks against it have advantage, its own have disadvantage, disadvantage on Dex saves.',
    'stunned': "Incapacitated and can't move; attacks against it have advantage, auto-fails Str and Dex saves.",
    'unconscious': 'Unconscious and prone, drops everything; attacks have advantage, hits within 5 ft are critical.'
  };

  function conditionInfo(name) {
    return CONDITION_INFO[String(name).toLowerCase()] || '';
  }

  // Conditions - the same for monsters and players.
  function addCondition(c, cond) {
    cond = (cond || '').trim();
    if (!cond) return false;
    var exists = c.conditions.some(function (x) {
      return x.toLowerCase() === cond.toLowerCase();
    });
    if (exists) return false;
    c.conditions.push(cond);
    return true;
  }

  function removeCondition(c, cond) {
    c.conditions = c.conditions.filter(function (x) { return x !== cond; });
  }

  /* =========================================================
     4. COMBAT
     ========================================================= */

  function applyDamage(c, amount) {
    if (!hasHp(c)) return 0;
    if (amount < 0) amount = 0;
    c.hp = Math.max(0, c.hp - amount);
    c.dead = c.hp === 0;
    return amount;
  }

  function applyHeal(c, amount) {
    if (!hasHp(c)) return 0;
    if (amount < 0) amount = 0;
    c.hp = Math.min(c.maxHp, c.hp + amount);
    if (c.hp > 0) c.dead = false;
    return amount;
  }

  function performAttack(attacker, attack, target) {
    if (target && target.dead) {
      logLine(combatantLabel(attacker) + ' attacks ' +
        combatantLabel(target) + ', but it is already dead.', 'miss');
      return;
    }

    var d20 = rollDie(20);
    var crit = d20 === 20;
    var fumble = d20 === 1;
    var toHit = d20 + attack.toHit;

    var who = combatantLabel(attacker) + ' uses ' + attack.name;
    var vs = target ? (' on ' + combatantLabel(target)) : '';

    var isMiss = fumble || (target && toHit < target.ac);
    if (isMiss) {
      var why = fumble ? 'Critical miss!' :
        ('rolled ' + toHit + ' vs AC ' + target.ac + ' - miss.');
      logLine(who + vs + ': ' + why, 'miss');
      return;
    }

    var diceCount = attack.count * (crit ? 2 : 1);
    var dmg = (attack.sides > 0 ? rollDice(diceCount, attack.sides) : 0) + attack.bonus;
    if (dmg < 0) dmg = 0;

    var hitTxt = crit ? 'CRITICAL HIT!' :
      ('rolled ' + toHit + (target ? ' vs AC ' + target.ac : '') + ' - hit.');
    var dmgTxt = dmg + ' ' + (attack.type || '') + ' damage';

    if (target && hasHp(target)) {
      // Monster (or anything with HP): subtract the damage.
      applyDamage(target, dmg);
      var status = target.dead
        ? (' ' + combatantLabel(target) + ' DIES!')
        : (' (' + target.hp + '/' + target.maxHp + ' HP left)');
      logLine(who + vs + ': ' + hitTxt + ' ' + dmgTxt + '.' + status,
        target.dead ? 'kill' : 'hit');
      refreshCard(target);
    } else if (target) {
      // Player with AC but no HP counter: report it, don't subtract.
      logLine(who + vs + ': ' + hitTxt + ' ' + dmgTxt +
        ' - ' + combatantLabel(target) + ' tracks the damage themselves.', 'hit');
    } else {
      logLine(who + ': ' + hitTxt + ' ' + dmgTxt + '.', 'hit');
    }
  }

  // ---- Initiative + turn order ----

  // Short visible breakdown, e.g. "16 + 1" (or just "16" when no mod).
  function initBreakdown(c) {
    if (c.initRoll == null) return '';
    if (!c.initMod) return String(c.initRoll);
    return c.initRoll + (c.initMod > 0 ? ' + ' + c.initMod : ' - ' + (-c.initMod));
  }

  // Breakdown for the combat log, e.g. " (d20 16, mod +1)".
  function initLogBreak(c) {
    return c.initRoll != null
      ? ' (d20 ' + c.initRoll + ', mod ' + signed(c.initMod) + ')' : '';
  }

  // Set a combatant's initiative from a given d20 roll + its modifier.
  function setInitiative(c, d20) {
    c.initRoll = d20;
    c.initiative = d20 + c.initMod;
  }

  // Roll d20 + initMod for everyone. Makes the first one active.
  function rollInitiative() {
    if (!state.combatants.length) return;
    state.combatants.forEach(function (c) {
      setInitiative(c, rollDie(20));
    });
    logLine('--- Initiative rolled ---', 'turn');
    orderedCombatants().forEach(function (c) {
      logLine(combatantLabel(c) + ': ' + c.initiative + initLogBreak(c), 'turn');
    });
    var order = orderedAlive();
    state.activeId = order.length ? order[0].id : null;
    renderAll();
    renderTurnOrder();
    if (state.activeId) {
      logLine('First up: ' + combatantLabel(findCombatant(state.activeId)) + '.', 'turn');
    }
  }

  // Everyone with initiative, highest first (tie-break: initMod, id).
  function orderedCombatants() {
    return state.combatants
      .filter(function (c) { return c.initiative != null; })
      .slice()
      .sort(function (a, b) {
        return (b.initiative - a.initiative) ||
               (b.initMod - a.initMod) ||
               (a.id - b.id);
      });
  }

  function orderedAlive() {
    return orderedCombatants().filter(function (c) { return !c.dead; });
  }

  // Pass the turn to the next living combatant in the order.
  function nextTurn() {
    var order = orderedAlive();
    if (!order.length) { state.activeId = null; return; }
    var ids = order.map(function (c) { return c.id; });
    var idx = ids.indexOf(state.activeId);
    var nextIdx = (idx + 1) % ids.length;
    if (idx !== -1 && nextIdx === 0) logLine('--- New round ---', 'turn');
    state.activeId = ids[nextIdx];
    logLine('Turn: ' + combatantLabel(findCombatant(state.activeId)) + '.', 'turn');
    updateActiveHighlight();
    renderTurnOrder();
  }

  /* =========================================================
     5. UI
     ========================================================= */

  var el = {};

  function logLine(text, cls) {
    var line = document.createElement('div');
    line.className = 'log__line' + (cls ? ' log__line--' + cls : '');
    line.textContent = text;
    el.log.insertBefore(line, el.log.firstChild);
  }

  // ---- Monster picker ----
  function uniqueCrLabels() {
    var seen = {}, list = [];
    library.forEach(function (m) {
      if (!seen[m.crLabel]) { seen[m.crLabel] = true; list.push(m); }
    });
    list.sort(function (a, b) { return a.cr - b.cr; });
    return list.map(function (m) { return m.crLabel; });
  }

  // Distinct values of a field (alphabetical).
  function uniqueField(field) {
    var seen = {}, list = [];
    library.forEach(function (m) {
      var v = m[field];
      if (v && !seen[v]) { seen[v] = true; list.push(v); }
    });
    return list.sort();
  }

  var SIZE_ORDER = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

  function populateCrFilter() {
    var opts = '<option value="">All CR</option>';
    uniqueCrLabels().forEach(function (cr) {
      opts += '<option value="' + cr + '">CR ' + cr + '</option>';
    });
    el.crFilter.innerHTML = opts;
  }

  function populateTypeFilter() {
    var opts = '<option value="">All types</option>';
    uniqueField('type').forEach(function (t) {
      opts += '<option value="' + esc(t) + '">' + esc(t) + '</option>';
    });
    el.typeFilter.innerHTML = opts;
  }

  function populateSizeFilter() {
    var sizes = uniqueField('size').sort(function (a, b) {
      return SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b);
    });
    var opts = '<option value="">All sizes</option>';
    sizes.forEach(function (s) {
      opts += '<option value="' + esc(s) + '">' + esc(s) + '</option>';
    });
    el.sizeFilter.innerHTML = opts;
  }

  function populateMonsterSelect() {
    var q = el.search.value.trim().toLowerCase();
    var cr = el.crFilter.value;
    var type = el.typeFilter.value;
    var size = el.sizeFilter.value;
    var matches = library.filter(function (m) {
      if (cr && m.crLabel !== cr) return false;
      if (type && m.type !== type) return false;
      if (size && m.size !== size) return false;
      if (q && m.name.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    el.select.innerHTML = matches.map(function (m) {
      return '<option value="' + m.slug + '">' + m.name +
        '  (CR ' + m.crLabel + ', ' + m.attacks.length + ' attacks)</option>';
    }).join('');

    el.count.textContent = matches.length + ' of ' + library.length + ' monsters';
    el.addBtn.disabled = matches.length === 0;
  }

  function templateBySlug(slug) {
    for (var i = 0; i < library.length; i++) {
      if (library[i].slug === slug) return library[i];
    }
    return null;
  }

  // ---- Card rendering ----
  function hpClass(c) {
    var ratio = c.hp / c.maxHp;
    if (c.dead) return 'hpbar__fill--dead';
    if (ratio <= 0.33) return 'hpbar__fill--low';
    if (ratio <= 0.66) return 'hpbar__fill--mid';
    return '';
  }

  function hpBarHtml(c) {
    // HP bar only for things with an HP counter (monsters). Players
    // have none - they keep track of their own HP.
    if (!hasHp(c)) return '';
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
        a.name + tag + '<span class="btn-attack__meta">' +
        signed(a.toHit) + ' to hit &middot; ' + dmg + ' ' + a.type + '</span></button>';
    }).join('') + '</div>';
  }

  function targetSelectHtml(c) {
    // All living combatants with an AC to roll against (monsters, and
    // players who have been given an AC). Players without AC can't be picked.
    var others = state.combatants.filter(function (o) {
      return o.id !== c.id && !o.dead && canBeTargeted(o);
    });
    if (!c.attacks.length) return '';
    var opts = '<option value="">- none / just roll -</option>';
    opts += others.map(function (o) {
      return '<option value="' + o.id + '">#' + o.id + ' ' + esc(o.name) +
        ' (AC ' + o.ac + ')</option>';
    }).join('');
    return '<label class="target">Target: <select data-role="target">' +
      opts + '</select></label>';
  }

  function manualHtml(c) {
    if (!hasHp(c)) return '';
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
      var ac = c.ac != null
        ? '<span class="badge badge--ac">AC ' + c.ac + '</span>' : '';
      return '<span class="item__meta"><span class="badge badge--player">Player</span>' +
        ac + init + '</span>';
    }
    if (c.kind === 'npc') {
      return '<span class="item__meta"><span class="badge badge--npc">NPC</span>' +
        '<span class="badge badge--ac">AC ' + c.ac + '</span>' + init + '</span>';
    }
    var t = c.template;
    return '<span class="item__meta">' + t.size + ' ' + t.type +
      ' &middot; CR ' + t.crLabel + ' &middot; AC ' + c.ac +
      (t.acDesc ? ' (' + t.acDesc + ')' : '') + ' ' + init + '</span>';
  }

  function statsHtml(c) {
    if (c.kind !== 'monster') return '';
    var t = c.template;
    var stats = ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(function (k) {
      return k.toUpperCase() + ' ' + signed(abilityMod(t[k]));
    }).join(' &middot; ');
    return '<div class="item__stats">' + stats + '</div>';
  }

  // Conditions (chips + suggestion field + short explanations).
  function conditionsHtml(c) {
    var chips = c.conditions.map(function (cond) {
      var info = conditionInfo(cond);
      return '<span class="chip" data-action="remove-condition" data-cond="' +
        esc(cond) + '" title="' + esc(info || 'Custom condition') +
        ' (click to remove)">' + esc(cond) + ' &times;</span>';
    }).join('');

    // Visible short explanations for the active conditions.
    var effects = c.conditions.map(function (cond) {
      var info = conditionInfo(cond);
      return info ? '<li><b>' + esc(cond) + '</b> – ' + esc(info) + '</li>' : '';
    }).filter(Boolean).join('');
    var effectsHtml = effects ? '<ul class="cond-effects">' + effects + '</ul>' : '';

    return '<div class="conditions">' +
      '<span class="conditions__label">Conditions:</span>' +
      '<span class="conditions__chips">' +
        (chips || '<span class="conditions__none">none</span>') +
      '</span>' +
      '<input class="conditions__input" data-role="condition" list="conditions-list" ' +
        'placeholder="add…">' +
      '<button class="btn-cond" data-action="add-condition">+</button>' +
    '</div>' + effectsHtml;
  }

  // Player controls: optional AC + remove. Initiative is edited in
  // the turn-order box. No HP - the player owns their own HP.
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
        hpBarHtml(c) +
        statsHtml(c) +
        controls +
      '</div>';
  }

  function renderAll() {
    if (!state.combatants.length) {
      el.list.innerHTML = '<p class="empty">No combatants yet. ' +
        'Add monsters and players above.</p>';
    } else {
      el.list.innerHTML = state.combatants.map(cardHtml).join('');
    }
    var alive = state.combatants.filter(function (c) { return !c.dead; }).length;
    el.encMeta.textContent = state.combatants.length
      ? (state.combatants.length + ' in encounter - ' + alive + ' alive')
      : '';
  }

  // All combatants for the tracker: those with initiative first
  // (highest on top), those without at the bottom. So all are editable.
  function trackerOrder() {
    return state.combatants.slice().sort(function (a, b) {
      var ai = a.initiative == null ? -Infinity : a.initiative;
      var bi = b.initiative == null ? -Infinity : b.initiative;
      return (bi - ai) || (b.initMod - a.initMod) || (a.id - b.id);
    });
  }

  // Turn-order tracker with editable initiative for everyone.
  function renderTurnOrder() {
    if (!state.combatants.length) {
      el.turnOrder.innerHTML =
        '<p class="turn__hint">Add monsters and players, then roll or type in initiative.</p>';
      el.nextBtn.disabled = true;
      return;
    }
    el.nextBtn.disabled = !state.combatants.some(function (c) { return c.initiative != null; });

    el.turnOrder.innerHTML = trackerOrder().map(function (c) {
      var cls = 'turn__row';
      if (c.id === state.activeId) cls += ' turn__row--active';
      if (c.dead) cls += ' turn__row--dead';

      var initGroup;
      if (c.id === state.editingInitId) {
        // Edit mode: d20-roll or final-total field + save (check symbol).
        var mode = state.editInitMode;
        var curVal = mode === 'total'
          ? (c.initiative != null ? c.initiative : '')
          : (c.initRoll != null ? c.initRoll : '');
        var modChip = mode === 'd20'
          ? '<span class="turn__initmod" title="initiative modifier">' +
              signed(c.initMod) + '</span>'
          : '';
        var toggle = '<span class="init-mode">' +
          '<button class="' + (mode === 'd20' ? 'active' : '') + '" ' +
            'data-action="init-mode" data-mode="d20" title="Enter the d20 roll; the modifier is added">d20</button>' +
          '<button class="' + (mode === 'total' ? 'active' : '') + '" ' +
            'data-action="init-mode" data-mode="total" title="Enter the final initiative directly">Total</button>' +
        '</span>';
        initGroup = '<span class="turn__initgroup">' +
          '<input type="number" class="turn__init-input" data-role="track-init" ' +
            'value="' + curVal + '" placeholder="' + (mode === 'total' ? 'total' : 'd20') + '" ' +
            'title="' + (mode === 'total' ? 'final initiative' : 'd20 roll') + '">' +
          modChip + toggle +
          '<button class="btn-track-save" data-action="save-init" ' +
            'title="Save" aria-label="Save">&#10003;</button>' +
        '</span>';
      } else {
        // Total + breakdown (d20 + mod) + pencil right next to it.
        var brk = c.initRoll != null
          ? '<span class="turn__initbreak" title="d20 ' + c.initRoll +
              ' + initiative modifier ' + signed(c.initMod) + '">(' +
              esc(initBreakdown(c)) + ')</span>'
          : '';
        initGroup = '<span class="turn__initgroup">' +
          '<span class="turn__init">' +
            (c.initiative != null ? c.initiative : '–') + '</span>' +
          brk +
          '<button class="btn-track-edit" data-action="edit-init" ' +
            'title="Edit initiative" aria-label="Edit initiative">&#9998;</button>' +
        '</span>';
      }

      var conds = c.conditions.length
        ? '<span class="turn__cond">' + c.conditions.map(esc).join(', ') + '</span>' : '';

      return '<div class="' + cls + '" data-id="' + c.id + '">' +
        initGroup +
        '<span class="turn__name">' + esc(c.name) + '</span>' +
        conds +
        '<span class="turn__tag">' + (c.kind === 'player' ? 'player' : 'monster') +
          (c.dead ? ' &middot; dead' : '') + '</span>' +
      '</div>';
    }).join('');

    var input = el.turnOrder.querySelector('input[data-role="track-init"]');
    if (input) { input.focus(); input.select(); }
  }

  function refreshCard(c) {
    var node = el.list.querySelector('.item[data-id="' + c.id + '"]');
    if (!node || !hasHp(c)) return;
    node.classList.toggle('item--dead', c.dead);
    var fill = node.querySelector('.hpbar__fill');
    if (fill) {
      fill.style.width = Math.round(c.hp / c.maxHp * 100) + '%';
      fill.className = 'hpbar__fill ' + hpClass(c);
    }
    var label = node.querySelector('.hpbar__label');
    if (label) {
      label.textContent = c.hp + ' / ' + c.maxHp + ' HP' + (c.dead ? ' · DEAD' : '');
    }
    var alive = state.combatants.filter(function (x) { return !x.dead; }).length;
    el.encMeta.textContent = state.combatants.length + ' in encounter - ' + alive + ' alive';
    renderTurnOrder();
  }

  // Re-render a single card (without disturbing the other cards).
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

  /* ---- Actions ---- */

  // If combat is already underway, give the newcomer an initiative now.
  function rollInitiativeIfActive(c) {
    var inProgress = state.combatants.some(function (x) {
      return x.id !== c.id && x.initiative != null;
    });
    if (inProgress) {
      setInitiative(c, rollDie(20));
      logLine(combatantLabel(c) + ' rolls initiative ' + c.initiative +
        initLogBreak(c) + '.', 'turn');
    }
  }

  function addMonster(slug) {
    var template = templateBySlug(slug);
    if (!template) return;
    var c = createMonster(template);
    state.combatants.push(c);
    rollInitiativeIfActive(c);
    renderAll();
    renderTurnOrder();
    logLine(combatantLabel(c) + ' appears (' + c.maxHp + ' HP, AC ' + c.ac + ').', 'spawn');
  }

  function addPlayer(name, initMod, ac) {
    name = (name || '').trim();
    if (!name) return;
    var c = createPlayer(name, initMod, ac);
    state.combatants.push(c);
    rollInitiativeIfActive(c);
    renderAll();
    renderTurnOrder();
    var extra = [];
    if (initMod) extra.push('init ' + signed(initMod));
    if (ac != null) extra.push('AC ' + ac);
    logLine('Player ' + combatantLabel(c) + ' joins' +
      (extra.length ? ' (' + extra.join(', ') + ')' : '') + '.', 'spawn');
  }

  // Bring a saved character sheet into the encounter.
  function addCharacterFromSheet(id) {
    var sheets = loadCharacters(), sheet = null;
    for (var i = 0; i < sheets.length; i++) if (sheets[i].id === id) sheet = sheets[i];
    if (!sheet) return;
    var isNpc = sheet.category === 'npc';
    var c = isNpc ? createNpcFromSheet(sheet) : createPlayerFromSheet(sheet);
    state.combatants.push(c);
    rollInitiativeIfActive(c);
    renderAll();
    renderTurnOrder();
    var note = isNpc
      ? ' (NPC, ' + c.maxHp + ' HP, AC ' + c.ac + ')'
      : ' (player, AC ' + (c.ac != null ? c.ac : '–') + ')';
    logLine(combatantLabel(c) + ' added from sheet' + note + '.', 'spawn');
  }

  // Fill the import dropdown from saved sheets, grouped by category.
  function populateCharImport() {
    if (!el.charImport) return;
    var sheets = loadCharacters();
    if (!sheets.length) {
      el.charImport.innerHTML = '<option value="">No saved characters</option>';
      el.importBtn.disabled = true;
      return;
    }
    el.importBtn.disabled = false;
    function opt(s) { return '<option value="' + s.id + '">' + esc(s.name || 'Unnamed') + '</option>'; }
    var pcs = sheets.filter(function (s) { return (s.category || 'pc') === 'pc'; });
    var npcs = sheets.filter(function (s) { return s.category === 'npc'; });
    var html = '';
    if (pcs.length) html += '<optgroup label="My characters">' + pcs.map(opt).join('') + '</optgroup>';
    if (npcs.length) html += '<optgroup label="NPCs">' + npcs.map(opt).join('') + '</optgroup>';
    el.charImport.innerHTML = html;
  }

  function removeCombatant(id) {
    var c = findCombatant(id);
    state.combatants = state.combatants.filter(function (x) { return x.id !== id; });
    if (state.activeId === id) {
      var order = orderedAlive();
      state.activeId = order.length ? order[0].id : null;
    }
    renderAll();
    renderTurnOrder();
    if (c) logLine(combatantLabel(c) + ' removed.', 'spawn');
  }

  function clearEncounter() {
    if (!state.combatants.length) return;
    state.combatants = [];
    state.activeId = null;
    renderAll();
    renderTurnOrder();
    logLine('Encounter cleared.', 'spawn');
  }

  /* ---- Saving / loading encounters ---- */

  function loadSavedFromStorage() {
    try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || []; }
    catch (e) { return []; }
  }

  function persistSaved() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.saved)); }
    catch (e) { /* storage blocked (e.g. on file://) - stays in memory only */ }
  }

  // Plain-object snapshot of a combatant. Monsters keep only their
  // template slug (re-linked from the library on load) to stay lean.
  function serializeCombatant(c) {
    var o = {
      kind: c.kind, name: c.name, hp: c.hp, maxHp: c.maxHp, ac: c.ac,
      dead: c.dead, initiative: c.initiative, initRoll: c.initRoll,
      initMod: c.initMod, conditions: c.conditions.slice()
    };
    if (c.kind === 'monster' && c.template) o.templateSlug = c.template.slug;
    // NPCs have no library template, so keep their attacks inline.
    if (c.kind === 'npc') o.attacks = c.attacks;
    return o;
  }

  function deserializeCombatant(o) {
    var c = baseCombatant(o.kind, o.name);
    c.hp = (o.hp == null ? null : o.hp);
    c.maxHp = (o.maxHp == null ? null : o.maxHp);
    c.ac = (o.ac == null ? null : o.ac);
    c.dead = !!o.dead;
    c.initiative = (o.initiative == null ? null : o.initiative);
    c.initRoll = (o.initRoll == null ? null : o.initRoll);
    c.initMod = o.initMod || 0;
    c.conditions = (o.conditions || []).slice();
    if (o.kind === 'monster') {
      var t = templateBySlug(o.templateSlug);
      if (t) { c.template = t; c.attacks = t.attacks || []; }
    } else if (o.kind === 'npc') {
      c.attacks = o.attacks || [];
    }
    return c;
  }

  function savedIndexByName(name) {
    for (var i = 0; i < state.saved.length; i++) {
      if (state.saved[i].name.toLowerCase() === name.toLowerCase()) return i;
    }
    return -1;
  }

  // Save the current encounter under a name. Overwrites a same-named one.
  function saveEncounter(name) {
    name = (name || '').trim();
    if (!name) { logLine('Give the encounter a name before saving.', 'spawn'); return false; }
    if (!state.combatants.length) {
      logLine('Nothing to save - the encounter is empty.', 'spawn');
      return false;
    }
    var entry = {
      name: name,
      savedAt: Date.now(),
      combatants: state.combatants.map(serializeCombatant)
    };
    var idx = savedIndexByName(name);
    if (idx !== -1) state.saved[idx] = entry; else state.saved.push(entry);
    state.saved.sort(function (a, b) { return a.name.localeCompare(b.name); });
    persistSaved();
    renderSavedList();
    logLine((idx !== -1 ? 'Updated' : 'Saved') + ' encounter "' + name +
      '" (' + entry.combatants.length + ' combatants).', 'spawn');
    return true;
  }

  // Load a saved encounter, replacing the current one.
  function loadEncounter(index) {
    var entry = state.saved[index];
    if (!entry) return;
    if (state.combatants.length &&
        !window.confirm('Load "' + entry.name + '"? This replaces the current encounter.')) {
      return;
    }
    state.combatants = entry.combatants.map(deserializeCombatant);
    state.activeId = null;
    state.editingInitId = null;
    renderAll();
    renderTurnOrder();
    logLine('Loaded encounter "' + entry.name + '" (' +
      state.combatants.length + ' combatants).', 'spawn');
  }

  function deleteEncounter(index) {
    var entry = state.saved[index];
    if (!entry) return;
    if (!window.confirm('Delete saved encounter "' + entry.name + '"?')) return;
    state.saved.splice(index, 1);
    persistSaved();
    renderSavedList();
    logLine('Deleted saved encounter "' + entry.name + '".', 'spawn');
  }

  function renderSavedList() {
    if (!state.saved.length) {
      el.savedList.innerHTML = '<p class="saved__empty">No saved encounters yet.</p>';
      return;
    }
    el.savedList.innerHTML = state.saved.map(function (s, i) {
      var monsters = s.combatants.filter(function (c) { return c.kind === 'monster'; }).length;
      var players = s.combatants.length - monsters;
      var plural = function (n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); };
      return '<div class="saved__item">' +
        '<span class="saved__name">' + esc(s.name) + '</span>' +
        '<span class="saved__meta">' + plural(monsters, 'monster') + ', ' +
          plural(players, 'player') + '</span>' +
        '<div class="saved__btns">' +
          '<button class="btn-load" data-action="load" data-index="' + i + '">Load</button>' +
          '<button class="btn-del" data-action="delete" data-index="' + i + '">Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function onSavedClick(ev) {
    var btn = ev.target.closest('[data-action]');
    if (!btn) return;
    var i = parseInt(btn.getAttribute('data-index'), 10);
    var action = btn.getAttribute('data-action');
    if (action === 'load') loadEncounter(i);
    else if (action === 'delete') deleteEncounter(i);
  }

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
        applyDamage(c, dmg);
        logLine(combatantLabel(c) + ' takes ' + dmg + ' damage.' +
          (c.dead ? ' It DIES!' : ' (' + c.hp + '/' + c.maxHp + ' HP)'),
          c.dead ? 'kill' : 'hit');
        refreshCard(c);
      }

    } else if (action === 'heal') {
      var amt = readAmount(cardNode);
      if (amt > 0) {
        applyHeal(c, amt);
        logLine(combatantLabel(c) + ' heals ' + amt + ' HP (' +
          c.hp + '/' + c.maxHp + ').', 'heal');
        refreshCard(c);
      }

    } else if (action === 'set-ac') {
      var acInput = cardNode.querySelector('input[data-role="ac"]');
      var rawAc = (acInput && acInput.value || '').trim();
      var ac = parseInt(rawAc, 10);
      c.ac = (rawAc === '' || isNaN(ac) || ac < 0) ? null : ac;
      logLine(combatantLabel(c) + (c.ac != null
        ? ' now has AC ' + c.ac + ' - can be targeted.'
        : ' has no AC set.'), 'spawn');
      renderAll();        // refresh target lists + meta on everyone
      renderTurnOrder();

    } else if (action === 'add-condition') {
      var condInput = cardNode.querySelector('input[data-role="condition"]');
      if (addCondition(c, condInput && condInput.value)) {
        var added = c.conditions[c.conditions.length - 1];
        var info = conditionInfo(added);
        logLine(combatantLabel(c) + ' is now ' + added +
          (info ? ' - ' + info : '') + '.', 'spawn');
        rerenderCard(c);
        renderTurnOrder();
      }

    } else if (action === 'remove-condition') {
      removeCondition(c, btn.getAttribute('data-cond'));
      rerenderCard(c);
      renderTurnOrder();

    } else if (action === 'remove') {
      removeCombatant(id);
    }
  }

  // ---- Turn-order box: edit initiative for everyone ----
  function commitTrackInit(c) {
    var input = el.turnOrder.querySelector(
      '.turn__row[data-id="' + c.id + '"] input[data-role="track-init"]');
    var raw = (input && input.value || '').trim();
    var n = parseInt(raw, 10);
    if (raw === '' || isNaN(n)) {
      // Empty = drop out of the order entirely.
      c.initRoll = null;
      c.initiative = null;
    } else if (state.editInitMode === 'total') {
      // The field is the final total; set it directly, no breakdown.
      c.initRoll = null;
      c.initiative = n;
    } else {
      // The field is the d20 roll; the modifier is added on top.
      setInitiative(c, n);
    }
    state.editingInitId = null;
    logLine(combatantLabel(c) + (c.initiative != null
      ? ' now has initiative ' + c.initiative + initLogBreak(c) + '.'
      : ' removed from the initiative order.'), 'turn');
    rerenderCard(c);     // update the Init badge on the card
    renderTurnOrder();   // re-sort the order
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
      // Switch d20 <-> total, keeping whatever was already typed.
      var inp = btn.closest('.turn__row').querySelector('input[data-role="track-init"]');
      var keep = inp ? inp.value : '';
      state.editInitMode = btn.getAttribute('data-mode');
      renderTurnOrder();
      var inp2 = el.turnOrder.querySelector(
        '.turn__row[data-id="' + id + '"] input[data-role="track-init"]');
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

  // Enter in a field = press the matching button on the card.
  function onListKeydown(ev) {
    if (ev.key !== 'Enter') return;
    var input = ev.target;
    if (!input.matches || !input.matches('input[data-role]')) return;
    var action = {
      ac: 'set-ac', condition: 'add-condition', amount: 'damage'
    }[input.getAttribute('data-role')];
    if (!action) return;
    var btn = input.closest('.item').querySelector('button[data-action="' + action + '"]');
    if (btn) { ev.preventDefault(); btn.click(); }
  }

  /* ---- Init ---- */
  function init() {
    el.search     = document.querySelector('#search');
    el.crFilter   = document.querySelector('#cr-filter');
    el.typeFilter = document.querySelector('#type-filter');
    el.sizeFilter = document.querySelector('#size-filter');
    el.select     = document.querySelector('#monster-select');
    el.count      = document.querySelector('#match-count');
    el.addBtn     = document.querySelector('.btn-add');
    el.randomBtn  = document.querySelector('.btn-random');
    el.playerName = document.querySelector('#player-name');
    el.playerInit = document.querySelector('#player-init');
    el.playerAc   = document.querySelector('#player-ac');
    el.addPlayer  = document.querySelector('.btn-add-player');
    el.charImport = document.querySelector('#char-import');
    el.importBtn  = document.querySelector('.btn-import-char');
    el.initBtn    = document.querySelector('.btn-init');
    el.nextBtn    = document.querySelector('.btn-next');
    el.turnOrder  = document.querySelector('#turn-order');
    el.encName    = document.querySelector('#encounter-name');
    el.saveBtn    = document.querySelector('.btn-save-encounter');
    el.savedList  = document.querySelector('#saved-list');
    el.clearBtn   = document.querySelector('.btn-clear');
    el.list       = document.querySelector('.monster__list');
    el.encMeta    = document.querySelector('#encounter-meta');
    el.log        = document.querySelector('#log');

    library = (window.MONSTER_DATA || []).slice();

    if (!library.length) {
      el.list.innerHTML = '<p class="empty">No monster data found. ' +
        'Check that monsters-data.js is loaded.</p>';
      return;
    }

    state.saved = loadSavedFromStorage();

    populateCrFilter();
    populateTypeFilter();
    populateSizeFilter();
    populateMonsterSelect();
    renderAll();
    renderTurnOrder();
    renderSavedList();

    el.search.addEventListener('input', populateMonsterSelect);
    el.crFilter.addEventListener('change', populateMonsterSelect);
    el.typeFilter.addEventListener('change', populateMonsterSelect);
    el.sizeFilter.addEventListener('change', populateMonsterSelect);

    el.addBtn.addEventListener('click', function () {
      if (el.select.value) addMonster(el.select.value);
    });

    el.randomBtn.addEventListener('click', function () {
      var opts = el.select.options;
      if (opts.length) addMonster(opts[Math.floor(Math.random() * opts.length)].value);
    });

    function submitPlayer() {
      var initMod = parseInt(el.playerInit.value, 10);
      var ac = parseInt(el.playerAc.value, 10);
      addPlayer(el.playerName.value,
        isNaN(initMod) ? 0 : initMod,
        isNaN(ac) ? null : ac);
      el.playerName.value = '';
      el.playerInit.value = '';
      el.playerAc.value = '';
      el.playerName.focus();
    }
    el.addPlayer.addEventListener('click', submitPlayer);
    el.playerName.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitPlayer();
    });

    if (el.charImport) {
      populateCharImport();
      // Refresh the list in case sheets were edited on the other page.
      el.charImport.addEventListener('focus', populateCharImport);
      el.importBtn.addEventListener('click', function () {
        if (el.charImport.value) addCharacterFromSheet(el.charImport.value);
      });
    }

    el.initBtn.addEventListener('click', rollInitiative);
    el.nextBtn.addEventListener('click', nextTurn);

    function submitSave() {
      if (saveEncounter(el.encName.value)) el.encName.value = '';
    }
    el.saveBtn.addEventListener('click', submitSave);
    el.encName.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitSave();
    });
    el.savedList.addEventListener('click', onSavedClick);

    el.clearBtn.addEventListener('click', clearEncounter);
    el.list.addEventListener('click', onListClick);
    el.list.addEventListener('keydown', onListKeydown);
    el.turnOrder.addEventListener('click', onTrackClick);
    el.turnOrder.addEventListener('keydown', onTrackKeydown);

    logLine('Ready! ' + library.length + ' monsters loaded. Add monsters and players.', 'spawn');

    importPendingEncounter();
  }

  // If an adventure scene was sent here, spawn its monsters.
  function importPendingEncounter() {
    var raw;
    try { raw = window.localStorage.getItem('diceAndMonsters.pendingEncounter'); } catch (e) { return; }
    if (!raw) return;
    try { window.localStorage.removeItem('diceAndMonsters.pendingEncounter'); } catch (e) { /* ignore */ }
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data || !data.monsters) return;
    data.monsters.forEach(function (m) {
      var n = m.count || 1;
      for (var i = 0; i < n; i++) addMonster(m.slug);
    });
    if (data.name) logLine('Loaded "' + data.name + '" from an adventure.', 'turn');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
