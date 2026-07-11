/* ============================================================
   Dice & Monsters — Encounter Planner
   ------------------------------------------------------------
   Prep only. This page builds an encounter (pick monsters, add
   players, import character sheets) and saves it under a name.
   Running the fight — initiative, turns, attacks, HP, the log —
   lives on the Game Session page. "Start game session ▶" hands
   the roster over there.

   Structured into clear layers:
     1. Dice     - randomness (only used to roll a monster's HP)
     2. Data     - the monster library + state
     3. Model    - combatants (monster / npc / player)
     4. UI       - rendering, events

   A "combatant" is a monster, an imported NPC, or a player.
   Players carry only a name (+ optional initiative modifier / AC);
   monsters and NPCs also carry HP and attacks so the Game Session
   page has everything it needs when the roster is handed over.
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
    combatants: [],   // monsters, NPCs and players mixed together
    nextId: 1,
    saved: []         // saved encounters (also persisted to localStorage)
  };

  var STORAGE_KEY = 'diceAndMonsters.encounters';

  /* =========================================================
     3. MODEL
     ========================================================= */

  // Shared "shell" for a combatant. Players get null where they
  // lack numbers (HP). The initiative fields stay on the model so
  // the roster serializes cleanly for the Game Session page, which
  // is where initiative is actually rolled.
  function baseCombatant(kind, name) {
    return {
      id: state.nextId++,
      kind: kind,        // 'monster' | 'npc' | 'player'
      name: name,
      hp: null,          // set for anything with an HP counter
      maxHp: null,
      ac: null,
      dead: false,
      initiative: null,  // filled in on the Game Session page
      initRoll: null,
      initMod: 0,         // Dex mod / feats — carried over for the Game Session
      conditions: [],     // conditions, e.g. "Poisoned", "Prone"
      attacks: [],
      x: null,            // battlemap column (null = not placed yet)
      y: null             // battlemap row
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
  // the DM needs AC so the Game Session can resolve attacks on them.
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

  // Does this combatant have an HP counter? (Players: no - their own.)
  function hasHp(c) {
    return c.maxHp != null;
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
     4. UI
     ========================================================= */

  var el = {};

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
  function hpBarHtml(c) {
    // HP bar only for things with an HP counter (monsters/NPCs).
    // Players have none - they keep track of their own HP.
    if (!hasHp(c)) return '';
    var ratio = Math.round(c.hp / c.maxHp * 100);
    return '<div class="hpbar">' +
      '<div class="hpbar__fill" style="width:' + ratio + '%"></div>' +
      '<span class="hpbar__label">' + c.maxHp + ' HP</span>' +
    '</div>';
  }

  function metaHtml(c) {
    if (c.kind === 'player') {
      var ac = c.ac != null
        ? '<span class="badge badge--ac">AC ' + c.ac + '</span>' : '';
      return '<span class="item__meta"><span class="badge badge--player">Player</span>' +
        ac + '</span>';
    }
    if (c.kind === 'npc') {
      return '<span class="item__meta"><span class="badge badge--npc">NPC</span>' +
        '<span class="badge badge--ac">AC ' + c.ac + '</span></span>';
    }
    var t = c.template;
    return '<span class="item__meta">' + t.size + ' ' + t.type +
      ' &middot; CR ' + t.crLabel + ' &middot; AC ' + c.ac +
      (t.acDesc ? ' (' + t.acDesc + ')' : '') + '</span>';
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

  // Player controls: optional AC + remove.
  function playerControlsHtml(c) {
    return '<div class="manual">' +
      '<label class="ac-edit">AC <input type="number" min="0" ' +
        'class="manual__input manual__input--ac" data-role="ac" ' +
        'value="' + (c.ac != null ? c.ac : '') + '" placeholder="–"></label>' +
      '<button class="btn-set-ac" data-action="set-ac">Set AC</button>' +
      '<button class="btn-remove" data-action="remove">Remove</button>' +
    '</div>';
  }

  // Monster/NPC controls: just remove — the fight is run on the Game Session page.
  function monsterControlsHtml() {
    return '<div class="manual">' +
      '<button class="btn-remove" data-action="remove">Remove</button>' +
    '</div>';
  }

  function cardHtml(c) {
    var kindCls = ' item--' + c.kind;
    var inner = c.kind === 'player'
      ? playerControlsHtml(c)
      : monsterControlsHtml();
    var controls = '<div class="item__controls">' + inner + conditionsHtml(c) + '</div>';

    return '' +
      '<div class="item' + kindCls + '" data-id="' + c.id + '">' +
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
    el.encMeta.textContent = state.combatants.length
      ? (state.combatants.length + ' in encounter')
      : '';
    if (window.Battlemap) window.Battlemap.setCombatants(state.combatants);
  }

  // Re-render a single card (without disturbing the other cards).
  function rerenderCard(c) {
    var node = el.list.querySelector('.item[data-id="' + c.id + '"]');
    if (node) node.outerHTML = cardHtml(c);
  }

  /* ---- Actions ---- */

  function addMonster(slug) {
    var template = templateBySlug(slug);
    if (!template) return;
    state.combatants.push(createMonster(template));
    renderAll();
  }

  function addPlayer(name, initMod, ac) {
    name = (name || '').trim();
    if (!name) return;
    state.combatants.push(createPlayer(name, initMod, ac));
    renderAll();
  }

  // Bring a saved character sheet into the encounter.
  function addCharacterFromSheet(id) {
    var sheets = loadCharacters(), sheet = null;
    for (var i = 0; i < sheets.length; i++) if (sheets[i].id === id) sheet = sheets[i];
    if (!sheet) return;
    var isNpc = sheet.category === 'npc';
    state.combatants.push(isNpc ? createNpcFromSheet(sheet) : createPlayerFromSheet(sheet));
    renderAll();
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
    state.combatants = state.combatants.filter(function (x) { return x.id !== id; });
    renderAll();
  }

  function clearEncounter() {
    if (!state.combatants.length) return;
    state.combatants = [];
    renderAll();
  }

  // Hand the current roster over to the Game Session page and go there.
  function startGameSession() {
    if (!state.combatants.length) {
      window.alert('Nothing to play — add monsters and players first.');
      return;
    }
    var payload = {
      name: (el.encName && el.encName.value.trim()) || '',
      combatants: state.combatants.map(serializeCombatant),
      map: window.Battlemap ? window.Battlemap.getMap() : null
    };
    try {
      window.localStorage.setItem('diceAndMonsters.playSession', JSON.stringify(payload));
    } catch (e) {
      window.alert('Could not start the game session (storage blocked).');
      return;
    }
    window.location.href = 'play.html';
  }

  /* ---- Saving / loading encounters ---- */

  function loadSavedFromStorage() {
    try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || []; }
    catch (e) { return []; }
  }

  function persistSaved() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.saved)); }
    catch (e) { /* storage blocked (e.g. on file://) - stays in memory only */ }
    if (window.CloudSync) window.CloudSync.push('encounters');
  }
  // Re-read the (cloud-merged) saved encounters and re-render the list.
  function syncReloadEncounters() {
    state.saved = loadSavedFromStorage();
    renderSavedList();
  }

  // Plain-object snapshot of a combatant. Monsters keep only their
  // template slug (re-linked from the library on load) to stay lean.
  // Initiative fields ride along so the Game Session page can pick
  // up any per-combatant modifiers.
  function serializeCombatant(c) {
    var o = {
      kind: c.kind, name: c.name, hp: c.hp, maxHp: c.maxHp, ac: c.ac,
      dead: c.dead, initiative: c.initiative, initRoll: c.initRoll,
      initMod: c.initMod, conditions: c.conditions.slice(),
      x: (c.x == null ? null : c.x), y: (c.y == null ? null : c.y)
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
    c.x = (o.x == null ? null : o.x);
    c.y = (o.y == null ? null : o.y);
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
    if (!name) { window.alert('Give the encounter a name before saving.'); return false; }
    if (!state.combatants.length) {
      window.alert('Nothing to save — the encounter is empty.');
      return false;
    }
    var entry = {
      name: name,
      savedAt: Date.now(),
      combatants: state.combatants.map(serializeCombatant),
      map: window.Battlemap ? window.Battlemap.getMap() : null
    };
    var idx = savedIndexByName(name);
    if (idx !== -1) state.saved[idx] = entry; else state.saved.push(entry);
    state.saved.sort(function (a, b) { return a.name.localeCompare(b.name); });
    persistSaved();
    renderSavedList();
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
    if (window.Battlemap) window.Battlemap.setMap(entry.map || null);
    renderAll();
  }

  function deleteEncounter(index) {
    var entry = state.saved[index];
    if (!entry) return;
    if (!window.confirm('Delete saved encounter "' + entry.name + '"?')) return;
    state.saved.splice(index, 1);
    persistSaved();
    renderSavedList();
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

  function onListClick(ev) {
    var btn = ev.target.closest('[data-action]');
    if (!btn) return;
    var cardNode = btn.closest('.item');
    var id = parseInt(cardNode.getAttribute('data-id'), 10);
    var c = findCombatant(id);
    if (!c) return;
    var action = btn.getAttribute('data-action');

    if (action === 'set-ac') {
      var acInput = cardNode.querySelector('input[data-role="ac"]');
      var rawAc = (acInput && acInput.value || '').trim();
      var ac = parseInt(rawAc, 10);
      c.ac = (rawAc === '' || isNaN(ac) || ac < 0) ? null : ac;
      renderAll();        // refresh meta on the card

    } else if (action === 'add-condition') {
      var condInput = cardNode.querySelector('input[data-role="condition"]');
      if (addCondition(c, condInput && condInput.value)) rerenderCard(c);

    } else if (action === 'remove-condition') {
      removeCondition(c, btn.getAttribute('data-cond'));
      rerenderCard(c);

    } else if (action === 'remove') {
      removeCombatant(id);
    }
  }

  // Enter in a field = press the matching button on the card.
  function onListKeydown(ev) {
    if (ev.key !== 'Enter') return;
    var input = ev.target;
    if (!input.matches || !input.matches('input[data-role]')) return;
    var action = {
      ac: 'set-ac', condition: 'add-condition'
    }[input.getAttribute('data-role')];
    if (!action) return;
    var btn = input.closest('.item').querySelector('button[data-action="' + action + '"]');
    if (btn) { ev.preventDefault(); btn.click(); }
  }

  /* ---- Battlemap (design mode: paint terrain, place tokens) ---- */
  // Highlight only — never scroll on token-grab, or the page jumps away from
  // the map mid-drag.
  function selectMapToken(id) {
    var nodes = el.list.querySelectorAll('.item');
    for (var i = 0; i < nodes.length; i++) {
      var nid = parseInt(nodes[i].getAttribute('data-id'), 10);
      nodes[i].classList.toggle('item--selected', id != null && nid === id);
    }
  }

  function initBattlemap() {
    var BM = window.Battlemap;
    var canvas = document.querySelector('#battlemap-canvas');
    if (!BM || !canvas) return;
    BM.init({
      canvas: canvas,
      wrap: document.querySelector('#battlemap-wrap'),
      distanceEl: document.querySelector('#battlemap-dist'),
      onSelect: selectMapToken
    });
    BM.setMode('design');
    BM.buildToolbar(document.querySelector('#battlemap-tools'));
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
    el.encName    = document.querySelector('#encounter-name');
    el.saveBtn    = document.querySelector('.btn-save-encounter');
    el.savedList  = document.querySelector('#saved-list');
    el.clearBtn   = document.querySelector('.btn-clear');
    el.startPlayBtn = document.querySelector('.btn-start-play');
    el.list       = document.querySelector('.monster__list');
    el.encMeta    = document.querySelector('#encounter-meta');

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
    initBattlemap();
    renderAll();
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

    function submitSave() {
      if (saveEncounter(el.encName.value)) el.encName.value = '';
    }
    el.saveBtn.addEventListener('click', submitSave);
    el.encName.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitSave();
    });
    el.savedList.addEventListener('click', onSavedClick);

    el.clearBtn.addEventListener('click', clearEncounter);
    if (el.startPlayBtn) el.startPlayBtn.addEventListener('click', startGameSession);
    el.list.addEventListener('click', onListClick);
    el.list.addEventListener('keydown', onListKeydown);

    if (window.CloudSync) {
      window.CloudSync.attach({
        kind: 'encounters', lsKey: STORAGE_KEY, idKey: 'name',
        mount: '#cloud-bar', onRemoteChange: syncReloadEncounters
      });
    }

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
  }

  document.addEventListener('DOMContentLoaded', init);
})();
