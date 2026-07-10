/* ============================================================
   Dice & Monsters — Character Builder wizard
   ------------------------------------------------------------
   A step-by-step modal that guides you through creating a new
   character or NPC. It is pure UI: it collects choices and hands
   a plain data object back to character.js via onComplete, which
   owns the character model and the race/class/background rules.

   Motivation and Flaw offer a dropdown of ideas plus a 🎲 to roll
   a random one. On an NPC (or any build) the "Roll everything
   random" button fills every field at once and jumps to review.
   ============================================================ */
(function () {
  'use strict';

  /* ---- Flavour tables (rolled or picked from a dropdown) ---- */
  var MOTIVATIONS = [
    'Wealth and treasure', 'Power and influence', 'Knowledge and forbidden lore',
    'Revenge against an old enemy', 'Protecting their family', 'Glory and fame',
    'Redemption for past sins', 'Loyalty to a mentor or order', 'Freedom from oppression',
    'Survival at any cost', 'A divine calling', 'Curiosity and wanderlust',
    'Love for another person', 'Restoring their lost honour', 'Proving themselves to doubters',
    'Duty to a homeland', 'Uncovering a hidden truth', 'Escaping a haunting past',
    'Serving a dark master', 'Finding a cure or a lost friend', 'Building a lasting legacy',
    'The thrill of danger', 'Justice for the wronged', 'Ambition to rule'
  ];

  var FLAWS = [
    "Greedy — can't resist treasure", 'Quick to anger, slow to forgive',
    'Overconfident to the point of recklessness', 'Cowardly when the odds turn',
    "Can't keep a secret", 'Prejudiced against a certain people',
    'Prone to drink or gambling', 'Trusts far too easily', 'Haunted by nightmares',
    'Arrogant and dismissive of others', 'Obsessed with an unattainable goal',
    'Lies compulsively, even needlessly', 'Vengeful — holds grudges forever',
    "Reckless with others' safety", 'Terrified of one specific thing',
    'Loyal to a fault, even to villains', 'Judges everyone by their wealth',
    "Can't back down from a challenge", 'Secretly serves another master',
    'Haunted by a crime they committed', 'Distrustful of all authority',
    'Prideful and easily insulted', 'Impulsive — acts before thinking',
    "Soft-hearted; can't leave anyone behind"
  ];

  // Simple fantasy name generator: given name + optional surname/epithet.
  var GIVEN = [
    'Alaric', 'Bram', 'Cedric', 'Dara', 'Elenwe', 'Fendrel', 'Grond', 'Halda',
    'Ionna', 'Joric', 'Kaelin', 'Lira', 'Morwen', 'Nyx', 'Orin', 'Petra',
    'Quill', 'Roderic', 'Sable', 'Tamsin', 'Ulric', 'Vesna', 'Wrenna', 'Xander',
    'Yorick', 'Zephyra', 'Bael', 'Corvin', 'Dwynn', 'Esmae', 'Garrick', 'Hespa',
    'Isolde', 'Jareth', 'Kesh', 'Lorcan', 'Maeve', 'Nestor', 'Ophira', 'Renn'
  ];
  var SURNAME = [
    'Blackwood', 'Stormrider', 'the Bold', 'Ironhand', 'Nightbreeze', 'Thornwhistle',
    'the Grey', 'Emberfall', 'Duskwalker', 'Brightwater', 'the Unbroken', 'Ravenholt',
    'of Highmoor', 'the Wanderer', 'Stonefist', 'Silvertongue', 'the Cursed', 'Windrunner',
    'Hollowbrook', 'the Sly', 'Frostbeard', 'Marrowick', 'of the Ashen Vale', 'Greymantle'
  ];

  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function randomName() {
    return rand(GIVEN) + (Math.random() < 0.7 ? ' ' + rand(SURNAME) : '');
  }

  function d6() { return Math.floor(Math.random() * 6) + 1; }
  function roll4d6DropLowest() {
    var r = [d6(), d6(), d6(), d6()].sort(function (a, b) { return a - b; });
    return r[1] + r[2] + r[3];
  }
  var STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
  var ABIL = [
    { key: 'str', label: 'STR' }, { key: 'dex', label: 'DEX' }, { key: 'con', label: 'CON' },
    { key: 'int', label: 'INT' }, { key: 'wis', label: 'WIS' }, { key: 'cha', label: 'CHA' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function options(list, selected, blankLabel) {
    var html = blankLabel != null ? '<option value="">' + esc(blankLabel) + '</option>' : '';
    return html + list.map(function (k) {
      return '<option value="' + esc(k) + '"' + (k === selected ? ' selected' : '') + '>' +
        esc(k) + '</option>';
    }).join('');
  }

  /* ---- Wizard state ---- */
  var STEPS = ['Basics', 'Abilities', 'Personality', 'Review'];
  var srd = null;
  var onComplete = null;
  var state = null;
  var step = 0;
  var overlay = null;

  function blankState(category) {
    return {
      category: category === 'npc' ? 'npc' : 'pc',
      name: '',
      race: '', cls: '', level: 1, background: '', alignment: '',
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      motivation: '', flaw: '',
      rollHp: false
    };
  }

  /* ---- Public entry point ---- */
  function open(opts) {
    opts = opts || {};
    srd = opts.srd || window.SRD || { classes: {}, races: {}, backgrounds: {}, alignments: [] };
    onComplete = typeof opts.onComplete === 'function' ? opts.onComplete : function () {};
    state = blankState(opts.category);
    step = 0;
    build();
    render();
    document.addEventListener('keydown', onKey);
  }

  function close() {
    document.removeEventListener('keydown', onKey);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Enter' && e.target && e.target.tagName !== 'TEXTAREA') {
      // Enter advances (or creates on the last step), not inside the raw form submit.
      if (step < STEPS.length - 1) { e.preventDefault(); goNext(); }
    }
  }

  /* ---- DOM scaffold (built once per open) ---- */
  function build() {
    overlay = document.createElement('div');
    overlay.className = 'cb-overlay';
    overlay.innerHTML =
      '<div class="cb-modal" role="dialog" aria-modal="true" aria-label="Character builder">' +
        '<div class="cb-head">' +
          '<h2 class="cb-title">Build a character</h2>' +
          '<button type="button" class="cb-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="cb-progress"></div>' +
        '<div class="cb-body"></div>' +
        '<div class="cb-foot">' +
          '<button type="button" class="cb-btn-random" title="Fill everything with random choices">🎲 Roll everything random</button>' +
          '<span class="cb-foot-spacer"></span>' +
          '<button type="button" class="cb-btn-back">Back</button>' +
          '<button type="button" class="cb-btn-next">Next ▶</button>' +
          '<button type="button" class="cb-btn-create">✓ Create</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { close(); return; }
      if (e.target.closest('.cb-close')) { close(); return; }
      if (e.target.closest('.cb-btn-back')) { goBack(); return; }
      if (e.target.closest('.cb-btn-next')) { goNext(); return; }
      if (e.target.closest('.cb-btn-create')) { finish(); return; }
      if (e.target.closest('.cb-btn-random')) { rollAll(); return; }
      var dice = e.target.closest('[data-roll]');
      if (dice) { onDice(dice.getAttribute('data-roll')); return; }
      var arr = e.target.closest('[data-array]');
      if (arr) { assignArray(); return; }
      var chip = e.target.closest('[data-step]');
      if (chip) { step = +chip.getAttribute('data-step'); render(); return; }
    });
    overlay.addEventListener('input', onFieldChange);
    overlay.addEventListener('change', onFieldChange);
  }

  function onFieldChange(e) {
    var t = e.target;
    if (t.hasAttribute('data-cb')) {
      var f = t.getAttribute('data-cb');
      state[f] = (f === 'level') ? Math.max(1, Math.min(20, parseInt(t.value, 10) || 1)) : t.value;
      if (f === 'category') updateNote();
      if (f === 'race') updateNote();
    } else if (t.hasAttribute('data-abil')) {
      state.abilities[t.getAttribute('data-abil')] = parseInt(t.value, 10) || 0;
    } else if (t.hasAttribute('data-pick')) {
      // Dropdown "quick pick" fills the matching free-text field.
      var key = t.getAttribute('data-pick');
      if (t.value) {
        state[key] = t.value;
        var box = overlay.querySelector('input[data-cb="' + key + '"]');
        if (box) box.value = t.value;
      }
    }
  }

  /* ---- Randomisers ---- */
  function onDice(what) {
    if (what === 'name') { state.name = randomName(); }
    else if (what === 'race') { state.race = rand(Object.keys(srd.races)); }
    else if (what === 'cls') { state.cls = rand(Object.keys(srd.classes)); }
    else if (what === 'background') { state.background = rand(Object.keys(srd.backgrounds)); }
    else if (what === 'alignment') { state.alignment = rand(srd.alignments); }
    else if (what === 'motivation') { state.motivation = rand(MOTIVATIONS); }
    else if (what === 'flaw') { state.flaw = rand(FLAWS); }
    else if (what === 'abilities') { rollAbilities(); }
    render();
  }

  function rollAbilities() {
    ABIL.forEach(function (a) { state.abilities[a.key] = roll4d6DropLowest(); });
  }
  function assignArray() {
    ABIL.forEach(function (a, i) { state.abilities[a.key] = STANDARD_ARRAY[i]; });
    render();
  }

  // Fill every field with a random choice and jump straight to review.
  function rollAll() {
    state.name = randomName();
    state.race = rand(Object.keys(srd.races));
    state.cls = rand(Object.keys(srd.classes));
    state.level = randInt(1, 8);
    state.background = rand(Object.keys(srd.backgrounds));
    state.alignment = rand(srd.alignments);
    state.motivation = rand(MOTIVATIONS);
    state.flaw = rand(FLAWS);
    rollAbilities();
    state.rollHp = true;
    step = STEPS.length - 1;
    render();
  }

  /* ---- Step navigation ---- */
  function goNext() { if (step < STEPS.length - 1) { step++; render(); } }
  function goBack() { if (step > 0) { step--; render(); } }

  function finish() {
    onComplete({
      category: state.category,
      name: (state.name || '').trim(),
      race: state.race, cls: state.cls, level: state.level,
      background: state.background, alignment: state.alignment,
      abilities: {
        str: state.abilities.str, dex: state.abilities.dex, con: state.abilities.con,
        int: state.abilities.int, wis: state.abilities.wis, cha: state.abilities.cha
      },
      motivation: (state.motivation || '').trim(),
      flaw: (state.flaw || '').trim(),
      rollHp: !!state.rollHp
    });
    close();
  }

  /* ---- Rendering ---- */
  function render() {
    if (!overlay) return;
    // progress chips
    overlay.querySelector('.cb-progress').innerHTML = STEPS.map(function (name, i) {
      return '<button type="button" class="cb-chip' + (i === step ? ' cb-chip--on' : '') +
        (i < step ? ' cb-chip--done' : '') + '" data-step="' + i + '">' +
        '<span class="cb-chip__num">' + (i + 1) + '</span>' + esc(name) + '</button>';
    }).join('');

    var body = overlay.querySelector('.cb-body');
    if (step === 0) body.innerHTML = renderBasics();
    else if (step === 1) body.innerHTML = renderAbilities();
    else if (step === 2) body.innerHTML = renderPersonality();
    else body.innerHTML = renderReview();

    overlay.querySelector('.cb-btn-back').style.display = step === 0 ? 'none' : '';
    overlay.querySelector('.cb-btn-next').style.display = step === STEPS.length - 1 ? 'none' : '';
    overlay.querySelector('.cb-btn-create').style.display = step === STEPS.length - 1 ? '' : 'none';

    // focus the first sensible control
    var first = body.querySelector('input, select');
    if (first) try { first.focus(); } catch (e) { /* ignore */ }
  }

  function raceNote() {
    var r = srd.races[state.race];
    if (!r) return '';
    var asi = Object.keys(r.abilities || {}).map(function (k) {
      return k.toUpperCase() + ' +' + r.abilities[k];
    }).join(', ');
    return (asi || 'ability choices') + (r.note ? ' · ' + r.note : '');
  }

  function updateNote() {
    var n = overlay.querySelector('.cb-racenote');
    if (n) n.innerHTML = state.race ? ('Racial bonus: <b>' + esc(raceNote()) + '</b>') : '';
  }

  function pickerRow(label, key, roll) {
    return '<div class="cb-field">' +
      '<label>' + esc(label) + '</label>' +
      '<div class="cb-inline">' +
        '<input type="text" class="cb-text" data-cb="' + key + '" value="' + esc(state[key]) + '">' +
        '<button type="button" class="cb-dice" data-roll="' + roll + '" title="Roll random">🎲</button>' +
      '</div>' +
    '</div>';
  }

  function selectRow(label, key, list, roll, blank) {
    return '<div class="cb-field">' +
      '<label>' + esc(label) + '</label>' +
      '<div class="cb-inline">' +
        '<select data-cb="' + key + '">' + options(list, state[key], blank) + '</select>' +
        '<button type="button" class="cb-dice" data-roll="' + roll + '" title="Roll random">🎲</button>' +
      '</div>' +
    '</div>';
  }

  function renderBasics() {
    var cats = '<div class="cb-field"><label>Character type</label>' +
      '<div class="cb-toggle">' +
        '<label class="cb-radio"><input type="radio" name="cb-cat" data-cb="category" value="pc"' +
          (state.category === 'pc' ? ' checked' : '') + '> My character</label>' +
        '<label class="cb-radio"><input type="radio" name="cb-cat" data-cb="category" value="npc"' +
          (state.category === 'npc' ? ' checked' : '') + '> NPC</label>' +
      '</div></div>';

    return '<p class="cb-lead">Start with the essentials. Use 🎲 on any field to roll it — ' +
      'or hit <b>Roll everything random</b> below for an instant character.</p>' +
      '<div class="cb-grid">' +
        cats +
        pickerRow('Name', 'name', 'name') +
        selectRow('Race', 'race', Object.keys(srd.races), 'race', '— choose —') +
        selectRow('Class', 'cls', Object.keys(srd.classes), 'cls', '— choose —') +
        '<div class="cb-field"><label>Level</label>' +
          '<input type="number" min="1" max="20" class="cb-text" data-cb="level" value="' + (state.level || 1) + '"></div>' +
        selectRow('Background', 'background', Object.keys(srd.backgrounds), 'background', '— choose —') +
        selectRow('Alignment', 'alignment', srd.alignments, 'alignment', '— choose —') +
      '</div>' +
      '<p class="cb-racenote">' + (state.race ? 'Racial bonus: <b>' + esc(raceNote()) + '</b>' : '') + '</p>';
  }

  function renderAbilities() {
    var grid = ABIL.map(function (a) {
      return '<div class="cb-abil">' +
        '<div class="cb-abil__lbl">' + a.label + '</div>' +
        '<input type="number" class="cb-abil__in" data-abil="' + a.key + '" value="' + state.abilities[a.key] + '">' +
      '</div>';
    }).join('');
    return '<p class="cb-lead">Set the six ability scores. Roll them, drop in the standard array, ' +
      'or type your own. Racial bonuses are added when you finish.</p>' +
      '<div class="cb-abil-btns">' +
        '<button type="button" class="cb-btn-alt" data-roll="abilities">🎲 Roll 4d6 (drop lowest)</button>' +
        '<button type="button" class="cb-btn-alt" data-array="standard">Standard array (15,14,13,12,10,8)</button>' +
      '</div>' +
      '<div class="cb-abil-grid">' + grid + '</div>' +
      (state.race ? '<p class="cb-racenote">Racial bonus: <b>' + esc(raceNote()) + '</b></p>' : '');
  }

  function personalityBlock(label, hint, key, list) {
    return '<div class="cb-field cb-field--wide">' +
      '<label>' + esc(label) + '</label>' +
      '<div class="cb-inline">' +
        '<select class="cb-pick" data-pick="' + key + '">' + options(list, '', '— choose from the list —') + '</select>' +
        '<button type="button" class="cb-dice" data-roll="' + key + '" title="Roll random">🎲</button>' +
      '</div>' +
      '<input type="text" class="cb-text" data-cb="' + key + '" value="' + esc(state[key]) + '" placeholder="' + esc(hint) + '">' +
    '</div>';
  }

  function renderPersonality() {
    return '<p class="cb-lead">What makes them tick? Pick from the dropdown, roll a random idea, ' +
      'or write your own.</p>' +
      '<div class="cb-grid cb-grid--one">' +
        personalityBlock('Motivation — what drives them?', 'Their driving goal…', 'motivation', MOTIVATIONS) +
        personalityBlock('Flaw — what holds them back?', 'A weakness or vice…', 'flaw', FLAWS) +
      '</div>';
  }

  function renderReview() {
    var r = srd.races[state.race];
    var finalAbil = ABIL.map(function (a) {
      var base = state.abilities[a.key];
      var bonus = (r && r.abilities && r.abilities[a.key]) || 0;
      var total = base + bonus;
      return '<div class="cb-rev-abil"><span class="cb-rev-abil__lbl">' + a.label + '</span>' +
        '<span class="cb-rev-abil__num">' + total + '</span>' +
        (bonus ? '<span class="cb-rev-abil__bonus">(' + base + '+' + bonus + ')</span>' : '') + '</div>';
    }).join('');

    function line(label, val) {
      return '<div class="cb-rev-row"><span class="cb-rev-row__lbl">' + esc(label) + '</span>' +
        '<span class="cb-rev-row__val">' + (val ? esc(val) : '<em>—</em>') + '</span></div>';
    }
    return '<p class="cb-lead">Looks good? Review and create — you can still edit everything on the sheet.</p>' +
      '<div class="cb-review">' +
        line('Name', state.name || 'New character') +
        line('Type', state.category === 'npc' ? 'NPC' : 'My character') +
        line('Race', state.race) +
        line('Class', (state.cls ? state.cls + ' ' + (state.level || 1) : '')) +
        line('Background', state.background) +
        line('Alignment', state.alignment) +
        line('Motivation', state.motivation) +
        line('Flaw', state.flaw) +
        '<div class="cb-rev-row cb-rev-row--abil"><span class="cb-rev-row__lbl">Abilities</span>' +
          '<div class="cb-rev-abils">' + finalAbil + '</div></div>' +
      '</div>';
  }

  window.CharBuilder = { open: open, close: close, MOTIVATIONS: MOTIVATIONS, FLAWS: FLAWS };
})();
