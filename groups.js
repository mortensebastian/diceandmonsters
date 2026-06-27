/* ============================================================
   Dice & Monsters — Groups (DM party view)
   ------------------------------------------------------------
   A read-only summary of the player party for the DM: the numbers
   needed to run combat and checks (AC, initiative bonus, passive
   perception, speed) — NOT the players' HP, which is their own to
   track. Reads the same local character sheets ("My characters");
   later this will pull from a shared cloud group.
   ============================================================ */
(function () {
  'use strict';

  function mod(score) { return Math.floor(((score || 10) - 10) / 2); }
  function signed(n) { return (n >= 0 ? '+' : '') + n; }
  function profBonus(level) { return 2 + Math.floor(((level || 1) - 1) / 4); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function loadCharacters() {
    try { return JSON.parse(window.localStorage.getItem('diceAndMonsters.characters')) || []; }
    catch (e) { return []; }
  }

  function dexInitMod(s) {
    return mod(s.abilities ? s.abilities.dex : 10) + (s.initBonus || 0);
  }
  function passivePerception(s) {
    var pb = profBonus(s.level);
    var perceptive = s.skillProf && s.skillProf.perception;
    return 10 + mod(s.abilities ? s.abilities.wis : 10) + (perceptive ? pb : 0);
  }

  function render() {
    var party = loadCharacters().filter(function (c) { return (c.category || 'pc') === 'pc'; });
    var body = document.querySelector('#party-body');

    if (!party.length) {
      body.innerHTML = '<p class="party-empty">No player characters yet. ' +
        'Create some on the Character Sheet page (they show up here automatically).</p>';
      return;
    }

    var rows = party.map(function (c) {
      var cls = (c.cls || '—') + (c.level ? ' ' + c.level : '');
      return '<tr>' +
        '<td class="pname">' + esc(c.name || 'Unnamed') + '</td>' +
        '<td>' + esc(cls) + '</td>' +
        '<td class="num">' + (c.ac != null && c.ac !== '' ? c.ac : '—') + '</td>' +
        '<td class="num num--init">' + signed(dexInitMod(c)) + '</td>' +
        '<td class="num">' + passivePerception(c) + '</td>' +
        '<td class="num">' + (c.speed != null && c.speed !== '' ? c.speed : '—') + '</td>' +
      '</tr>';
    }).join('');

    body.innerHTML =
      '<table class="party-table">' +
        '<thead><tr>' +
          '<th>Name</th><th>Class</th><th>AC</th>' +
          '<th>Initiative</th><th>Passive Perc.</th><th>Speed</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';
  }

  document.addEventListener('DOMContentLoaded', render);
})();
