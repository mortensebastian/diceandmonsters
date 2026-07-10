/* ============================================================
   Dice & Monsters — Battlemap (Game Session)
   ------------------------------------------------------------
   A <canvas> tabletop that draws the map *behind* the grid and
   the combatant tokens *on* it. Two ways to build the map:

     1. Paint terrain — click/drag to paint cells (wall, water,
        difficult terrain, grass, wood, lava) in their own colours.
        Cheap to store (a sparse { "col,row": type } map).
     2. Background image — drop in a battlemap picture; it is
        downscaled and stored as a data URL under the grid.

   The grid geometry is isolated so a square battle grid and a
   hex overland grid share the same tokens, dragging and distance
   maths — only neighbours/centres/distance differ.

   Local-first & UI-only: it owns no game rules. Token positions
   live on the combatants (engine x/y, so they ride the existing
   autosave + cloud snapshot for free); the map config (grid,
   terrain, background) is handed to play.js via getMap()/setMap()
   to persist in the same session snapshot. No network, no deps.
   Exposes exactly one global: window.Battlemap.
   ============================================================ */
(function () {
  'use strict';

  /* ---- Terrain palette (drawn under the grid) ---- */
  var TERRAIN = {
    wall:      { label: 'Wall',      fill: '#3b4150', swatch: '#3b4150', block: true },
    water:     { label: 'Water',     fill: 'rgba(41,128,185,.45)',  swatch: '#2980b9' },
    difficult: { label: 'Difficult', fill: 'rgba(230,126,34,.32)',  swatch: '#e67e22' },
    grass:     { label: 'Grass',     fill: 'rgba(39,174,96,.30)',   swatch: '#27ae60' },
    wood:      { label: 'Wood',      fill: 'rgba(120,72,40,.45)',   swatch: '#8a5a2b' },
    lava:      { label: 'Lava',      fill: 'rgba(192,57,43,.45)',   swatch: '#c0392b' }
  };
  var TERRAIN_ORDER = ['wall', 'water', 'difficult', 'grass', 'wood', 'lava'];

  var KIND_COLOR = { monster: '#c0392b', npc: '#9b59b6', player: '#4aa3df' };

  function defaultMap() {
    return { v: 1, grid: 'square', cols: 16, rows: 12, terrain: {}, bg: null };
  }

  /* ---- Module state ---- */
  var CV = null, CTX = null, wrap = null, distEl = null;
  var cb = {};                 // { onMove, onSelect, onChange }
  var combatants = [];         // live array from play.js (read x/y off each)
  var map = defaultMap();
  var bgImage = null;          // Image built from map.bg
  var tool = 'select';         // 'select' | 'paint' | 'erase'
  var paintTerrain = 'wall';
  var locked = false;          // viewers: no drag / no paint
  var selectedId = null;
  var drag = null;             // { id, fromCol, fromRow, px, py, col, row }
  var painting = false;
  var lastPaintKey = null;
  var resizeTimer = null;

  /* ---- Geometry: everything square-vs-hex lives here ---- */
  function metrics() {
    var avail = Math.max(240, wrap ? wrap.clientWidth : 640);
    if (map.grid === 'hex') {
      var hw = avail / (map.cols + 0.5);   // pointy-top hex flat-to-flat width
      var size = hw / Math.sqrt(3);        // centre → corner
      var h = size * 2 + (map.rows - 1) * size * 1.5;
      return { grid: 'hex', w: hw * (map.cols + 0.5), h: h, hw: hw, size: size };
    }
    var cell = Math.max(14, Math.floor(avail / map.cols));
    return { grid: 'square', w: cell * map.cols, h: cell * map.rows, cell: cell };
  }

  function cellCenter(col, row, m) {
    if (m.grid === 'hex') {
      return {
        x: m.hw * col + ((row & 1) ? m.hw / 2 : 0) + m.hw / 2,
        y: m.size + row * m.size * 1.5
      };
    }
    return { x: col * m.cell + m.cell / 2, y: row * m.cell + m.cell / 2 };
  }

  function tokenRadius(m) {
    return m.grid === 'hex' ? m.size * 0.72 : m.cell * 0.38;
  }

  function inBounds(col, row) {
    return col >= 0 && row >= 0 && col < map.cols && row < map.rows;
  }

  function pixelToCell(px, py, m) {
    if (m.grid === 'hex') {
      var approxRow = Math.round((py - m.size) / (m.size * 1.5));
      var best = null, bd = Infinity, dr, dc;
      for (dr = -1; dr <= 1; dr++) {
        var row = approxRow + dr;
        if (row < 0 || row >= map.rows) continue;
        var approxCol = Math.round((px - ((row & 1) ? m.hw / 2 : 0) - m.hw / 2) / m.hw);
        for (dc = -1; dc <= 1; dc++) {
          var col = approxCol + dc;
          if (col < 0 || col >= map.cols) continue;
          var c = cellCenter(col, row, m);
          var d = (c.x - px) * (c.x - px) + (c.y - py) * (c.y - py);
          if (d < bd) { bd = d; best = { col: col, row: row }; }
        }
      }
      return best;
    }
    var scol = Math.floor(px / m.cell), srow = Math.floor(py / m.cell);
    return inBounds(scol, srow) ? { col: scol, row: srow } : null;
  }

  // offset (odd-r) → cube, so distance is exact for the hex layout above.
  function cellDistance(a, b) {
    if (map.grid === 'hex') {
      var ax = a.col - (a.row - (a.row & 1)) / 2, az = a.row, ay = -ax - az;
      var bx = b.col - (b.row - (b.row & 1)) / 2, bz = b.row, by = -bx - bz;
      return (Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(az - bz)) / 2;
    }
    // 5e default: diagonals count as one square (Chebyshev).
    return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
  }

  /* ---- Drawing ---- */
  function hexPath(cx, cy, size) {
    CTX.beginPath();
    for (var i = 0; i < 6; i++) {
      var ang = Math.PI / 180 * (60 * i - 90);   // pointy-top
      var x = cx + size * Math.cos(ang), y = cy + size * Math.sin(ang);
      if (i === 0) CTX.moveTo(x, y); else CTX.lineTo(x, y);
    }
    CTX.closePath();
  }

  function fillCellShape(col, row, m) {
    var c = cellCenter(col, row, m);
    if (m.grid === 'hex') { hexPath(c.x, c.y, m.size); CTX.fill(); }
    else CTX.fillRect(col * m.cell, row * m.cell, m.cell, m.cell);
  }

  function drawCover(img, m) {
    var cw = CV.width, ch = CV.height;
    var ir = img.naturalWidth / img.naturalHeight, cr = cw / ch;
    var dw, dh, dx, dy;
    if (ir > cr) { dh = ch; dw = ch * ir; dx = (cw - dw) / 2; dy = 0; }
    else { dw = cw; dh = cw / ir; dx = 0; dy = (ch - dh) / 2; }
    CTX.drawImage(img, dx, dy, dw, dh);
  }

  function drawTerrain(m) {
    for (var key in map.terrain) {
      if (!map.terrain.hasOwnProperty(key)) continue;
      var t = TERRAIN[map.terrain[key]];
      if (!t) continue;
      var parts = key.split(',');
      var col = +parts[0], row = +parts[1];
      if (!inBounds(col, row)) continue;
      CTX.fillStyle = t.fill;
      fillCellShape(col, row, m);
    }
  }

  function drawGrid(m) {
    CTX.strokeStyle = 'rgba(230,230,230,.16)';
    CTX.lineWidth = 1;
    var col, row;
    if (m.grid === 'hex') {
      for (row = 0; row < map.rows; row++) {
        for (col = 0; col < map.cols; col++) {
          var c = cellCenter(col, row, m);
          hexPath(c.x, c.y, m.size);
          CTX.stroke();
        }
      }
      return;
    }
    CTX.beginPath();
    for (col = 0; col <= map.cols; col++) {
      CTX.moveTo(col * m.cell + 0.5, 0);
      CTX.lineTo(col * m.cell + 0.5, m.h);
    }
    for (row = 0; row <= map.rows; row++) {
      CTX.moveTo(0, row * m.cell + 0.5);
      CTX.lineTo(m.w, row * m.cell + 0.5);
    }
    CTX.stroke();
  }

  function drawToken(c, cx, cy, m, ghost) {
    var r = tokenRadius(m);
    var color = c.dead ? '#555a68' : (KIND_COLOR[c.kind] || '#888');
    CTX.save();
    if (ghost) CTX.globalAlpha = 0.65;
    CTX.beginPath();
    CTX.arc(cx, cy, r, 0, Math.PI * 2);
    CTX.fillStyle = color;
    CTX.fill();
    CTX.lineWidth = (c.id === selectedId) ? 3 : 2;
    CTX.strokeStyle = (c.id === selectedId) ? '#e1b12c' : 'rgba(0,0,0,.6)';
    CTX.stroke();

    // initial(s)
    var label = String(c.name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
    CTX.fillStyle = '#fff';
    CTX.font = 'bold ' + Math.round(r * 0.9) + 'px "Open Sans", sans-serif';
    CTX.textAlign = 'center';
    CTX.textBaseline = 'middle';
    CTX.fillText(label, cx, cy);

    if (c.dead) {
      CTX.strokeStyle = '#c0392b';
      CTX.lineWidth = 2.5;
      CTX.beginPath();
      CTX.moveTo(cx - r * 0.6, cy - r * 0.6); CTX.lineTo(cx + r * 0.6, cy + r * 0.6);
      CTX.moveTo(cx + r * 0.6, cy - r * 0.6); CTX.lineTo(cx - r * 0.6, cy + r * 0.6);
      CTX.stroke();
    }

    // name plate under the token
    var nm = String(c.name || '');
    if (nm) {
      CTX.font = Math.round(Math.max(9, r * 0.5)) + 'px "Open Sans", sans-serif';
      var tw = CTX.measureText(nm).width;
      var py = cy + r + 3;
      CTX.fillStyle = 'rgba(0,0,0,.55)';
      CTX.fillRect(cx - tw / 2 - 3, py, tw + 6, 13);
      CTX.fillStyle = '#e6e6e6';
      CTX.textBaseline = 'top';
      CTX.fillText(nm, cx, py + 1);
    }
    CTX.restore();
  }

  function drawTokens(m) {
    combatants.forEach(function (c) {
      if (c.x == null || c.y == null) return;
      if (drag && drag.id === c.id) return;   // drawn following the pointer instead
      if (!inBounds(c.x, c.y)) return;
      var ctr = cellCenter(c.x, c.y, m);
      drawToken(c, ctr.x, ctr.y, m);
    });
    if (drag) {
      var d = findCombatant(drag.id);
      if (d) {
        // snap-preview ring on the target cell + a lead line
        if (inBounds(drag.col, drag.row)) {
          var tgt = cellCenter(drag.col, drag.row, m);
          CTX.save();
          CTX.strokeStyle = 'rgba(225,177,44,.9)';
          CTX.lineWidth = 2;
          CTX.setLineDash([5, 4]);
          CTX.beginPath();
          CTX.arc(tgt.x, tgt.y, tokenRadius(m), 0, Math.PI * 2);
          CTX.stroke();
          CTX.restore();
        }
        drawToken(d, drag.px, drag.py, m, true);
      }
    }
  }

  function render() {
    if (!CTX) return;
    var m = metrics();
    var w = Math.round(m.w), h = Math.round(m.h);
    if (CV.width !== w || CV.height !== h) {
      CV.width = w;
      CV.height = h;
    }
    // Pin the CSS display size to the backing size so a click maps 1:1 (no
    // aspect distortion from max-width shrinking width but not height).
    CV.style.width = w + 'px';
    CV.style.height = h + 'px';
    CTX.clearRect(0, 0, CV.width, CV.height);
    if (bgImage && bgImage.complete && bgImage.naturalWidth) {
      drawCover(bgImage, m);
    } else {
      CTX.fillStyle = '#12141a';
      CTX.fillRect(0, 0, CV.width, CV.height);
    }
    drawTerrain(m);
    drawGrid(m);
    drawTokens(m);
  }

  /* ---- Placement ---- */
  function findCombatant(id) {
    for (var i = 0; i < combatants.length; i++) if (combatants[i].id === id) return combatants[i];
    return null;
  }
  function isWall(col, row) { return map.terrain[col + ',' + row] === 'wall'; }
  function occupied(used, col, row) { return !!used[col + ',' + row]; }

  function firstFree(used) {
    var col, row;
    for (row = 0; row < map.rows; row++) {
      for (col = 0; col < map.cols; col++) {
        if (!occupied(used, col, row) && !isWall(col, row)) return { col: col, row: row };
      }
    }
    return { col: 0, row: 0 };
  }

  // Give every unplaced combatant a home; clamp any that fell outside a
  // resized grid. Persists via onMove so positions survive a reload.
  function ensurePlacement() {
    var used = {};
    combatants.forEach(function (c) {
      if (c.x != null && c.y != null && inBounds(c.x, c.y)) used[c.x + ',' + c.y] = true;
    });
    combatants.forEach(function (c) {
      var moved = false;
      if (c.x == null || c.y == null) {
        var spot = firstFree(used);
        c.x = spot.col; c.y = spot.row; moved = true;
      } else if (!inBounds(c.x, c.y)) {
        c.x = Math.min(Math.max(0, c.x), map.cols - 1);
        c.y = Math.min(Math.max(0, c.y), map.rows - 1);
        moved = true;
      }
      if (moved) {
        used[c.x + ',' + c.y] = true;
        if (cb.onMove) cb.onMove(c.id, c.x, c.y);
      }
    });
  }

  function tokenAt(col, row) {
    // topmost living token first, else any (so you can still grab a corpse)
    var hit = null;
    combatants.forEach(function (c) {
      if (c.x === col && c.y === row) { if (!hit || (!c.dead && hit.dead)) hit = c; }
    });
    return hit;
  }

  /* ---- Pointer interaction ---- */
  function evPos(ev) {
    var rect = CV.getBoundingClientRect();
    var sx = CV.width / rect.width, sy = CV.height / rect.height;
    return { x: (ev.clientX - rect.left) * sx, y: (ev.clientY - rect.top) * sy };
  }

  function paintAt(cell) {
    if (!cell) return;
    var key = cell.col + ',' + cell.row;
    if (key === lastPaintKey) return;
    lastPaintKey = key;
    if (tool === 'erase') delete map.terrain[key];
    else map.terrain[key] = paintTerrain;
    render();
  }

  function onDown(ev) {
    if (locked || !CTX) return;
    var m = metrics();
    var p = evPos(ev);
    var cell = pixelToCell(p.x, p.y, m);
    if (!cell) return;

    if (tool === 'paint' || tool === 'erase') {
      lastPaintKey = null;
      painting = true;
      paintAt(cell);
      try { CV.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ }
      return;
    }

    // select tool: grab a token if one is here
    var c = tokenAt(cell.col, cell.row);
    if (c) {
      selectedId = c.id;
      if (cb.onSelect) cb.onSelect(c.id);
      drag = { id: c.id, fromCol: c.x, fromRow: c.y, px: p.x, py: p.y, col: cell.col, row: cell.row };
      try { CV.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      showDistance(0);
      render();
    } else {
      selectedId = null;
      if (cb.onSelect) cb.onSelect(null);
      render();
    }
  }

  function onMove(ev) {
    if (!CTX) return;
    var m = metrics();
    var p = evPos(ev);
    if (painting) { paintAt(pixelToCell(p.x, p.y, m)); return; }
    if (!drag) return;
    drag.px = p.x; drag.py = p.y;
    var cell = pixelToCell(p.x, p.y, m);
    if (cell) {
      drag.col = cell.col; drag.row = cell.row;
      showDistance(cellDistance({ col: drag.fromCol, row: drag.fromRow }, cell));
    }
    render();
  }

  function onUp(ev) {
    if (painting) {
      painting = false; lastPaintKey = null;
      if (cb.onChange) cb.onChange();
      return;
    }
    if (!drag) return;
    var d = findCombatant(drag.id);
    var moved = false;
    if (d && inBounds(drag.col, drag.row) && (d.x !== drag.col || d.y !== drag.row)) {
      d.x = drag.col; d.y = drag.row; moved = true;
    }
    drag = null;
    showDistance(null);
    render();
    if (moved && cb.onMove) cb.onMove(d.id, d.x, d.y);
  }

  function showDistance(cells) {
    if (!distEl) return;
    if (cells == null) { distEl.textContent = ''; return; }
    distEl.textContent = cells + (cells === 1 ? ' cell' : ' cells') + ' · ' + (cells * 5) + ' ft';
  }

  /* ---- Background image (downscaled to keep the snapshot small) ---- */
  function loadBg() {
    if (!map.bg) { bgImage = null; return; }
    bgImage = new Image();
    bgImage.onload = render;
    bgImage.src = map.bg;
  }

  function setBackgroundFromFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1600;
        var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        var off = document.createElement('canvas');
        off.width = w; off.height = h;
        off.getContext('2d').drawImage(img, 0, 0, w, h);
        try { map.bg = off.toDataURL('image/jpeg', 0.72); }
        catch (e) { map.bg = reader.result; }   // tainted/edge case: keep original
        loadBg();
        render();
        if (cb.onChange) cb.onChange();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ---- Public API ---- */
  window.Battlemap = {
    TERRAIN: TERRAIN,
    TERRAIN_ORDER: TERRAIN_ORDER,

    init: function (opts) {
      opts = opts || {};
      CV = opts.canvas;
      wrap = opts.wrap || (CV && CV.parentNode);
      distEl = opts.distanceEl || null;
      cb = {
        onMove: opts.onMove || null,
        onSelect: opts.onSelect || null,
        onChange: opts.onChange || null
      };
      if (!CV || !CV.getContext) return false;
      CTX = CV.getContext('2d');
      CV.addEventListener('pointerdown', onDown);
      CV.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(render, 120);
      });
      render();
      return true;
    },

    // Point the map at the live combatant array; places any newcomers.
    setCombatants: function (list) {
      combatants = list || [];
      if (CTX) { ensurePlacement(); render(); }
    },

    setSelected: function (id) { selectedId = (id == null ? null : id); render(); },
    setLocked: function (v) { locked = !!v; },
    setTool: function (t) { tool = t; },
    setTerrain: function (t) { paintTerrain = t; },

    setGrid: function (type, cols, rows) {
      if (type === 'square' || type === 'hex') map.grid = type;
      if (cols) map.cols = Math.max(4, Math.min(60, cols | 0));
      if (rows) map.rows = Math.max(4, Math.min(60, rows | 0));
      ensurePlacement();
      render();
      if (cb.onChange) cb.onChange();
    },

    clearTerrain: function () {
      map.terrain = {};
      render();
      if (cb.onChange) cb.onChange();
    },

    setBackgroundFromFile: setBackgroundFromFile,
    clearBackground: function () {
      map.bg = null; bgImage = null; render();
      if (cb.onChange) cb.onChange();
    },
    hasBackground: function () { return !!map.bg; },

    // Snapshot hooks used by play.js (ride the same session save).
    getMap: function () {
      var terrain = {};
      for (var k in map.terrain) if (map.terrain.hasOwnProperty(k)) terrain[k] = map.terrain[k];
      return { v: 1, grid: map.grid, cols: map.cols, rows: map.rows, terrain: terrain, bg: map.bg || null };
    },
    setMap: function (data) {
      map = data ? {
        v: 1,
        grid: (data.grid === 'hex' ? 'hex' : 'square'),
        cols: Math.max(4, Math.min(60, (data.cols | 0) || 16)),
        rows: Math.max(4, Math.min(60, (data.rows | 0) || 12)),
        terrain: data.terrain || {},
        bg: data.bg || null
      } : defaultMap();
      loadBg();
      if (CTX) { ensurePlacement(); render(); }
    },

    grid: function () { return map.grid; },
    size: function () { return { cols: map.cols, rows: map.rows }; },
    render: render
  };
})();
