/* ============================================================
   Dice & Monsters
   ------------------------------------------------------------
   Restrukturert i tydelige lag:
     1. Terninger      - tilfeldighet og terningkast
     2. Data           - monsterbiblioteket (fra monsters-data.js)
     3. Modell         - combatants med HP/skade/dod
     4. Kamp           - angrep, treff, skade -> encounter
     5. UI             - rendring, kamplogg, hendelser
   ============================================================ */
(function () {
  'use strict';

  /* =========================================================
     1. TERNINGER
     ========================================================= */

  // Kast en terning med gitt antall sider (1..sides).
  function rollDie(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  // Kast `count` terninger med `sides` sider og summer.
  function rollDice(count, sides) {
    var sum = 0;
    for (var i = 0; i < count; i++) sum += rollDie(sides);
    return sum;
  }

  // D&D ability modifier ut fra en ability score.
  function abilityMod(score) {
    return Math.floor((score - 10) / 2);
  }

  // Pent fortegn: 3 -> "+3", -1 -> "-1".
  function signed(n) {
    return (n >= 0 ? '+' : '') + n;
  }

  /* =========================================================
     2. DATA
     ========================================================= */

  // Hele biblioteket (alle monstrene fra fila), satt i init().
  var library = [];

  // Aktiv tilstand for encounteren.
  var state = {
    combatants: [],
    nextId: 1
  };

  /* =========================================================
     3. MODELL  (en combatant = et monster i kamp)
     ========================================================= */

  // Rull HP fra hit dice (f.eks. "18d10+36"). Faller tilbake
  // til standard-HP hvis noe ikke lar seg tolke.
  function rollHp(template) {
    var m = /(\d+)d(\d+)([+\-]\d+)?/.exec(template.hitDice || '');
    if (!m) return template.hp;
    var count = +m[1], sides = +m[2], bonus = m[3] ? +m[3] : 0;
    return Math.max(1, rollDice(count, sides) + bonus);
  }

  // Lag en ny combatant fra en biblioteksmal.
  function createCombatant(template) {
    var maxHp = rollHp(template);
    return {
      id: state.nextId++,
      template: template,
      name: template.name,
      ac: template.ac,
      maxHp: maxHp,
      hp: maxHp,
      dead: false,
      attacks: template.attacks || []
    };
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

  /* =========================================================
     4. KAMP  (skade, helbredelse, angrep -> encounter)
     ========================================================= */

  // Trekk fra HP. Setter dod-flagget nar HP treffer 0.
  function applyDamage(c, amount) {
    if (amount < 0) amount = 0;
    c.hp = Math.max(0, c.hp - amount);
    c.dead = c.hp === 0;
    return amount;
  }

  // Legg til HP (maks maxHp). Vekker monsteret hvis det far HP igjen.
  function applyHeal(c, amount) {
    if (amount < 0) amount = 0;
    c.hp = Math.min(c.maxHp, c.hp + amount);
    if (c.hp > 0) c.dead = false;
    return amount;
  }

  // Utfor et angrep fra `attacker` med `attack` mot `target`.
  // Ruller treff (d20 + toHit) mot malets AC, og skade ved treff.
  // `target` kan vaere null (kast uten et mal a treffe).
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

    var attackName = attack.name;
    var who = combatantLabel(attacker) + ' bruker ' + attackName;
    var vs = target ? (' mot ' + combatantLabel(target)) : '';

    // Bom: naturlig 1, eller treff lavere enn malets AC.
    var isMiss = fumble || (target && toHit < target.ac);
    if (isMiss) {
      var why = fumble ? 'Kritisk bom!' :
        ('rullet ' + toHit + ' vs AC ' + target.ac + ' - bom.');
      logLine(who + vs + ': ' + why, 'miss');
      return;
    }

    // Treff: rull skade. Kritisk treff dobler antall terninger.
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

  /* =========================================================
     5. UI
     ========================================================= */

  var el = {}; // hurtigreferanser til DOM-noder

  // ---- Kamplogg ----
  function logLine(text, cls) {
    var line = document.createElement('div');
    line.className = 'log__line' + (cls ? ' log__line--' + cls : '');
    line.textContent = text;
    el.log.insertBefore(line, el.log.firstChild);
  }

  // ---- Monstervelger (alle monstrene fra fila) ----
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

  // Fyll nedtrekkslista ut fra sok + CR-filter.
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

  // ---- Rendring av combatant-kort ----
  function hpClass(c) {
    var ratio = c.hp / c.maxHp;
    if (c.dead) return 'hpbar__fill--dead';
    if (ratio <= 0.33) return 'hpbar__fill--low';
    if (ratio <= 0.66) return 'hpbar__fill--mid';
    return '';
  }

  function attackButtonsHtml(c) {
    if (!c.attacks.length) {
      return '<p class="no-attacks">Ingen vapenangrep - bruk manuell skade.</p>';
    }
    return c.attacks.map(function (a, i) {
      var dice = a.sides > 0 ? (a.count + 'd' + a.sides) : '';
      var bonus = a.bonus ? signed(a.bonus) : '';
      var dmg = (dice + (dice && bonus ? ' ' : '') + bonus).trim() || '0';
      var tag = a.ranged ? ' &#10148;' : '';
      return '<button class="btn-attack" data-action="attack" data-attack="' + i + '">' +
        a.name + tag + '<span class="btn-attack__meta">' +
        signed(a.toHit) + ' treff &middot; ' + dmg + ' ' + a.type + '</span></button>';
    }).join('');
  }

  function targetSelectHtml(c) {
    var others = state.combatants.filter(function (o) {
      return o.id !== c.id && !o.dead;
    });
    var opts = '<option value="">- ingen / bare kast -</option>';
    opts += others.map(function (o) {
      return '<option value="' + o.id + '">' + combatantLabel(o) +
        ' (AC ' + o.ac + ')</option>';
    }).join('');
    return '<label class="target">Mal: <select data-role="target">' +
      opts + '</select></label>';
  }

  function cardHtml(c) {
    var t = c.template;
    var ratio = Math.round(c.hp / c.maxHp * 100);
    var stats = ['str', 'dex', 'con', 'int', 'wis', 'cha'].map(function (k) {
      return k.toUpperCase() + ' ' + signed(abilityMod(t[k]));
    }).join(' &middot; ');

    return '' +
      '<div class="item' + (c.dead ? ' item--dead' : '') + '" data-id="' + c.id + '">' +
        '<div class="item__head">' +
          '<span class="item__name">' + combatantLabel(c) + '</span>' +
          '<span class="item__meta">' + t.size + ' ' + t.type +
            ' &middot; CR ' + t.crLabel + ' &middot; AC ' + c.ac +
            (t.acDesc ? ' (' + t.acDesc + ')' : '') + '</span>' +
        '</div>' +
        '<div class="hpbar">' +
          '<div class="hpbar__fill ' + hpClass(c) + '" style="width:' + ratio + '%"></div>' +
          '<span class="hpbar__label">' + c.hp + ' / ' + c.maxHp + ' HP' +
            (c.dead ? ' &middot; DOD' : '') + '</span>' +
        '</div>' +
        '<div class="item__stats">' + stats + '</div>' +
        '<div class="item__controls">' +
          targetSelectHtml(c) +
          '<div class="attacks">' + attackButtonsHtml(c) + '</div>' +
          '<div class="manual">' +
            '<input type="number" min="0" class="manual__input" data-role="amount" placeholder="HP">' +
            '<button class="btn-damage" data-action="damage">Ta skade</button>' +
            '<button class="btn-heal" data-action="heal">Helbred</button>' +
            '<button class="btn-remove" data-action="remove">Fjern</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // Full omtegning (ved add/remove - oppdaterer ogsa mal-lister).
  function renderAll() {
    if (!state.combatants.length) {
      el.list.innerHTML = '<p class="empty">Ingen monstre i encounteren enna. ' +
        'Velg et monster over og legg det til.</p>';
    } else {
      el.list.innerHTML = state.combatants.map(cardHtml).join('');
    }
    el.encMeta.textContent = state.combatants.length
      ? (state.combatants.length + ' monstre - ' +
         state.combatants.filter(function (c) { return !c.dead; }).length + ' i live')
      : '';
  }

  // Lett oppdatering av ett kort (HP-bar + dod-status) uten full omtegning.
  function refreshCard(c) {
    var node = el.list.querySelector('.item[data-id="' + c.id + '"]');
    if (!node) return;
    node.classList.toggle('item--dead', c.dead);
    var fill = node.querySelector('.hpbar__fill');
    fill.style.width = Math.round(c.hp / c.maxHp * 100) + '%';
    fill.className = 'hpbar__fill ' + hpClass(c);
    node.querySelector('.hpbar__label').textContent =
      c.hp + ' / ' + c.maxHp + ' HP' + (c.dead ? ' · DOD' : '');
    el.encMeta.textContent = state.combatants.length + ' monstre - ' +
      state.combatants.filter(function (x) { return !x.dead; }).length + ' i live';
  }

  /* ---- Handlinger ---- */

  function addMonster(slug) {
    var template = templateBySlug(slug);
    if (!template) return;
    var c = createCombatant(template);
    state.combatants.push(c);
    renderAll();
    logLine(combatantLabel(c) + ' dukker opp (' + c.maxHp + ' HP, AC ' + c.ac + ').', 'spawn');
  }

  function removeMonster(id) {
    var c = findCombatant(id);
    state.combatants = state.combatants.filter(function (x) { return x.id !== id; });
    renderAll();
    if (c) logLine(combatantLabel(c) + ' fjernet fra encounteren.', 'spawn');
  }

  function clearEncounter() {
    if (!state.combatants.length) return;
    state.combatants = [];
    renderAll();
    logLine('Encounteren ble tomt.', 'spawn');
  }

  // Les <select data-role="target"> i et kort -> combatant eller null.
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

  // Hendelsesdelegering for alle kort-knapper.
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
      removeMonster(id);
    }
  }

  /* ---- Init ---- */
  function init() {
    el.search    = document.querySelector('#search');
    el.crFilter  = document.querySelector('#cr-filter');
    el.select    = document.querySelector('#monster-select');
    el.count     = document.querySelector('#match-count');
    el.addBtn    = document.querySelector('.btn-add');
    el.randomBtn = document.querySelector('.btn-random');
    el.clearBtn  = document.querySelector('.btn-clear');
    el.list      = document.querySelector('.monster__list');
    el.encMeta   = document.querySelector('#encounter-meta');
    el.log       = document.querySelector('#log');

    library = (window.MONSTER_DATA || []).slice();

    if (!library.length) {
      el.list.innerHTML = '<p class="empty">Fant ingen monsterdata. ' +
        'Sjekk at monsters-data.js er lastet.</p>';
      return;
    }

    populateCrFilter();
    populateMonsterSelect();
    renderAll();

    el.search.addEventListener('input', populateMonsterSelect);
    el.crFilter.addEventListener('change', populateMonsterSelect);

    el.addBtn.addEventListener('click', function () {
      if (el.select.value) addMonster(el.select.value);
    });

    el.randomBtn.addEventListener('click', function () {
      var opts = el.select.options;
      if (!opts.length) return;
      addMonster(opts[Math.floor(Math.random() * opts.length)].value);
    });

    el.clearBtn.addEventListener('click', clearEncounter);
    el.list.addEventListener('click', onListClick);

    logLine('Klar! ' + library.length + ' monstre lastet. Bygg en encounter.', 'spawn');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
