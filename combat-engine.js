/* ============================================================
   Dice & Monsters — Combat Engine (shared)
   ------------------------------------------------------------
   The UI-agnostic core of the game: dice, the combatant model,
   combat math (damage/heal/attacks), initiative and turn order,
   conditions, and (de)serialization.

   No DOM, no rendering, no logging — every function takes plain
   data and returns plain data, so both the Encounter Planner
   (prep) and the Gameplay page (play) can share it via window.DM.
   ============================================================ */
(function () {
  'use strict';

  /* ---- 1. Dice + small helpers ---- */
  function rollDie(sides) { return Math.floor(Math.random() * sides) + 1; }
  function rollDice(count, sides) {
    var sum = 0;
    for (var i = 0; i < count; i++) sum += rollDie(sides);
    return sum;
  }
  function abilityMod(score) { return Math.floor((score - 10) / 2); }
  function signed(n) { return (n >= 0 ? '+' : '') + n; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* ---- Monster library lookup (from window.MONSTER_DATA) ---- */
  var _slugMap = null;
  function templateBySlug(slug) {
    if (!_slugMap) {
      _slugMap = {};
      (window.MONSTER_DATA || []).forEach(function (m) { _slugMap[m.slug] = m; });
    }
    return _slugMap[slug] || null;
  }
  // Fuzzy library lookup by display name (for the AI DM's add_combatants tool,
  // which knows creatures by name, not slug). Exact match wins, then substring.
  function templateByName(name) {
    if (!name) return null;
    var want = String(name).toLowerCase().trim();
    if (!want) return null;
    var list = window.MONSTER_DATA || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (String(list[i].name).toLowerCase() === want) return list[i];
    }
    for (i = 0; i < list.length; i++) {
      if (String(list[i].name).toLowerCase().indexOf(want) !== -1) return list[i];
    }
    return null;
  }

  /* ---- 2. IDs ---- */
  // A single shared counter so ids stay unique within a page's session.
  var _nextId = 1;
  function newId() { return _nextId++; }
  // After loading saved combatants, make sure new ids don't collide.
  function bumpIdPast(id) { if (id >= _nextId) _nextId = id + 1; }

  /* ---- 3. Model ---- */
  function baseCombatant(kind, name) {
    return {
      id: newId(),
      kind: kind,          // 'monster' | 'npc' | 'player'
      name: name,
      hp: null,
      maxHp: null,
      ac: null,
      dead: false,
      initiative: null,    // total: initRoll + initMod
      initRoll: null,      // raw d20, for the breakdown
      initMod: 0,
      conditions: [],
      attacks: [],
      x: null,             // battlemap column (null = not placed yet)
      y: null              // battlemap row
    };
  }

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

  function createPlayer(name, initMod, ac) {
    var c = baseCombatant('player', name);
    c.initMod = initMod || 0;
    c.ac = (ac == null ? null : ac);
    return c;
  }

  /* ---- Character-sheet import ---- */
  function sheetInitMod(sheet) {
    var dex = sheet.abilities ? sheet.abilities.dex : 10;
    return abilityMod(dex) + (sheet.initBonus || 0);
  }

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

  function createPlayerFromSheet(sheet) {
    return createPlayer(sheet.name || 'Player', sheetInitMod(sheet),
      (sheet.ac != null && sheet.ac !== '' ? sheet.ac : null));
  }

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

  // Build a combatant from an ad-hoc stat block (used by the AI DM to bring
  // creatures it invents into the fight). The engine still owns all HP; here
  // we only set the max, never roll or narrate results.
  function intOr(v, dflt) { var n = parseInt(v, 10); return isNaN(n) ? dflt : n; }
  function createCustomCreature(spec) {
    spec = spec || {};
    var kind = spec.kind === 'npc' ? 'npc' : 'monster';
    var c = baseCombatant(kind, spec.name || (kind === 'npc' ? 'NPC' : 'Monster'));
    var hp = intOr(spec.hp, 0);
    c.maxHp = hp > 0 ? hp : 1;
    c.hp = c.maxHp;
    c.ac = intOr(spec.ac, 10);
    c.initMod = intOr(spec.initMod, 0);
    c.attacks = (spec.attacks || []).map(function (a) {
      a = a || {};
      return {
        name: a.name || 'Attack',
        toHit: intOr(a.toHit, 0),
        count: intOr(a.count, 0),
        sides: intOr(a.sides, 0),
        bonus: intOr(a.bonus, 0),
        type: a.type || '',
        ranged: !!a.ranged
      };
    });
    return c;
  }

  function findCombatant(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function combatantLabel(c) { return '#' + c.id + ' ' + c.name; }
  function hasHp(c) { return c.maxHp != null; }
  function canBeTargeted(c) { return c.ac != null; }

  /* ---- Conditions ---- */
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
  function conditionInfo(name) { return CONDITION_INFO[String(name).toLowerCase()] || ''; }
  function addCondition(c, cond) {
    cond = (cond || '').trim();
    if (!cond) return false;
    var exists = c.conditions.some(function (x) { return x.toLowerCase() === cond.toLowerCase(); });
    if (exists) return false;
    c.conditions.push(cond);
    return true;
  }
  function removeCondition(c, cond) {
    c.conditions = c.conditions.filter(function (x) { return x !== cond; });
  }

  /* ---- 4. Combat math ---- */
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

  // Resolve one attack and RETURN a structured result. The caller
  // decides how to log/render it. Damage is applied here to targets
  // that carry an HP counter (monsters/NPCs); players track their own.
  function resolveAttack(attacker, attack, target) {
    var res = {
      attacker: attacker, attack: attack, target: target || null,
      alreadyDead: false, d20: 0, crit: false, fumble: false,
      toHit: 0, hit: false, dmg: 0, appliedDamage: false, killed: false
    };
    if (target && target.dead) { res.alreadyDead = true; return res; }

    res.d20 = rollDie(20);
    res.crit = res.d20 === 20;
    res.fumble = res.d20 === 1;
    res.toHit = res.d20 + attack.toHit;

    var isMiss = res.fumble || (target && res.toHit < target.ac);
    if (isMiss) { res.hit = false; return res; }
    res.hit = true;

    var diceCount = attack.count * (res.crit ? 2 : 1);
    var dmg = (attack.sides > 0 ? rollDice(diceCount, attack.sides) : 0) + attack.bonus;
    if (dmg < 0) dmg = 0;
    res.dmg = dmg;

    if (target && hasHp(target)) {
      applyDamage(target, dmg);
      res.appliedDamage = true;
      res.killed = target.dead;
    }
    return res;
  }

  /* ---- Initiative + turn order ---- */
  function initBreakdown(c) {
    if (c.initRoll == null) return '';
    if (!c.initMod) return String(c.initRoll);
    return c.initRoll + (c.initMod > 0 ? ' + ' + c.initMod : ' - ' + (-c.initMod));
  }
  function initLogBreak(c) {
    return c.initRoll != null
      ? ' (d20 ' + c.initRoll + ', mod ' + signed(c.initMod) + ')' : '';
  }
  function setInitiative(c, d20) {
    c.initRoll = d20;
    c.initiative = d20 + c.initMod;
  }
  // Roll d20 + initMod for everyone in the list. Returns the ordered list.
  function rollInitiativeAll(list) {
    list.forEach(function (c) { setInitiative(c, rollDie(20)); });
    return orderedCombatants(list);
  }
  function orderedCombatants(list) {
    return list
      .filter(function (c) { return c.initiative != null; })
      .slice()
      .sort(function (a, b) {
        return (b.initiative - a.initiative) || (b.initMod - a.initMod) || (a.id - b.id);
      });
  }
  function orderedAlive(list) {
    return orderedCombatants(list).filter(function (c) { return !c.dead; });
  }
  // All combatants, initiative first (highest on top), the rest below.
  function trackerOrder(list) {
    return list.slice().sort(function (a, b) {
      var ai = a.initiative == null ? -Infinity : a.initiative;
      var bi = b.initiative == null ? -Infinity : b.initiative;
      return (bi - ai) || (b.initMod - a.initMod) || (a.id - b.id);
    });
  }
  // Given the current active id, return the next living combatant's id
  // plus whether a new round started. Null id if nobody is alive.
  function nextTurnId(list, activeId) {
    var order = orderedAlive(list);
    if (!order.length) return { id: null, newRound: false };
    var ids = order.map(function (c) { return c.id; });
    var idx = ids.indexOf(activeId);
    var nextIdx = (idx + 1) % ids.length;
    var newRound = idx !== -1 && nextIdx === 0;
    return { id: ids[nextIdx], newRound: newRound };
  }

  /* ---- 5. (De)serialization ---- */
  function serializeCombatant(c) {
    var o = {
      kind: c.kind, name: c.name, hp: c.hp, maxHp: c.maxHp, ac: c.ac,
      dead: c.dead, initiative: c.initiative, initRoll: c.initRoll,
      initMod: c.initMod, conditions: c.conditions.slice(),
      x: (c.x == null ? null : c.x), y: (c.y == null ? null : c.y)
    };
    if (c.kind === 'monster' && c.template) o.templateSlug = c.template.slug;
    else if (c.kind === 'monster') o.attacks = c.attacks;   // custom monster (no library template)
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
    c.x = (o.x == null ? null : o.x);
    c.y = (o.y == null ? null : o.y);
    if (o.kind === 'monster') {
      var t = templateBySlug(o.templateSlug);
      if (t) { c.template = t; c.attacks = t.attacks || []; }
      else { c.attacks = o.attacks || []; }   // custom monster: restore its ad-hoc attacks
    } else if (o.kind === 'npc') {
      c.attacks = o.attacks || [];
    }
    return c;
  }

  /* ---- Public API ---- */
  window.DM = {
    // dice + helpers
    rollDie: rollDie, rollDice: rollDice, abilityMod: abilityMod,
    signed: signed, esc: esc,
    // library
    templateBySlug: templateBySlug, templateByName: templateByName,
    // ids
    newId: newId, bumpIdPast: bumpIdPast,
    // model
    baseCombatant: baseCombatant, rollHp: rollHp,
    createMonster: createMonster, createPlayer: createPlayer,
    createPlayerFromSheet: createPlayerFromSheet, createNpcFromSheet: createNpcFromSheet,
    createCustomCreature: createCustomCreature,
    parseSheetAttack: parseSheetAttack, sheetInitMod: sheetInitMod,
    findCombatant: findCombatant, combatantLabel: combatantLabel,
    hasHp: hasHp, canBeTargeted: canBeTargeted,
    // conditions
    CONDITION_INFO: CONDITION_INFO, conditionInfo: conditionInfo,
    addCondition: addCondition, removeCondition: removeCondition,
    // combat
    applyDamage: applyDamage, applyHeal: applyHeal, resolveAttack: resolveAttack,
    // initiative + order
    setInitiative: setInitiative, initBreakdown: initBreakdown, initLogBreak: initLogBreak,
    rollInitiativeAll: rollInitiativeAll, orderedCombatants: orderedCombatants,
    orderedAlive: orderedAlive, trackerOrder: trackerOrder, nextTurnId: nextTurnId,
    // (de)serialization
    serializeCombatant: serializeCombatant, deserializeCombatant: deserializeCombatant
  };
})();
