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

  var SRD = window.SRD || { classes: {}, races: {}, backgrounds: {}, alignments: [] };

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
  var SKILL_LABEL = {};
  SKILLS.forEach(function (s) { SKILL_LABEL[s.key] = s.label; });

  /* ---- State + storage ---- */
  var STORAGE = 'diceAndMonsters.characters';
  var ACTIVE = 'diceAndMonsters.activeCharacter';

  var chars = [];
  var active = null;
  var category = 'pc';   // active tab: 'pc' (My characters) or 'npc'
  var el = {};
  var statusTimer = null;

  var CATEGORIES = { pc: 'My characters', npc: 'NPCs' };

  function newCharacter(cat) {
    return {
      id: uid(),
      category: cat || 'pc',
      name: 'New character',
      subclass: '', xp: 0,
      resistances: '', immunities: '',
      cls: '', level: 1, race: '', background: '', alignment: '',
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      saveProf: {}, skillProf: {},
      ac: 10, armor: '', shield: false, initBonus: 0, speed: 30,
      hp: { max: 0, current: 0, temp: 0 }, hitDice: '',
      attacks: [],
      spellAbility: '', spells: [], spellSlots: {},
      deathSaves: { success: [false, false, false], failure: [false, false, false] },
      inspiration: false,
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      languages: '', otherProf: '',
      features: '', equipment: '',
      // Bookkeeping of what race/class/background currently apply, so
      // a later change can be undone cleanly (no double-counting).
      raceASI: {}, classSaves: [], bgSkills: []
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

  function armorByName(name) {
    for (var i = 0; i < SRD.armor.length; i++) if (SRD.armor[i].name === name) return SRD.armor[i];
    return null;
  }
  function weaponByName(name) {
    for (var i = 0; i < SRD.weapons.length; i++) if (SRD.weapons[i].name === name) return SRD.weapons[i];
    return null;
  }

  // AC from armor + Dex + shield (5e rules). Unarmored = 10 + Dex.
  function computeAC() {
    var dex = abilMod('dex');
    var shield = active.shield ? 2 : 0;
    var a = armorByName(active.armor);
    if (!a) return 10 + dex + shield;
    if (a.type === 'light') return a.base + dex + shield;
    if (a.type === 'medium') return a.base + Math.min(dex, 2) + shield;
    return a.base + shield; // heavy
  }

  function d6() { return Math.floor(Math.random() * 6) + 1; }
  function roll4d6DropLowest() {
    var r = [d6(), d6(), d6(), d6()].sort(function (a, b) { return a - b; });
    return r[1] + r[2] + r[3];
  }

  /* ---- Rendering ---- */
  function charsInCategory(cat) {
    return chars.filter(function (c) { return (c.category || 'pc') === cat; });
  }

  function renderTabs() {
    Array.prototype.forEach.call(el.tabs.querySelectorAll('.tab'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-cat') === category);
    });
  }

  function renderSelector() {
    el.select.innerHTML = charsInCategory(category).map(function (c) {
      var label = (c.name || 'Unnamed') +
        (c.cls || c.level ? '  (' + (c.cls || 'class') + ' ' + (c.level || 1) + ')' : '');
      return '<option value="' + c.id + '"' + (c.id === active.id ? ' selected' : '') + '>' +
        esc(label) + '</option>';
    }).join('');
    renderCharGallery();
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
      if (n.type === 'checkbox') n.checked = !!v;
      else n.value = (v == null ? '' : v);
    });
    Array.prototype.forEach.call(
      el.sheet.querySelectorAll('[data-saveprof]'), function (n) {
        n.checked = !!active.saveProf[n.getAttribute('data-saveprof')];
      });
    Array.prototype.forEach.call(
      el.sheet.querySelectorAll('[data-skillprof]'), function (n) {
        n.checked = !!active.skillProf[n.getAttribute('data-skillprof')];
      });
    Array.prototype.forEach.call(
      el.sheet.querySelectorAll('[data-death]'), function (n) {
        var type = n.getAttribute('data-death'), idx = +n.getAttribute('data-didx');
        n.checked = !!(active.deathSaves && active.deathSaves[type] && active.deathSaves[type][idx]);
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

    // Spellcasting (DC = 8 + prof + ability mod; attack = prof + mod).
    if (el.spellDc) {
      if (active.spellAbility) {
        var sm = abilMod(active.spellAbility);
        el.spellDc.textContent = 8 + pb + sm;
        el.spellAtk.textContent = signed(pb + sm);
      } else {
        el.spellDc.textContent = '—';
        el.spellAtk.textContent = '—';
      }
    }

    // AC: computed from armor unless set to manual.
    var acInput = el.sheet.querySelector('input[data-field="ac"]');
    if (acInput) {
      if (active.armor === 'manual') {
        acInput.readOnly = false;
      } else {
        active.ac = computeAC();
        acInput.value = active.ac;
        acInput.readOnly = true;
      }
    }
  }

  /* ---- Applying SRD choices (race / class / background) ---- */

  // Race: remove the previously applied ASI, then add the new race's,
  // and set walking speed. Ability scores stay "final" everywhere else.
  function applyRace(race) {
    var old = active.raceASI || {};
    Object.keys(old).forEach(function (k) {
      active.abilities[k] = (active.abilities[k] || 10) - old[k];
    });
    var r = SRD.races[race];
    var asi = (r && r.abilities) || {};
    var applied = {};
    Object.keys(asi).forEach(function (k) {
      active.abilities[k] = (active.abilities[k] || 10) + asi[k];
      applied[k] = asi[k];
    });
    active.raceASI = applied;
    if (r && r.speed) active.speed = r.speed;
  }

  // Class: swap out old class saves for the new ones, set hit dice.
  function applyClass(cls) {
    (active.classSaves || []).forEach(function (k) { active.saveProf[k] = false; });
    var c = SRD.classes[cls];
    var saves = (c && c.saves) || [];
    saves.forEach(function (k) { active.saveProf[k] = true; });
    active.classSaves = saves.slice();
    if (c && c.hitDie) active.hitDice = (active.level || 1) + 'd' + c.hitDie;
  }

  // Background: swap out old granted skills for the new ones.
  function applyBackground(bg) {
    (active.bgSkills || []).forEach(function (k) { active.skillProf[k] = false; });
    var b = SRD.backgrounds[bg];
    var sk = (b && b.skills) || [];
    sk.forEach(function (k) { active.skillProf[k] = true; });
    active.bgSkills = sk.slice();
  }

  // Roll 4d6-drop-lowest into all six abilities (then re-add race ASI).
  function rollAbilities() {
    if (!window.confirm('Roll new ability scores? This replaces the current ones.')) return;
    ABILITIES.forEach(function (a) {
      active.abilities[a.key] = roll4d6DropLowest() + ((active.raceASI || {})[a.key] || 0);
    });
    persist();
    fillFields();
    updateDerived();
  }

  // Roll max HP by the rules: max die at level 1 + Con mod, then a
  // rolled die + Con mod each further level (minimum 1 per level).
  function rollMaxHp() {
    var cd = SRD.classes[active.cls];
    if (!cd) { window.alert('Pick a class first.'); return; }
    if (!window.confirm('Roll a new max HP from your class, level and Con? This replaces the current max.')) return;
    var die = cd.hitDie, con = abilMod('con'), lvl = active.level || 1;
    var total = die + con;
    for (var i = 2; i <= lvl; i++) {
      total += Math.max(1, (Math.floor(Math.random() * die) + 1) + con);
    }
    total = Math.max(1, total);
    active.hp.max = total;
    active.hp.current = total;
    persist();
    fillFields();
    updateDerived();
  }

  function findSpell(name) {
    var all = window.SRD_SPELLS || [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].n.toLowerCase() === String(name).toLowerCase()) return all[i];
    }
    return null;
  }

  // Spell picker filtered to the character's class (if it casts).
  function renderSpellPicker() {
    if (!el.spellPick) return;
    var cls = (active.cls || '').toLowerCase();
    var all = window.SRD_SPELLS || [];
    var isCaster = !!cls && all.some(function (s) { return s.c.indexOf(cls) !== -1; });
    var list = isCaster ? all.filter(function (s) { return s.c.indexOf(cls) !== -1; }) : all;
    var byLevel = {};
    list.forEach(function (s) { (byLevel[s.l] = byLevel[s.l] || []).push(s); });
    var html = '<option value="">— blank / custom —</option>';
    Object.keys(byLevel).sort(function (a, b) { return a - b; }).forEach(function (L) {
      var label = (+L === 0) ? 'Cantrips' : ('Level ' + L);
      var opts = byLevel[L].sort(function (a, b) { return a.n.localeCompare(b.n); })
        .map(function (s) { return '<option value="' + esc(s.n) + '">' + esc(s.n) + '</option>'; }).join('');
      html += '<optgroup label="' + label + '">' + opts + '</optgroup>';
    });
    el.spellPick.innerHTML = html;
  }

  function addSpellFromPicker() {
    var name = el.spellPick ? el.spellPick.value : '';
    if (!name) {
      active.spells.push({ level: '', name: '', notes: '' });
    } else {
      var sp = findSpell(name);
      active.spells.push({ level: sp ? String(sp.l) : '', name: name, notes: '' });
    }
    persist();
    renderSpells();
  }

  // Build an attack from a weapon (to-hit = ability mod + proficiency,
  // damage = dice + ability mod). Finesse/ranged use Dex.
  function addWeapon(name, proficient, twoHanded) {
    var w = weaponByName(name);
    if (!w) return;
    var finesse = w.props.indexOf('finesse') !== -1;
    var ranged = w.props.indexOf('ranged') !== -1;
    var useDex = ranged || (finesse && abilMod('dex') >= abilMod('str'));
    var m = abilMod(useDex ? 'dex' : 'str');
    var bonus = m + (proficient ? profBonus() : 0);
    var dice = (twoHanded && w.versatileDice) ? w.versatileDice : w.dice;
    var dmg = dice + (m > 0 ? '+' + m : (m < 0 ? '' + m : '')) + ' ' + w.type;
    var label = w.name + (twoHanded && w.versatileDice ? ' (two-handed)' : '');
    active.attacks.push({ name: label, bonus: signed(bonus), damage: dmg });
    persist();
    renderAttacks();
  }

  function fillSelect(sel, keys, blank) {
    var html = blank ? '<option value="">—</option>' : '';
    html += keys.map(function (k) {
      return '<option value="' + esc(k) + '">' + esc(k) + '</option>';
    }).join('');
    sel.innerHTML = html;
  }

  function populateIdentitySelects() {
    fillSelect(el.sheet.querySelector('select[data-field="cls"]'), Object.keys(SRD.classes), true);
    fillSelect(el.sheet.querySelector('select[data-field="race"]'), Object.keys(SRD.races), true);
    fillSelect(el.sheet.querySelector('select[data-field="background"]'), Object.keys(SRD.backgrounds), true);
    fillSelect(el.sheet.querySelector('select[data-field="alignment"]'), SRD.alignments, true);

    // Armor dropdown: Unarmored / each armor / Manual.
    var armorSel = el.sheet.querySelector('select[data-field="armor"]');
    armorSel.innerHTML = '<option value="">Unarmored</option>' +
      SRD.armor.map(function (a) {
        return '<option value="' + esc(a.name) + '">' + esc(a.name) +
          ' (' + a.base + ', ' + a.type + ')</option>';
      }).join('') +
      '<option value="manual">Manual</option>';

    // Weapon dropdown for the attacks section.
    var wsel = document.querySelector('#weapon-select');
    if (wsel) {
      wsel.innerHTML = SRD.weapons.map(function (w) {
        return '<option value="' + esc(w.name) + '">' + esc(w.name) +
          ' (' + w.dice + ' ' + w.type + ')</option>';
      }).join('');
    }
  }

  // Summary of what the chosen race/class/background grant.
  function updateNotes() {
    var parts = [];
    var r = SRD.races[active.race];
    if (r) {
      var asi = Object.keys(r.abilities || {}).map(function (k) {
        return k.toUpperCase() + ' +' + r.abilities[k];
      }).join(', ');
      parts.push('<b>' + esc(active.race) + '</b>: ' + (asi || 'choose ASI') +
        ', speed ' + r.speed + (r.note ? '. ' + esc(r.note) : ''));
    }
    var c = SRD.classes[active.cls];
    if (c) {
      parts.push('<b>' + esc(active.cls) + '</b>: saves ' +
        c.saves.map(function (s) { return s.toUpperCase(); }).join(' & ') +
        ', Hit Die d' + c.hitDie);
    }
    var b = SRD.backgrounds[active.background];
    if (b) {
      parts.push('<b>' + esc(active.background) + '</b>: ' +
        b.skills.map(function (k) { return SKILL_LABEL[k]; }).join(', '));
    }
    el.notes.innerHTML = parts.join(' &middot; ');
  }

  function renderSpells() {
    el.spells.innerHTML = active.spells.length
      ? active.spells.map(function (sp, i) {
          return '<div class="spell-row" data-spell-index="' + i + '">' +
            '<input type="number" class="spell-lvl" min="0" max="9" ' +
              'data-spell-field="level" value="' + esc(sp.level) + '" title="Level (0 = cantrip)">' +
            '<input type="text" placeholder="Spell name" data-spell-field="name" value="' + esc(sp.name) + '">' +
            '<input type="text" placeholder="Notes (range, save, damage…)" data-spell-field="notes" value="' + esc(sp.notes) + '">' +
            '<button type="button" class="btn-del-spell" title="Remove">&times;</button>' +
          '</div>';
        }).join('')
      : '<p class="muted">No spells yet.</p>';
  }

  function renderSpellSlots() {
    if (!el.spellSlots) return;
    var slots = active.spellSlots || {};
    var cells = '';
    for (var L = 1; L <= 9; L++) {
      var sl = slots[L] || {};
      cells += '<div class="slot">' +
        '<span class="slot__lvl">L' + L + '</span>' +
        '<input type="number" min="0" class="slot__in" data-slot-level="' + L + '" ' +
          'data-slot-field="total" value="' + (sl.total != null ? sl.total : '') + '" title="Total slots">' +
        '<span class="slot__sep">/</span>' +
        '<input type="number" min="0" class="slot__in" data-slot-level="' + L + '" ' +
          'data-slot-field="used" value="' + (sl.used != null ? sl.used : '') + '" title="Used">' +
      '</div>';
    }
    el.spellSlots.innerHTML = cells;
  }

  // Card gallery of the characters in the active category.
  function renderCharGallery() {
    if (!el.gallery) return;
    var list = charsInCategory(category);
    el.gallery.innerHTML = list.length ? list.map(function (c) {
      var sub = (c.cls || '—') + (c.level ? ' ' + c.level : '') +
        (c.race ? ' · ' + c.race : '');
      return '<button class="adv-card' + (c.id === active.id ? ' adv-card--active' : '') +
        '" data-load="' + c.id + '">' +
        '<span class="adv-card__title">' + esc(c.name || 'Unnamed') + '</span>' +
        '<span class="adv-card__levels">' + esc(sub) + '</span>' +
      '</button>';
    }).join('') : '<p class="muted">No characters in this category yet.</p>';
  }

  // Full render when switching characters.
  function renderSheet() {
    renderAbilities();
    renderSaves();
    renderSkills();
    renderAttacks();
    renderSpells();
    renderSpellSlots();
    renderSpellPicker();
    fillFields();
    updateNotes();
    updateDerived();
  }

  /* ---- Character management ---- */

  // Switch to a category tab. Picks the first character there, or
  // creates a blank one if the category is empty.
  function setCategory(cat) {
    category = cat;
    var list = charsInCategory(cat);
    if (list.length) {
      active = list[0];
      setActiveId(active.id);
      renderTabs();
      renderSelector();
      renderSheet();
    } else {
      addCharacter(newCharacter(cat));
    }
  }

  function switchTo(id) {
    var found = null;
    for (var i = 0; i < chars.length; i++) if (chars[i].id === id) found = chars[i];
    active = found || charsInCategory(category)[0] || chars[0];
    category = active.category || 'pc';
    setActiveId(active.id);
    renderTabs();
    renderSelector();
    renderSheet();
  }

  function addCharacter(c) {
    chars.push(c);
    active = c;
    category = c.category || 'pc';
    setActiveId(c.id);
    persist();
    renderTabs();
    renderSelector();
    renderSheet();
  }

  function deleteActive() {
    if (!window.confirm('Delete "' + (active.name || 'this character') + '"?')) return;
    var cat = active.category || 'pc';
    chars = chars.filter(function (c) { return c.id !== active.id; });
    var list = charsInCategory(cat);
    if (list.length) {
      active = list[0];
      category = cat;
      setActiveId(active.id);
      persist();
      renderTabs();
      renderSelector();
      renderSheet();
    } else {
      // No more characters in this category - make a fresh blank one.
      addCharacter(newCharacter(cat));
    }
  }

  /* ---- Input handling ---- */
  function onInput(e) {
    var t = e.target;
    if (t.hasAttribute('data-field')) {
      var path = t.getAttribute('data-field');
      var val = t.type === 'checkbox' ? t.checked
        : t.type === 'number' ? (t.value === '' ? 0 : (parseInt(t.value, 10) || 0))
        : t.value;
      setByPath(active, path, val);
      if (path === 'category') {
        // Reclassified: follow the character to its new tab.
        category = val;
        persist();
        renderTabs();
        renderSelector();
        return;
      }
      if (path === 'race') {
        applyRace(val);
        persist();
        fillFields(); updateNotes(); updateDerived();
        return;
      }
      if (path === 'cls') {
        applyClass(val);
        persist();
        fillFields(); updateNotes(); updateDerived(); renderSelector(); renderSpellPicker();
        return;
      }
      if (path === 'background') {
        applyBackground(val);
        persist();
        fillFields(); updateNotes(); updateDerived();
        return;
      }
      if (path === 'level') {
        var cd = SRD.classes[active.cls];
        if (cd) {
          active.hitDice = (active.level || 1) + 'd' + cd.hitDie;
          var hd = el.sheet.querySelector('[data-field="hitDice"]');
          if (hd) hd.value = active.hitDice;
        }
        persist();
        updateDerived();
        renderSelector();
        return;
      }
      if (path === 'name') renderSelector();
    } else if (t.hasAttribute('data-saveprof')) {
      active.saveProf[t.getAttribute('data-saveprof')] = t.checked;
    } else if (t.hasAttribute('data-skillprof')) {
      active.skillProf[t.getAttribute('data-skillprof')] = t.checked;
    } else if (t.hasAttribute('data-slot-level')) {
      var lvl = t.getAttribute('data-slot-level');
      if (!active.spellSlots[lvl]) active.spellSlots[lvl] = { total: 0, used: 0 };
      active.spellSlots[lvl][t.getAttribute('data-slot-field')] =
        (t.value === '' ? 0 : (parseInt(t.value, 10) || 0));
    } else if (t.hasAttribute('data-attack-field')) {
      var row = t.closest('[data-attack-index]');
      var i = parseInt(row.getAttribute('data-attack-index'), 10);
      active.attacks[i][t.getAttribute('data-attack-field')] = t.value;
    } else if (t.hasAttribute('data-spell-field')) {
      var srow = t.closest('[data-spell-index]');
      var si = parseInt(srow.getAttribute('data-spell-index'), 10);
      active.spells[si][t.getAttribute('data-spell-field')] = t.value;
    } else if (t.hasAttribute('data-death')) {
      active.deathSaves[t.getAttribute('data-death')][+t.getAttribute('data-didx')] = t.checked;
    } else {
      return;
    }
    persist();
    updateDerived();
  }

  function onClick(e) {
    if (e.target.closest('.btn-roll-abilities')) {
      e.preventDefault();
      rollAbilities();
    } else if (e.target.closest('.btn-roll-hp')) {
      e.preventDefault();
      rollMaxHp();
    } else if (e.target.closest('.btn-add-weapon')) {
      e.preventDefault();
      var ws = document.querySelector('#weapon-select');
      var prof = document.querySelector('#weapon-prof');
      var twoH = document.querySelector('#weapon-2h');
      if (ws && ws.value) addWeapon(ws.value, prof ? prof.checked : true, twoH ? twoH.checked : false);
    } else if (e.target.closest('.btn-add-attack')) {
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
    } else if (e.target.closest('.btn-add-spell')) {
      e.preventDefault();
      addSpellFromPicker();
    } else if (e.target.classList.contains('btn-del-spell')) {
      e.preventDefault();
      var sj = parseInt(e.target.closest('[data-spell-index]').getAttribute('data-spell-index'), 10);
      active.spells.splice(sj, 1);
      persist();
      renderSpells();
    }
  }

  /* ---- Init ---- */
  function init() {
    el.tabs = document.querySelector('#cat-tabs');
    el.select = document.querySelector('#char-select');
    el.sheet = document.querySelector('#sheet');
    el.abilities = document.querySelector('#abilities');
    el.saves = document.querySelector('#saves');
    el.skills = document.querySelector('#skills');
    el.attacks = document.querySelector('#attacks');
    el.spells = document.querySelector('#spells');
    el.spellDc = document.querySelector('#spell-dc');
    el.spellAtk = document.querySelector('#spell-atk');
    el.spellSlots = document.querySelector('#spell-slots');
    el.spellPick = document.querySelector('#spell-pick');
    el.gallery = document.querySelector('#char-gallery-cards');
    el.profBonus = document.querySelector('#prof-bonus');
    el.initTotal = document.querySelector('#init-total');
    el.passive = document.querySelector('#passive');
    el.notes = document.querySelector('#identity-notes');
    el.status = document.querySelector('#save-status');

    chars = loadAll();
    chars.forEach(function (c) {
      if (!c.category) c.category = 'pc';          // migrate old saves
      if (!c.raceASI) c.raceASI = {};
      if (!c.classSaves) c.classSaves = [];
      if (!c.bgSkills) c.bgSkills = [];
      // Old sheets had a hand-typed AC: keep it by defaulting to manual.
      if (c.armor === undefined) c.armor = 'manual';
      if (c.shield === undefined) c.shield = false;
      if (c.subclass === undefined) c.subclass = '';
      if (c.xp === undefined) c.xp = 0;
      if (c.resistances === undefined) c.resistances = '';
      if (c.immunities === undefined) c.immunities = '';
      if (c.languages === undefined) c.languages = '';
      if (c.otherProf === undefined) c.otherProf = '';
      if (!c.spellSlots) c.spellSlots = {};
      if (c.spellAbility === undefined) c.spellAbility = '';
      if (!c.spells) c.spells = [];
      if (!c.deathSaves) c.deathSaves = { success: [false, false, false], failure: [false, false, false] };
      if (c.inspiration === undefined) c.inspiration = false;
      if (!c.currency) c.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
    });
    if (!chars.length) chars = [newCharacter('pc')];

    populateIdentitySelects();

    var startId = getActiveId();
    active = null;
    for (var i = 0; i < chars.length; i++) if (chars[i].id === startId) active = chars[i];
    if (!active) active = chars[0];
    category = active.category || 'pc';

    setActiveId(active.id);
    persist();           // ensure the default character is stored
    renderTabs();
    renderSelector();
    renderSheet();

    el.tabs.addEventListener('click', function (e) {
      var b = e.target.closest('.tab');
      if (b) setCategory(b.getAttribute('data-cat'));
    });
    if (el.gallery) {
      el.gallery.addEventListener('click', function (e) {
        var card = e.target.closest('[data-load]');
        if (card) switchTo(card.getAttribute('data-load'));
      });
    }
    el.select.addEventListener('change', function () { switchTo(el.select.value); });
    document.querySelector('.btn-new-char').addEventListener('click', function () {
      addCharacter(newCharacter(category));
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
