/* ============================================================
   Dice & Monsters — Adventure
   ------------------------------------------------------------
   Read a built-in one-shot or write your own. Your adventures are
   stored in localStorage. Each scene can list monsters (by slug)
   and be sent straight to the Encounter Planner.
   ============================================================ */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function uid() { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  var STORAGE = 'diceAndMonsters.adventures';
  var ACTIVE = 'diceAndMonsters.activeAdventure';
  var PENDING = 'diceAndMonsters.pendingEncounter';

  var builtins = (window.ADVENTURES || []).map(function (a) { a.builtin = true; return a; });
  var userAdvs = [];
  var active = null;
  var el = {};
  var statusTimer = null;

  // monster name <-> slug (for the editor's monster picker)
  var NAME2SLUG = {};
  (window.MONSTER_DATA || []).forEach(function (m) { NAME2SLUG[m.name.toLowerCase()] = m.slug; });

  function loadUser() {
    try { return JSON.parse(window.localStorage.getItem(STORAGE)) || []; }
    catch (e) { return []; }
  }
  function persist() {
    try { window.localStorage.setItem(STORAGE, JSON.stringify(userAdvs)); } catch (e) { /* ignore */ }
    status('Saved');
  }
  function status(text) {
    el.status.textContent = text;
    el.status.classList.add('save-status--show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { el.status.classList.remove('save-status--show'); }, 1200);
  }

  function isBuiltin(adv) { return !!(adv && adv.builtin); }
  function allAdvs() { return builtins.concat(userAdvs); }
  function findAdv(id) {
    var all = allAdvs();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function newAdventure() {
    return {
      id: uid(), title: 'New adventure', levels: '1', summary: '',
      scenes: [{ title: 'Scene 1', text: '', monsters: [] }]
    };
  }

  /* ---- Rendering ---- */
  function renderSelector() {
    var bo = builtins.map(function (a) {
      return '<option value="' + a.id + '"' + (a.id === active.id ? ' selected' : '') + '>' +
        esc(a.title) + '</option>';
    }).join('');
    var uo = userAdvs.map(function (a) {
      return '<option value="' + a.id + '"' + (a.id === active.id ? ' selected' : '') + '>' +
        esc(a.title) + '</option>';
    }).join('');
    el.select.innerHTML =
      '<optgroup label="Built-in one-shots">' + bo + '</optgroup>' +
      (uo ? '<optgroup label="Your adventures">' + uo + '</optgroup>' : '');
    el.delBtn.disabled = isBuiltin(active);
  }

  function monChip(m, sceneIdx, monIdx, editable) {
    var label = esc(m.name || m.slug) + ' &times;' + (m.count || 1);
    if (!editable) return '<span class="mon-chip">' + label + '</span>';
    return '<span class="mon-chip mon-chip--edit" data-mon-remove ' +
      'data-scene="' + sceneIdx + '" data-mon="' + monIdx + '" title="Remove">' +
      label + ' ✕</span>';
  }

  function sceneMonsHtml(scene, idx, editable) {
    var chips = (scene.monsters || []).map(function (m, i) {
      return monChip(m, idx, i, editable);
    }).join(' ');
    return '<div class="scene__mons">' +
      (chips || '<span class="muted">No monsters in this scene.</span>') + '</div>';
  }

  function readerHtml(adv) {
    var scenes = adv.scenes.map(function (s, i) {
      return '<div class="scene scene--read">' +
        '<h3 class="scene__h">' + esc(s.title) + '</h3>' +
        '<p class="scene__text">' + esc(s.text) + '</p>' +
        sceneMonsHtml(s, i, false) +
        '<button class="btn-send" data-send="' + i + '">▶ Send encounter to planner</button>' +
      '</div>';
    }).join('');
    return '<div class="adv-head">' +
        '<h2 class="adv-title">' + esc(adv.title) + '</h2>' +
        '<span class="adv-levels">Levels ' + esc(adv.levels) + '</span>' +
        '<p class="adv-summary">' + esc(adv.summary) + '</p>' +
        '<p class="muted">Built-in adventure (read-only). Use “Duplicate to edit” to make your own version.</p>' +
      '</div>' + scenes;
  }

  function editorHtml(adv) {
    var scenes = adv.scenes.map(function (s, i) {
      return '<div class="scene" data-scene="' + i + '">' +
        '<input class="scene__title" data-scene-field="title" data-scene="' + i + '" ' +
          'value="' + esc(s.title) + '" placeholder="Scene title">' +
        '<textarea class="scene__ta" data-scene-field="text" data-scene="' + i + '" rows="5" ' +
          'placeholder="Read-aloud text and DM notes…">' + esc(s.text) + '</textarea>' +
        sceneMonsHtml(s, i, true) +
        '<div class="scene__add">' +
          '<input class="mon-input" list="mon-list" placeholder="monster name">' +
          '<input class="mon-count" type="number" min="1" value="1">' +
          '<button class="btn-add-mon" data-add-mon="' + i + '">+ Monster</button>' +
          '<button class="btn-send" data-send="' + i + '">▶ Send to planner</button>' +
          '<button class="btn-del-scene" data-del-scene="' + i + '">Delete scene</button>' +
        '</div>' +
      '</div>';
    }).join('');
    return '<div class="adv-head">' +
        '<input class="adv-title-input" data-adv-field="title" value="' + esc(adv.title) + '" placeholder="Adventure title">' +
        '<input class="adv-levels-input" data-adv-field="levels" value="' + esc(adv.levels) + '" placeholder="Levels (e.g. 1–3)">' +
        '<textarea class="adv-summary-input" data-adv-field="summary" rows="3" placeholder="Summary / hook…">' + esc(adv.summary) + '</textarea>' +
      '</div>' + scenes +
      '<button class="btn-add-scene">+ Add scene</button>';
  }

  function render() {
    renderSelector();
    el.view.innerHTML = isBuiltin(active) ? readerHtml(active) : editorHtml(active);
  }

  /* ---- Actions ---- */
  function switchTo(id) {
    active = findAdv(id) || builtins[0];
    try { window.localStorage.setItem(ACTIVE, active.id); } catch (e) { /* ignore */ }
    render();
  }
  function addUser(adv) {
    userAdvs.push(adv);
    active = adv;
    try { window.localStorage.setItem(ACTIVE, adv.id); } catch (e) { /* ignore */ }
    persist();
    render();
  }
  function duplicateActive() {
    var copy = JSON.parse(JSON.stringify(active));
    delete copy.builtin;
    copy.id = uid();
    copy.title = (active.title || 'Adventure') + ' (copy)';
    addUser(copy);
  }
  function deleteActive() {
    if (isBuiltin(active)) return;
    if (!window.confirm('Delete "' + (active.title || 'this adventure') + '"?')) return;
    userAdvs = userAdvs.filter(function (a) { return a.id !== active.id; });
    active = userAdvs[0] || builtins[0];
    try { window.localStorage.setItem(ACTIVE, active.id); } catch (e) { /* ignore */ }
    persist();
    render();
  }

  // Hand the scene's monsters to the Encounter Planner.
  function sendScene(idx) {
    var scene = active.scenes[idx];
    var mons = (scene.monsters || []).filter(function (m) { return m.slug; })
      .map(function (m) { return { slug: m.slug, count: m.count || 1 }; });
    if (!mons.length) { window.alert('This scene has no monsters that match the bestiary.'); return; }
    try {
      window.localStorage.setItem(PENDING, JSON.stringify({
        name: active.title + ' — ' + scene.title, monsters: mons
      }));
    } catch (e) { /* ignore */ }
    window.location.href = 'encounter.html';
  }

  /* ---- Editor input/click (delegated on #adv-main) ---- */
  function onMainInput(e) {
    if (isBuiltin(active)) return;
    var t = e.target;
    if (t.hasAttribute('data-adv-field')) {
      active[t.getAttribute('data-adv-field')] = t.value;
      if (t.getAttribute('data-adv-field') === 'title') renderSelector();
      persist();
    } else if (t.hasAttribute('data-scene-field')) {
      var i = parseInt(t.getAttribute('data-scene'), 10);
      active.scenes[i][t.getAttribute('data-scene-field')] = t.value;
      persist();
    }
  }

  function onMainClick(e) {
    var t = e.target;

    if (t.hasAttribute('data-send')) {
      sendScene(parseInt(t.getAttribute('data-send'), 10));
      return;
    }
    if (isBuiltin(active)) return; // remaining actions are editor-only

    if (t.hasAttribute('data-add-mon')) {
      var si = parseInt(t.getAttribute('data-add-mon'), 10);
      var block = t.closest('.scene');
      var nameInput = block.querySelector('.mon-input');
      var countInput = block.querySelector('.mon-count');
      var name = (nameInput.value || '').trim();
      var slug = NAME2SLUG[name.toLowerCase()] || '';
      var count = parseInt(countInput.value, 10) || 1;
      if (!name) return;
      if (!slug) { window.alert('No monster called "' + name + '" in the bestiary.'); return; }
      active.scenes[si].monsters.push({ slug: slug, name: name, count: count });
      persist();
      render();
    } else if (t.hasAttribute('data-mon-remove')) {
      var s2 = parseInt(t.getAttribute('data-scene'), 10);
      var m2 = parseInt(t.getAttribute('data-mon'), 10);
      active.scenes[s2].monsters.splice(m2, 1);
      persist();
      render();
    } else if (t.hasAttribute('data-del-scene')) {
      var ds = parseInt(t.getAttribute('data-del-scene'), 10);
      active.scenes.splice(ds, 1);
      if (!active.scenes.length) active.scenes.push({ title: 'Scene 1', text: '', monsters: [] });
      persist();
      render();
    } else if (t.classList.contains('btn-add-scene')) {
      active.scenes.push({ title: 'Scene ' + (active.scenes.length + 1), text: '', monsters: [] });
      persist();
      render();
    }
  }

  /* ---- Init ---- */
  function init() {
    el.select = document.querySelector('#adv-select');
    el.view = document.querySelector('#adventure-view');
    el.status = document.querySelector('#adv-status');
    el.delBtn = document.querySelector('.btn-del-adv');
    el.main = document.querySelector('#adv-main');

    // monster name suggestions for the editor
    var dl = document.querySelector('#mon-list');
    if (dl) {
      dl.innerHTML = (window.MONSTER_DATA || []).map(function (m) {
        return '<option value="' + esc(m.name) + '"></option>';
      }).join('');
    }

    userAdvs = loadUser();

    var startId = null;
    try { startId = window.localStorage.getItem(ACTIVE); } catch (e) { /* ignore */ }
    active = findAdv(startId) || builtins[0] || userAdvs[0];
    if (!active) { active = newAdventure(); userAdvs.push(active); persist(); }

    render();

    el.select.addEventListener('change', function () { switchTo(el.select.value); });
    document.querySelector('.btn-new-adv').addEventListener('click', function () {
      addUser(newAdventure());
    });
    document.querySelector('.btn-dup-adv').addEventListener('click', duplicateActive);
    el.delBtn.addEventListener('click', deleteActive);

    el.main.addEventListener('input', onMainInput);
    el.main.addEventListener('click', onMainClick);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
