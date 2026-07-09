/* ============================================================
   Dice & Monsters — Adventure
   ------------------------------------------------------------
   Read a built-in one-shot or write your own. Each scene has story
   text, traps/hazards, an optional map image, and a monster list
   that can be sent straight to the Encounter Planner. Your
   adventures are stored in localStorage.
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

  var NAME2SLUG = {};
  (window.MONSTER_DATA || []).forEach(function (m) { NAME2SLUG[m.name.toLowerCase()] = m.slug; });

  function loadUser() {
    try { return JSON.parse(window.localStorage.getItem(STORAGE)) || []; }
    catch (e) { return []; }
  }
  function persist() {
    try { window.localStorage.setItem(STORAGE, JSON.stringify(userAdvs)); }
    catch (e) { status('Could not save (storage full?)'); return; }
    status('Saved');
    if (window.CloudSync) window.CloudSync.push('adventures');
  }
  // Re-read the (cloud-merged) user adventures and re-render.
  function syncReload() {
    userAdvs = loadUser();
    switchTo((active && active.id) || (builtins[0] && builtins[0].id));
  }
  function status(text) {
    el.status.textContent = text;
    el.status.classList.add('save-status--show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { el.status.classList.remove('save-status--show'); }, 1400);
  }

  function isBuiltin(adv) { return !!(adv && adv.builtin); }
  function allAdvs() { return builtins.concat(userAdvs); }
  function findAdv(id) {
    var all = allAdvs();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function newScene(n) {
    return { title: 'Scene ' + n, text: '', npcs: [], traps: [], treasure: '', map: '', monsters: [] };
  }
  function newAdventure() {
    return { id: uid(), title: 'New adventure', levels: '1', summary: '', scenes: [newScene(1)] };
  }

  /* ---- Rendering ---- */
  function renderSelector() {
    var opt = function (a) {
      return '<option value="' + a.id + '"' + (a.id === active.id ? ' selected' : '') + '>' +
        esc(a.title) + '</option>';
    };
    el.select.innerHTML =
      '<optgroup label="Built-in one-shots">' + builtins.map(opt).join('') + '</optgroup>' +
      (userAdvs.length ? '<optgroup label="Your adventures">' + userAdvs.map(opt).join('') + '</optgroup>' : '');
    el.delBtn.disabled = isBuiltin(active);
  }

  function monChip(m, sceneIdx, monIdx, editable) {
    var label = esc(m.name || m.slug) + ' &times;' + (m.count || 1);
    if (!editable) return '<span class="mon-chip">' + label + '</span>';
    return '<span class="mon-chip mon-chip--edit" data-mon-remove ' +
      'data-scene="' + sceneIdx + '" data-mon="' + monIdx + '" title="Remove">' + label + ' ✕</span>';
  }

  function sceneMonsHtml(scene, idx, editable) {
    var chips = (scene.monsters || []).map(function (m, i) { return monChip(m, idx, i, editable); }).join(' ');
    return '<div class="scene__block"><span class="scene__lbl">Monsters</span>' +
      '<div class="scene__mons">' +
        (chips || '<span class="muted">none</span>') + '</div></div>';
  }

  function mapHtml(scene, idx, editable) {
    var img = scene.map
      ? '<img class="scene__map" src="' + esc(scene.map) + '" alt="Map">'
      : (editable ? '' : '');
    if (!editable) return img ? '<div class="scene__block"><span class="scene__lbl">Map</span>' + img + '</div>' : '';
    return '<div class="scene__block"><span class="scene__lbl">Map</span>' +
      img +
      '<div class="map-edit">' +
        '<input type="file" accept="image/*" class="map-file" data-scene="' + idx + '">' +
        '<input type="text" class="map-url" data-scene="' + idx + '" placeholder="…or paste image URL">' +
        '<button class="btn-map-url" data-map-url="' + idx + '">Set URL</button>' +
        (scene.map ? '<button class="btn-map-clear" data-map-clear="' + idx + '">Remove map</button>' : '') +
      '</div></div>';
  }

  function trapsHtml(scene, idx, editable) {
    var traps = scene.traps || [];
    if (!editable) {
      if (!traps.length) return '';
      var items = traps.map(function (t) {
        var dc = [];
        if (t.detect) dc.push('Spot DC ' + esc(t.detect));
        if (t.disarm) dc.push('Disarm DC ' + esc(t.disarm));
        return '<li><b>' + esc(t.name || 'Trap') + '</b>' +
          (dc.length ? ' <span class="trap-dc">(' + dc.join(', ') + ')</span>' : '') +
          (t.effect ? ' — ' + esc(t.effect) : '') + '</li>';
      }).join('');
      return '<div class="scene__block"><span class="scene__lbl">Traps &amp; hazards</span>' +
        '<ul class="trap-list">' + items + '</ul></div>';
    }
    var rows = traps.map(function (t, i) {
      return '<div class="trap-row" data-scene="' + idx + '" data-trap="' + i + '">' +
        '<input type="text" class="trap-name" data-trap-field="name" placeholder="Trap name" value="' + esc(t.name) + '">' +
        '<input type="text" class="trap-dc-in" data-trap-field="detect" placeholder="Spot DC" value="' + esc(t.detect) + '">' +
        '<input type="text" class="trap-dc-in" data-trap-field="disarm" placeholder="Disarm DC" value="' + esc(t.disarm) + '">' +
        '<input type="text" class="trap-eff" data-trap-field="effect" placeholder="Effect" value="' + esc(t.effect) + '">' +
        '<button class="btn-trap-del" data-trap-remove data-scene="' + idx + '" data-trap="' + i + '" title="Remove">&times;</button>' +
      '</div>';
    }).join('');
    return '<div class="scene__block"><span class="scene__lbl">Traps &amp; hazards</span>' +
      '<div class="trap-rows">' + rows + '</div>' +
      '<button class="btn-add-trap" data-add-trap="' + idx + '">+ Add trap</button></div>';
  }

  function npcsHtml(scene, idx, editable) {
    var npcs = scene.npcs || [];
    if (!editable) {
      if (!npcs.length) return '';
      var items = npcs.map(function (n) {
        return '<li><b>' + esc(n.name || 'NPC') + '</b>' +
          (n.role ? ' <span class="npc-role">' + esc(n.role) + '</span>' : '') +
          (n.line ? ' — “' + esc(n.line) + '”' : '') + '</li>';
      }).join('');
      return '<div class="scene__block"><span class="scene__lbl">NPCs</span>' +
        '<ul class="npc-list">' + items + '</ul></div>';
    }
    var rows = npcs.map(function (n, i) {
      return '<div class="npc-row" data-scene="' + idx + '" data-npc="' + i + '">' +
        '<input type="text" class="npc-name" data-npc-field="name" placeholder="Name" value="' + esc(n.name) + '">' +
        '<input type="text" class="npc-role" data-npc-field="role" placeholder="Role" value="' + esc(n.role) + '">' +
        '<input type="text" class="npc-line" data-npc-field="line" placeholder="Quote / note" value="' + esc(n.line) + '">' +
        '<button class="btn-npc-del" data-npc-remove data-scene="' + idx + '" data-npc="' + i + '" title="Remove">&times;</button>' +
      '</div>';
    }).join('');
    return '<div class="scene__block"><span class="scene__lbl">NPCs</span>' +
      '<div class="npc-rows">' + rows + '</div>' +
      '<button class="btn-add-npc" data-add-npc="' + idx + '">+ Add NPC</button></div>';
  }

  function treasureHtml(scene, idx, editable) {
    if (!editable) {
      if (!scene.treasure) return '';
      return '<div class="scene__block"><span class="scene__lbl">Treasure &amp; rewards</span>' +
        '<p class="treasure">' + esc(scene.treasure) + '</p></div>';
    }
    return '<div class="scene__block"><span class="scene__lbl">Treasure &amp; rewards</span>' +
      '<textarea class="treasure-ta" data-scene-field="treasure" data-scene="' + idx + '" rows="2" ' +
      'placeholder="Loot, gold, rewards, story payoff…">' + esc(scene.treasure) + '</textarea></div>';
  }

  function readerHtml(adv) {
    var scenes = adv.scenes.map(function (s, i) {
      return '<div class="scene scene--read">' +
        '<h3 class="scene__h">' + esc(s.title) + '</h3>' +
        '<p class="scene__text">' + esc(s.text) + '</p>' +
        mapHtml(s, i, false) +
        npcsHtml(s, i, false) +
        trapsHtml(s, i, false) +
        treasureHtml(s, i, false) +
        sceneMonsHtml(s, i, false) +
        '<div class="scene__actions">' +
          '<button class="btn-play-scene" data-play="' + i + '">🎲 Play this scene</button>' +
          '<button class="btn-send" data-send="' + i + '">▶ Send encounter to planner</button>' +
        '</div>' +
      '</div>';
    }).join('');
    return '<div class="adv-head">' +
        '<h2 class="adv-title">' + esc(adv.title) + '</h2>' +
        '<span class="adv-levels">Levels ' + esc(adv.levels) + '</span>' +
        '<p class="adv-summary">' + esc(adv.summary) + '</p>' +
        '<p class="muted">Built-in adventure (read-only). Use “Duplicate to edit” to add your own maps, traps and notes.</p>' +
      '</div>' + scenes;
  }

  function editorHtml(adv) {
    var scenes = adv.scenes.map(function (s, i) {
      return '<div class="scene" data-scene="' + i + '">' +
        '<input class="scene__title" data-scene-field="title" data-scene="' + i + '" value="' + esc(s.title) + '" placeholder="Scene title">' +
        '<textarea class="scene__ta" data-scene-field="text" data-scene="' + i + '" rows="5" placeholder="Read-aloud text and DM notes…">' + esc(s.text) + '</textarea>' +
        mapHtml(s, i, true) +
        npcsHtml(s, i, true) +
        trapsHtml(s, i, true) +
        treasureHtml(s, i, true) +
        sceneMonsHtml(s, i, true) +
        '<div class="scene__add">' +
          '<input class="mon-input" list="mon-list" placeholder="monster name">' +
          '<input class="mon-count" type="number" min="1" value="1">' +
          '<button class="btn-add-mon" data-add-mon="' + i + '">+ Monster</button>' +
          '<button class="btn-play-scene" data-play="' + i + '">🎲 Play scene</button>' +
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

  function renderGallery() {
    if (!el.gallery) return;
    el.gallery.innerHTML = builtins.map(function (a) {
      var sum = (a.summary || '');
      if (sum.length > 110) sum = sum.slice(0, 110).replace(/\s+\S*$/, '') + '…';
      return '<button class="adv-card' + (a.id === active.id ? ' adv-card--active' : '') +
        '" data-load="' + a.id + '">' +
        '<span class="adv-card__title">' + esc(a.title) + '</span>' +
        '<span class="adv-card__levels">Levels ' + esc(a.levels) + ' &middot; ' +
          a.scenes.length + ' scenes</span>' +
        '<span class="adv-card__sum">' + esc(sum) + '</span>' +
      '</button>';
    }).join('');
  }

  function render() {
    renderSelector();
    renderGallery();
    el.view.innerHTML = isBuiltin(active) ? readerHtml(active) : editorHtml(active);
  }

  /* ---- Actions ---- */
  function setActive(adv) {
    active = adv;
    try { window.localStorage.setItem(ACTIVE, adv.id); } catch (e) { /* ignore */ }
  }
  function switchTo(id) { setActive(findAdv(id) || builtins[0]); render(); }
  function addUser(adv) { userAdvs.push(adv); setActive(adv); persist(); render(); }
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
    setActive(userAdvs[0] || builtins[0]);
    persist();
    render();
  }

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

  // Send a scene straight to the Gameplay page: its monsters spawn on the
  // table and its text (read-aloud + DM notes) grounds the AI DM.
  function playScene(idx) {
    var scene = active.scenes[idx];
    var mons = (scene.monsters || []).filter(function (m) { return m.slug; })
      .map(function (m) { return { slug: m.slug, count: m.count || 1 }; });
    try {
      window.localStorage.setItem('diceAndMonsters.playSession', JSON.stringify({
        name: active.title + ' — ' + scene.title,
        monsters: mons,
        scene: { title: scene.title, text: scene.text || '' }
      }));
    } catch (e) { /* ignore */ }
    window.location.href = 'play.html';
  }

  /* ---- Editor input / change / click (delegated on #adv-main) ---- */
  function onMainInput(e) {
    if (isBuiltin(active)) return;
    var t = e.target;
    if (t.hasAttribute('data-adv-field')) {
      active[t.getAttribute('data-adv-field')] = t.value;
      if (t.getAttribute('data-adv-field') === 'title') renderSelector();
      persist();
    } else if (t.hasAttribute('data-scene-field')) {
      active.scenes[+t.getAttribute('data-scene')][t.getAttribute('data-scene-field')] = t.value;
      persist();
    } else if (t.hasAttribute('data-trap-field')) {
      var tr = t.closest('.trap-row');
      active.scenes[+tr.getAttribute('data-scene')].traps[+tr.getAttribute('data-trap')][t.getAttribute('data-trap-field')] = t.value;
      persist();
    } else if (t.hasAttribute('data-npc-field')) {
      var nr = t.closest('.npc-row');
      active.scenes[+nr.getAttribute('data-scene')].npcs[+nr.getAttribute('data-npc')][t.getAttribute('data-npc-field')] = t.value;
      persist();
    }
  }

  function onMainChange(e) {
    if (isBuiltin(active)) return;
    var t = e.target;
    if (!t.classList.contains('map-file')) return;
    var file = t.files && t.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      active.scenes[+t.getAttribute('data-scene')].map = reader.result;
      persist();
      render();
    };
    reader.readAsDataURL(file);
  }

  function onMainClick(e) {
    var t = e.target;
    if (t.hasAttribute('data-play')) { playScene(+t.getAttribute('data-play')); return; }
    if (t.hasAttribute('data-send')) { sendScene(+t.getAttribute('data-send')); return; }
    if (isBuiltin(active)) return; // editor-only below

    if (t.hasAttribute('data-add-mon')) {
      var si = +t.getAttribute('data-add-mon');
      var block = t.closest('.scene');
      var name = (block.querySelector('.mon-input').value || '').trim();
      var slug = NAME2SLUG[name.toLowerCase()] || '';
      var count = parseInt(block.querySelector('.mon-count').value, 10) || 1;
      if (!name) return;
      if (!slug) { window.alert('No monster called "' + name + '" in the bestiary.'); return; }
      active.scenes[si].monsters.push({ slug: slug, name: name, count: count });
      persist(); render();
    } else if (t.hasAttribute('data-mon-remove')) {
      active.scenes[+t.getAttribute('data-scene')].monsters.splice(+t.getAttribute('data-mon'), 1);
      persist(); render();
    } else if (t.hasAttribute('data-add-trap')) {
      active.scenes[+t.getAttribute('data-add-trap')].traps.push({ name: '', detect: '', disarm: '', effect: '' });
      persist(); render();
    } else if (t.hasAttribute('data-trap-remove')) {
      active.scenes[+t.getAttribute('data-scene')].traps.splice(+t.getAttribute('data-trap'), 1);
      persist(); render();
    } else if (t.hasAttribute('data-add-npc')) {
      active.scenes[+t.getAttribute('data-add-npc')].npcs.push({ name: '', role: '', line: '' });
      persist(); render();
    } else if (t.hasAttribute('data-npc-remove')) {
      active.scenes[+t.getAttribute('data-scene')].npcs.splice(+t.getAttribute('data-npc'), 1);
      persist(); render();
    } else if (t.hasAttribute('data-map-url')) {
      var s2 = +t.getAttribute('data-map-url');
      var urlInput = t.closest('.map-edit').querySelector('.map-url');
      var url = (urlInput.value || '').trim();
      if (url) { active.scenes[s2].map = url; persist(); render(); }
    } else if (t.hasAttribute('data-map-clear')) {
      active.scenes[+t.getAttribute('data-map-clear')].map = '';
      persist(); render();
    } else if (t.hasAttribute('data-del-scene')) {
      var ds = +t.getAttribute('data-del-scene');
      active.scenes.splice(ds, 1);
      if (!active.scenes.length) active.scenes.push(newScene(1));
      persist(); render();
    } else if (t.classList.contains('btn-add-scene')) {
      active.scenes.push(newScene(active.scenes.length + 1));
      persist(); render();
    }
  }

  /* ---- Init ---- */
  function init() {
    el.select = document.querySelector('#adv-select');
    el.view = document.querySelector('#adventure-view');
    el.status = document.querySelector('#adv-status');
    el.delBtn = document.querySelector('.btn-del-adv');
    el.main = document.querySelector('#adv-main');
    el.gallery = document.querySelector('#adv-gallery-cards');

    var dl = document.querySelector('#mon-list');
    if (dl) {
      dl.innerHTML = (window.MONSTER_DATA || []).map(function (m) {
        return '<option value="' + esc(m.name) + '"></option>';
      }).join('');
    }

    userAdvs = loadUser();
    // migrate older user adventures to the current scene shape
    userAdvs.forEach(function (a) {
      (a.scenes || []).forEach(function (s) {
        if (!s.traps) s.traps = [];
        if (!s.npcs) s.npcs = [];
        if (s.treasure === undefined) s.treasure = '';
        if (s.map === undefined) s.map = '';
        if (!s.monsters) s.monsters = [];
      });
    });

    var startId = null;
    try { startId = window.localStorage.getItem(ACTIVE); } catch (e) { /* ignore */ }
    active = findAdv(startId) || builtins[0] || userAdvs[0];
    if (!active) { active = newAdventure(); userAdvs.push(active); persist(); }

    render();

    if (window.CloudSync) {
      window.CloudSync.attach({
        kind: 'adventures', lsKey: STORAGE, idKey: 'id',
        mount: '#cloud-bar', onRemoteChange: syncReload
      });
    }

    el.select.addEventListener('change', function () { switchTo(el.select.value); });
    el.gallery.addEventListener('click', function (e) {
      var card = e.target.closest('[data-load]');
      if (card) switchTo(card.getAttribute('data-load'));
    });
    document.querySelector('.btn-new-adv').addEventListener('click', function () { addUser(newAdventure()); });
    document.querySelector('.btn-dup-adv').addEventListener('click', duplicateActive);
    el.delBtn.addEventListener('click', deleteActive);

    el.main.addEventListener('input', onMainInput);
    el.main.addEventListener('change', onMainChange);
    el.main.addEventListener('click', onMainClick);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
