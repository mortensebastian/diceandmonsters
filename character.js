/* ============================================================
   Dice & Monsters — Character Sheet
   ------------------------------------------------------------
   A local-first 5e character sheet. Characters are stored in
   localStorage; the data shape mirrors what will later sync to
   Supabase (one freeform object per character), so cloud sync can
   be added without reworking this.
   ============================================================ */
(function () {
  'use strict';

  /* ---- Helpers ---- */
  function mod(score) { return Math.floor(((score || 10) - 10) / 2); }
  function signed(n) { return (n >= 0 ? '+' : '') + n; }
  function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function getByPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function setByPath(obj, path, value) {
    var parts = path.split('.'), o = obj, i;
    for (i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  }

  /* ---- Reference data ---- */
  var ABILITIES = [
    { key: 'str', label: 'Strength' },
    { key: 'dex', label: 'Dexterity' },
    { key: 'con', label: 'Constitution' },
    { key: 'int', label: 'Intelligence' },
    { key: 'wis', label: 'Wisdom' },
    { key: 'cha', label: 'Charisma' }
  ];
  var ABIL_LABEL = {};
  ABILITIES.forEach(function (a) { ABIL_LABEL[a.key] = a.label; });

  var SAVE_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

  var SKILLS = [
    { key: 'acrobatics', label: 'Acrobatics', ability: 'dex' },
    { key: 'animalHandling', label: 'Animal Handling', ability: 'wis' },
    { key: 'arcana', label: 'Arcana', ability: 'int' },
    { key: 'athletics', label: 'Athletics', ability: 'str' },
    { key: 'deception', label: 'Deception', ability: 'cha' },
    { key: 'history', label: 'History', ability: 'int' },
    { key: 'insight', label: 'Insight', ability: 'wis' },
    { key: 'intimidation', label: 'Intimidation', ability: 'cha' },
    { key: 'investigation', label: 'Investigation', ability: 'int' },
    { key: 'medicine', label: 'Medicine', ability: 'wis' },
    { key: 'nature', label: 'Nature', ability: 'int' },
    { key: 'perception', label: 'Perception', ability: 'wis' },
    { key: 'performance', label: 'Performance', ability: 'cha' },
    { key: 'persuasion', label: 'Persuasion', ability: 'cha' },
    { key: 'religion', label: 'Religion', ability: 'int' },
    { key: 'sleightOfHand', label: 'Sleight of Hand', ability: 'dex' },
    { key: 'stealth', label: 'Stealth', ability: 'dex' },
    { key: 'survival', label: 'Survival', ability: 'wis' }
  ];

  /* ---- State + storage ---- */
  var STORAGE = 'diceAndMonsters.characters';
  var ACTIVE = 'diceAndMonsters.activeCharacter';

  var chars = [];
  var active = null;
  var el = {};
  var statusTimer = null;

  function newCharacter() {
    return {
      id: uid(),
      name: 'New character',
      cls: '', level: 1, race: '', background: '', alignment: '',
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      saveProf: {}, skillProf: {},
      ac: 10, initBonus: 0, speed: 30,
      hp: { max: 0, current: 0, temp: 0 }, hitDice: '',
      attacks: [],
      features: '', equipment: ''
    };
  }

  function loadAll() {
    try { return JSON.parse(window.localStorage.getItem(STORAGE)) || []; }
    catch (e) { return []; }
  }
  function persist() {
    try { window.localStorage.setItem(STORAGE, JSON.stringify(chars)); } catch (e) { /* ignore */ }
    status('Saved');
  }
  function setActiveId(id) { try { window.localStorage.setItem(ACTIVE, id); } catch (e) { /* ignore */ } }
  function getActiveId() { try { return window.localStorage.getItem(ACTIVE); } catch (e) { return null; } }

  function status(text) {
    el.status.textContent = text;
    el.status.classList.add('save-status--show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      el.status.classList.remove('save-status--show');
    }, 1200);
  }

  /* ---- Derived values ---- */
  function profBonus() { return 2 + Math.floor(((active.level || 1) - 1) / 4); }
  function abilMod(key) { return mod(active.abilities[key]); }

  /* ---- Rendering ---- */
  function renderSelector() {
    el.select.innerHTML = chars.map(function (c) {
      var label = (c.name || 'Unnamed') +
        (c.cls || c.level ? '  (' + (c.cls || 'class') + ' ' + (c.level || 1) + ')' : '');
      return '<option value="' + c.id + '"' + (c.id === active.id ? ' selected' : '') + '>' +
        esc(label) + '</option>';
    }).join('');
  }

  function renderAbilities() {
    el.abilities.innerHTML = ABILITIES.map(function (a) {
      return '<div class="ability">' +
        '<div class="ability__label">' + a.label + '</div>' +
        '<input type="number" class="ability__score" data-field="abilities.' + a.key + '">' +
        '<div class="ability__mod" id="mod-' + a.key + '">+0</div>' +
      '</div>';
    }).join('');
  }

  function renderSaves() {
    el.saves.innerHTML = SAVE_KEYS.map(function (k) {
      return '<label class="check">' +
        '<input type="checkbox" data-saveprof="' + k + '">' +
        '<span class="check__val" id="save-' + k + '">+0</span>' +
        '<span class="check__name">' + ABIL_LABEL[k] + '</span>' +
      '</label>';
    }).join('');
  }

  function renderSkills() {
    el.skills.innerHTML = SKILLS.map(function (s) {
      return '<label class="check">' +
        '<input type="checkbox" data-skillprof="' + s.key + '">' +
        '<span class="check__val" id="skill-' + s.key + '">+0</span>' +
        '<span class="check__name">' + s.label +
          ' <em>(' + s.ability.toUpperCase() + ')</em></span>' +
      '</label>';
    }).join('');
  }

  function renderAttacks() {
    el.attacks.innerHTML = active.attacks.length
      ? active.attacks.map(function (at, i) {
          return '<div class="attack-row" data-attack-index="' + i + '">' +
            '<input type="text" placeholder="Name" data-attack-field="name" value="' + esc(at.name) + '">' +
            '<input type="text" placeholder="Atk +" data-attack-field="bonus" value="' + esc(at.bonus) + '">' +
            '<input type="text" placeholder="Damage" data-attack-field="damage" value="' + esc(at.damage) + '">' +
            '<button type="button" class="btn-del-attack" title="Remove">&times;</button>' +
          '</div>';
        }).join('')
      : '<p class="muted">No attacks yet.</p>';
  }

  // Fill every static [data-field] input from the active character.
  function fillFields() {
    var nodes = el.sheet.querySelectorAll('[data-field]');
    Array.prototype.forEach.call(nodes, function (n) {
      var v = getByPath(active, n.getAttribute('data-field'));
      n.value = (v == null ? '' : v);
    });
    Array.prototype.forEach.call(
      el.sheet.querySelectorAll('[data-saveprof]'), function (n) {
        n.checked = !!active.saveProf[n.getAttribute('data-saveprof')];
      });
    Array.prototype.forEach.call(
      el.sheet.querySelectorAll('[data-skillprof]'), function (n) {
        n.checked = !!active.skillProf[n.getAttribute('data-skillprof')];
      });
  }

  // Recompute and write all derived numbers (no input rebuild).
  function updateDerived() {
    var pb = profBonus();
    el.profBonus.textContent = signed(pb);

    ABILITIES.forEach(function (a) {
      var span = document.getElementById('mod-' + a.key);
      if (span) span.textContent = signed(abilMod(a.key));
    });
    SAVE_KEYS.forEach(function (k) {
      var total = abilMod(k) + (active.saveProf[k] ? pb : 0);
      var s = document.getElementById('save-' + k);
      if (s) s.textContent = signed(total);
    });
    SKILLS.forEach(function (sk) {
      var total = abilMod(sk.ability) + (active.skillProf[sk.key] ? pb : 0);
      var s = document.getElementById('skill-' + sk.key);
      if (s) s.textContent = signed(total);
    });

    el.initTotal.textContent = signed(abilMod('dex') + (active.initBonus || 0));
    el.passive.textContent = 10 + abilMod('wis') + (active.skillProf['perception'] ? pb : 0);
  }

  // Full render when switching characters.
  function renderSheet() {
    renderAbilities();
    renderSaves();
    renderSkills();
    renderAttacks();
    fillFields();
    updateDerived();
  }

  /* ---- Character management ---- */
  function switchTo(id) {
    var found = null;
    for (var i = 0; i < chars.length; i++) if (chars[i].id === id) found = chars[i];
    active = found || chars[0];
    setActiveId(active.id);
    renderSelector();
    renderSheet();
  }

  function addCharacter(c) {
    chars.push(c);
    active = c;
    setActiveId(c.id);
    persist();
    renderSelector();
    renderSheet();
  }

  function deleteActive() {
    if (!window.confirm('Delete "' + (active.name || 'this character') + '"?')) return;
    chars = chars.filter(function (c) { return c.id !== active.id; });
    if (!chars.length) chars.push(newCharacter());
    active = chars[0];
    setActiveId(active.id);
    persist();
    renderSelector();
    renderSheet();
  }

  /* ---- Input handling ---- */
  function onInput(e) {
    var t = e.target;
    if (t.hasAttribute('data-field')) {
      var path = t.getAttribute('data-field');
      var val = t.type === 'number'
        ? (t.value === '' ? 0 : (parseInt(t.value, 10) || 0))
        : t.value;
      setByPath(active, path, val);
      if (path === 'name' || path === 'cls' || path === 'level') renderSelector();
    } else if (t.hasAttribute('data-saveprof')) {
      active.saveProf[t.getAttribute('data-saveprof')] = t.checked;
    } else if (t.hasAttribute('data-skillprof')) {
      active.skillProf[t.getAttribute('data-skillprof')] = t.checked;
    } else if (t.hasAttribute('data-attack-field')) {
      var row = t.closest('[data-attack-index]');
      var i = parseInt(row.getAttribute('data-attack-index'), 10);
      active.attacks[i][t.getAttribute('data-attack-field')] = t.value;
    } else {
      return;
    }
    persist();
    updateDerived();
  }

  function onClick(e) {
    if (e.target.closest('.btn-add-attack')) {
      e.preventDefault();
      active.attacks.push({ name: '', bonus: '', damage: '' });
      persist();
      renderAttacks();
    } else if (e.target.classList.contains('btn-del-attack')) {
      e.preventDefault();
      var i = parseInt(e.target.closest('[data-attack-index]').getAttribute('data-attack-index'), 10);
      active.attacks.splice(i, 1);
      persist();
      renderAttacks();
    }
  }

  /* ---- Init ---- */
  function init() {
    el.select = document.querySelector('#char-select');
    el.sheet = document.querySelector('#sheet');
    el.abilities = document.querySelector('#abilities');
    el.saves = document.querySelector('#saves');
    el.skills = document.querySelector('#skills');
    el.attacks = document.querySelector('#attacks');
    el.profBonus = document.querySelector('#prof-bonus');
    el.initTotal = document.querySelector('#init-total');
    el.passive = document.querySelector('#passive');
    el.status = document.querySelector('#save-status');

    chars = loadAll();
    if (!chars.length) chars = [newCharacter()];

    var startId = getActiveId();
    active = null;
    for (var i = 0; i < chars.length; i++) if (chars[i].id === startId) active = chars[i];
    if (!active) active = chars[0];

    setActiveId(active.id);
    persist();           // ensure the default character is stored
    renderSelector();
    renderSheet();

    el.select.addEventListener('change', function () { switchTo(el.select.value); });
    document.querySelector('.btn-new-char').addEventListener('click', function () {
      addCharacter(newCharacter());
    });
    document.querySelector('.btn-dup-char').addEventListener('click', function () {
      var copy = JSON.parse(JSON.stringify(active));
      copy.id = uid();
      copy.name = (active.name || 'Character') + ' (copy)';
      addCharacter(copy);
    });
    document.querySelector('.btn-del-char').addEventListener('click', deleteActive);

    el.sheet.addEventListener('input', onInput);
    el.sheet.addEventListener('change', onInput);
    el.sheet.addEventListener('click', onClick);
    el.sheet.addEventListener('submit', function (e) { e.preventDefault(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
