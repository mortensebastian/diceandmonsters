/* ============================================================
   Dice & Monsters
   ------------------------------------------------------------
   Restrukturert i tydelige lag:
     1. Terninger      - tilfeldighet og terningkast
     2. Data           - monsterbiblioteket + tilstand
     3. Modell         - combatants (monster ELLER spiller)
     4. Kamp           - angrep, skade, dod, initiativ, turordning
     5. UI             - rendring, kamplogg, hendelser

   En "combatant" er enten et monster eller en spiller. Spillere
   har forelopig bare navn (+ valgfritt initiativ-tillegg), men
   modellen har plass til hp/maxHp/ac/stats slik at et fullt
   character sheet kan kobles pa senere uten a rive opp resten.
   ============================================================ */
(function () {
  'use strict';

  /* =========================================================
     1. TERNINGER
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

  /* =========================================================
     2. DATA + TILSTAND
     ========================================================= */

  var library = []; // alle monstrene fra fila

  var state = {
    combatants: [], // monstre og spillere om hverandre
    nextId: 1,
    activeId: null  // hvem sin tur det er (id), eller null
  };

  /* =========================================================
     3. MODELL
     ========================================================= */

  // Felles "skall" for en combatant. Spillere far null der de
  // mangler tall na - fyll dem inn senere for HP/stats.
  function baseCombatant(kind, name) {
    return {
      id: state.nextId++,
      kind: kind,        // 'monster' | 'player'
      name: name,
      hp: null,          // settes for noe med HP-counter
      maxHp: null,
      ac: null,
      dead: false,
      initiative: null,  // settes nar initiativ rulles
      initMod: 0,         // tillegg til initiativ-kastet
      attacks: []
    };
  }

  // Rull HP fra hit dice (f.eks. "18d10+36").
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

  // Spiller: bare navn (+ valgfritt initiativ-tillegg) for na.
  // Senere: sett c.maxHp/c.hp for HP-counter, c.ac, c.attacks osv.
  function createPlayer(name, initMod) {
    var c = baseCombatant('player', name);
    c.initMod = initMod || 0;
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

  // Har denne combatanten en HP-counter? (Spillere: ikke enna.)
  function hasHp(c) {
    return c.maxHp != null;
  }

  /* =========================================================
     4. KAMP
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
      logLine(combatantLabel(attacker) + ' angriper ' +
        combatantLabel(target) + ', men det er allerede dodt.', 'miss');
      return;
    }

    var d20 = rollDie(20);
    var crit = d20 === 20;
    var fumble = d20 === 1;
    var toHit = d20 + attack.toHit;

    var who = combatantLabel(attacker) + ' bruker ' + attack.name;
    var vs = target ? (' mot ' + combatantLabel(target)) : '';

    var isMiss = fumble || (target && toHit < target.ac);
    if (isMiss) {
      var why = fumble ? 'Kritisk bom!' :
        ('rullet ' + toHit + ' vs AC ' + target.ac + ' - bom.');
      logLine(who + vs + ': ' + why, 'miss');
      return;
    }

    var diceCount = attack.count * (crit ? 2 : 1);
    var dmg = (attack.sides > 0 ? rollDice(diceCount, attack.sides) : 0) + attack.bonus;
    if (dmg < 0) dmg = 0;

    var hitTxt = crit ? 'KRITISK TREFF!' :
      ('rullet ' + toHit + (target ? ' vs AC ' + target.ac : '') + ' - treff.');
    var dmgTxt = dmg + ' ' + (attack.type || '') + ' skade';

    if (target) {
      applyDamage(target, dmg);
      var status = target.dead
        ? (' ' + combatantLabel(target) + ' DOR!')
        : (' (' + target.hp + '/' + target.maxHp + ' HP igjen)');
      logLine(who + vs + ': ' + hitTxt + ' ' + dmgTxt + '.' + status,
        target.dead ? 'kill' : 'hit');
      refreshCard(target);
    } else {
      logLine(who + ': ' + hitTxt + ' ' + dmgTxt + '.', 'hit');
    }
  }

  // ---- Initiativ + turordning ----

  // Rull d20 + initMod for alle. Setter forste til aktiv.
  function rollInitiative() {
    if (!state.combatants.length) return;
    state.combatants.forEach(function (c) {
      c.initiative = rollDie(20) + c.initMod;
    });
    logLine('--- Initiativ rullet ---', 'turn');
    orderedCombatants().forEach(function (c) {
      logLine(combatantLabel(c) + ': ' + c.initiative +
        ' (d20 ' + signed(c.initMod) + ')', 'turn');
    });
    var order = orderedAlive();
    state.activeId = order.length ? order[0].id : null;
    renderAll();
    renderTurnOrder();
    if (state.activeId) {
      logLine('Forst ut: ' + combatantLabel(findCombatant(state.activeId)) + '.', 'turn');
    }
  }

  // Alle med initiativ, sortert hoyest forst (tie-break: initMod, id).
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

  // Gi tur til neste levende combatant i rekkefolgen.
  function nextTurn() {
    var order = orderedAlive();
    if (!order.length) { state.activeId = null; return; }
    var ids = order.map(function (c) { return c.id; });
    var idx = ids.indexOf(state.activeId);
    var nextIdx = (idx + 1) % ids.length;
    if (idx !== -1 && nextIdx === 0) logLine('--- Ny runde ---', 'turn');
    state.activeId = ids[nextIdx];
    logLine('Tur: ' + combatantLabel(findCombatant(state.activeId)) + '.', 'turn');
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

  // ---- Monstervelger ----
  function uniqueCrLabels() {
    var seen = {}, list = [];
    library.forEach(function (m) {
      if (!seen[m.crLabel]) { seen[m.crLabel] = true; list.push(m); }
    });
    list.sort(function (a, b) { return a.cr - b.cr; });
    return list.map(function (m) { return m.crLabel; });
  }

  function populateCrFilter() {
    var opts = '<option value="">Alle CR</option>';
    uniqueCrLabels().forEach(function (cr) {
      opts += '<option value="' + cr + '">CR ' + cr + '</option>';
    });
    el.crFilter.innerHTML = opts;
  }

  function populateMonsterSelect() {
    var q = el.search.value.trim().toLowerCase();
    var cr = el.crFilter.value;
    var matches = library.filter(function (m) {
      if (cr && m.crLabel !== cr) return false;
      if (q && m.name.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    el.select.innerHTML = matches.map(function (m) {
      return '<option value="' + m.slug + '">' + m.name +
        '  (CR ' + m.crLabel + ', ' + m.attacks.length + ' angrep)</option>';
    }).join('');

    el.count.textContent = matches.length + ' av ' + library.length + ' monstre';
    el.addBtn.disabled = matches.length === 0;
  }

  function templateBySlug(slug) {
    for (var i = 0; i < library.length; i++) {
      if (library[i].slug === slug) return library[i];
    }
    return null;
  }

  // ---- Kort-rendring ----
  function hpClass(c) {
    var ratio = c.hp / c.maxHp;
    if (c.dead) return 'hpbar__fill--dead';
    if (ratio <= 0.33) return 'hpbar__fill--low';
    if (ratio <= 0.66) return 'hpbar__fill--mid';
    return '';
  }

  function hpBarHtml(c) {
    if (!hasHp(c)) {
      return '<div class="hp-todo">Ingen HP enda - legges til senere.</div>';
    }
    var ratio = Math.round(c.hp / c.maxHp * 100);
    return '<div class="hpbar">' +
      '<div class="hpbar__fill ' + hpClass(c) + '" style="width:' + ratio + '%"></div>' +
      '<span class="hpbar__label">' + c.hp + ' / ' + c.maxHp + ' HP' +
        (c.dead ? ' &middot; DOD' : '') + '</span>' +
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
        signed(a.toHit) + ' treff &middot; ' + dmg + ' ' + a.type + '</span></button>';
    }).join('') + '</div>';
  }

  function targetSelectHtml(c) {
    // Bare combatants som faktisk kan ta skade (har HP) og lever.
    var others = state.combatants.filter(function (o) {
      return o.id !== c.id && !o.dead && hasHp(o);
    });
    if (!c.attacks.length) return '';
    var opts = '<option value="">- ingen / bare kast -</option>';
    opts += others.map(function (o) {
      return '<option value="' + o.id + '">' + combatantLabel(o) +
        ' (AC ' + o.ac + ')</option>';
    }).join('');
    return '<label class="target">Mal: <select data-role="target">' +
      opts + '</select></label>';
  }

  function manualHtml(c) {
    if (!hasHp(c)) return '';
    return '<div class="manual">' +
      '<input type="number" min="0" class="manual__input" data-role="amount" placeholder="HP">' +
      '<button class="btn-damage" data-action="damage">Ta skade</button>' +
      '<button class="btn-heal" data-action="heal">Helbred</button>' +
      '<button class="btn-remove" data-action="remove">Fjern</button>' +
    '</div>';
  }

  function metaHtml(c) {
    var init = c.initiative != null
      ? '<span class="badge badge--init">Init ' + c.initiative + '</span>' : '';
    if (c.kind === 'player') {
      return '<span class="item__meta"><span class="badge badge--player">Spiller</span>' +
        init + '</span>';
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

  function cardHtml(c) {
    var active = c.id === state.activeId ? ' item--active' : '';
    var dead = c.dead ? ' item--dead' : '';
    var kindCls = ' item--' + c.kind;
    var controls = '';
    var t = targetSelectHtml(c) + attackButtonsHtml(c) + manualHtml(c);
    if (!hasHp(c) && c.kind === 'player') {
      // Spiller uten stats: bare en fjern-knapp na.
      t += '<div class="manual"><button class="btn-remove" data-action="remove">Fjern</button></div>';
    }
    if (t) controls = '<div class="item__controls">' + t + '</div>';

    return '' +
      '<div class="item' + kindCls + active + dead + '" data-id="' + c.id + '">' +
        '<div class="item__head">' +
          '<span class="item__name">' + combatantLabel(c) + '</span>' +
          metaHtml(c) +
        '</div>' +
        hpBarHtml(c) +
        statsHtml(c) +
        controls +
      '</div>';
  }

  function renderAll() {
    if (!state.combatants.length) {
      el.list.innerHTML = '<p class="empty">Ingen i encounteren enna. ' +
        'Legg til monstre og spillere over.</p>';
    } else {
      el.list.innerHTML = state.combatants.map(cardHtml).join('');
    }
    var alive = state.combatants.filter(function (c) { return !c.dead; }).length;
    el.encMeta.textContent = state.combatants.length
      ? (state.combatants.length + ' i encounteren - ' + alive + ' i live')
      : '';
  }

  // Turordning-sporing.
  function renderTurnOrder() {
    var order = orderedCombatants();
    if (!order.length) {
      el.turnOrder.innerHTML =
        '<p class="turn__hint">Rull initiativ for a sette turordningen.</p>';
      el.nextBtn.disabled = true;
      return;
    }
    el.nextBtn.disabled = false;
    el.turnOrder.innerHTML = order.map(function (c) {
      var cls = 'turn__row';
      if (c.id === state.activeId) cls += ' turn__row--active';
      if (c.dead) cls += ' turn__row--dead';
      return '<div class="' + cls + '" data-id="' + c.id + '">' +
        '<span class="turn__init">' + c.initiative + '</span>' +
        '<span class="turn__name">' + c.name + '</span>' +
        '<span class="turn__tag">' + (c.kind === 'player' ? 'spiller' : 'monster') +
          (c.dead ? ' &middot; dod' : '') + '</span>' +
      '</div>';
    }).join('');
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
      label.textContent = c.hp + ' / ' + c.maxHp + ' HP' + (c.dead ? ' · DOD' : '');
    }
    var alive = state.combatants.filter(function (x) { return !x.dead; }).length;
    el.encMeta.textContent = state.combatants.length + ' i encounteren - ' + alive + ' i live';
    renderTurnOrder();
  }

  function updateActiveHighlight() {
    var nodes = el.list.querySelectorAll('.item');
    for (var i = 0; i < nodes.length; i++) {
      var id = parseInt(nodes[i].getAttribute('data-id'), 10);
      nodes[i].classList.toggle('item--active', id === state.activeId);
    }
  }

  /* ---- Handlinger ---- */

  // Hvis kampen alt er i gang, gi nykommeren et initiativ med en gang.
  function rollInitiativeIfActive(c) {
    var inProgress = state.combatants.some(function (x) {
      return x.id !== c.id && x.initiative != null;
    });
    if (inProgress) {
      c.initiative = rollDie(20) + c.initMod;
      logLine(combatantLabel(c) + ' ruller initiativ ' + c.initiative + '.', 'turn');
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
    logLine(combatantLabel(c) + ' dukker opp (' + c.maxHp + ' HP, AC ' + c.ac + ').', 'spawn');
  }

  function addPlayer(name, initMod) {
    name = (name || '').trim();
    if (!name) return;
    var c = createPlayer(name, initMod);
    state.combatants.push(c);
    rollInitiativeIfActive(c);
    renderAll();
    renderTurnOrder();
    logLine('Spiller ' + combatantLabel(c) + ' blir med' +
      (initMod ? ' (init ' + signed(initMod) + ')' : '') + '.', 'spawn');
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
    if (c) logLine(combatantLabel(c) + ' fjernet.', 'spawn');
  }

  function clearEncounter() {
    if (!state.combatants.length) return;
    state.combatants = [];
    state.activeId = null;
    renderAll();
    renderTurnOrder();
    logLine('Encounteren ble tomt.', 'spawn');
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
        logLine(combatantLabel(c) + ' tar ' + dmg + ' skade.' +
          (c.dead ? ' Den DOR!' : ' (' + c.hp + '/' + c.maxHp + ' HP)'),
          c.dead ? 'kill' : 'hit');
        refreshCard(c);
      }

    } else if (action === 'heal') {
      var amt = readAmount(cardNode);
      if (amt > 0) {
        applyHeal(c, amt);
        logLine(combatantLabel(c) + ' helbredes ' + amt + ' HP (' +
          c.hp + '/' + c.maxHp + ').', 'heal');
        refreshCard(c);
      }

    } else if (action === 'remove') {
      removeCombatant(id);
    }
  }

  /* ---- Init ---- */
  function init() {
    el.search     = document.querySelector('#search');
    el.crFilter   = document.querySelector('#cr-filter');
    el.select     = document.querySelector('#monster-select');
    el.count      = document.querySelector('#match-count');
    el.addBtn     = document.querySelector('.btn-add');
    el.randomBtn  = document.querySelector('.btn-random');
    el.playerName = document.querySelector('#player-name');
    el.playerInit = document.querySelector('#player-init');
    el.addPlayer  = document.querySelector('.btn-add-player');
    el.initBtn    = document.querySelector('.btn-init');
    el.nextBtn    = document.querySelector('.btn-next');
    el.turnOrder  = document.querySelector('#turn-order');
    el.clearBtn   = document.querySelector('.btn-clear');
    el.list       = document.querySelector('.monster__list');
    el.encMeta    = document.querySelector('#encounter-meta');
    el.log        = document.querySelector('#log');

    library = (window.MONSTER_DATA || []).slice();

    if (!library.length) {
      el.list.innerHTML = '<p class="empty">Fant ingen monsterdata. ' +
        'Sjekk at monsters-data.js er lastet.</p>';
      return;
    }

    populateCrFilter();
    populateMonsterSelect();
    renderAll();
    renderTurnOrder();

    el.search.addEventListener('input', populateMonsterSelect);
    el.crFilter.addEventListener('change', populateMonsterSelect);

    el.addBtn.addEventListener('click', function () {
      if (el.select.value) addMonster(el.select.value);
    });

    el.randomBtn.addEventListener('click', function () {
      var opts = el.select.options;
      if (opts.length) addMonster(opts[Math.floor(Math.random() * opts.length)].value);
    });

    function submitPlayer() {
      var initMod = parseInt(el.playerInit.value, 10);
      addPlayer(el.playerName.value, isNaN(initMod) ? 0 : initMod);
      el.playerName.value = '';
      el.playerInit.value = '';
      el.playerName.focus();
    }
    el.addPlayer.addEventListener('click', submitPlayer);
    el.playerName.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitPlayer();
    });

    el.initBtn.addEventListener('click', rollInitiative);
    el.nextBtn.addEventListener('click', nextTurn);
    el.clearBtn.addEventListener('click', clearEncounter);
    el.list.addEventListener('click', onListClick);

    logLine('Klar! ' + library.length + ' monstre lastet. Legg til monstre og spillere.', 'spawn');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
