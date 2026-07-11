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

  /* ---- Terrain palette (drawn under the grid) ----
     `base` fills the cell; a per-type texture is drawn on top (see
     drawTerrainCell). `swatch` is the legend dot. Old keys are kept so
     previously-saved maps still render. */
  var TERRAIN = {
    wall:       { label: 'Stone wall', base: '#4b5162', swatch: '#6b7280' },
    water:      { label: 'Water',      base: 'rgba(38,110,170,.55)', swatch: '#2980b9' },
    rapids:     { label: 'Rapids',     base: 'rgba(52,140,200,.55)', swatch: '#5dade2' },
    grass:      { label: 'Grass',      base: 'rgba(46,120,58,.42)',  swatch: '#27ae60' },
    wood:       { label: 'Wood / bridge', base: 'rgba(120,78,42,.6)', swatch: '#8a5a2b' },
    briars:     { label: 'Briars',     base: 'rgba(34,78,40,.6)',    swatch: '#1e6b3a' },
    stalagmite: { label: 'Stalagmites', base: 'rgba(90,96,110,.5)',  swatch: '#9aa0ad' },
    steps:      { label: 'Steps',      base: 'rgba(120,104,70,.45)', swatch: '#b8a06a' },
    road:       { label: 'Road / path', base: 'rgba(154,122,74,.5)', swatch: '#b8946a' },
    difficult:  { label: 'Rubble',     base: 'rgba(140,112,72,.4)',  swatch: '#a1866a' },
    lava:       { label: 'Lava',       base: 'rgba(150,40,26,.6)',   swatch: '#e25822' }
  };
  var TERRAIN_ORDER = ['wall', 'water', 'rapids', 'grass', 'wood',
    'briars', 'stalagmite', 'steps', 'road', 'difficult', 'lava'];

  var KIND_COLOR = { monster: '#c0392b', npc: '#9b59b6', player: '#4aa3df' };

  function defaultMap() {
    return { v: 1, grid: 'square', cols: 16, rows: 12, terrain: {}, areas: [], starts: null, bg: null,
      fog: false, revealed: {} };
  }

  // Copy a { players:[], monsters:[], npcs:[] } start-zone spec (cells only).
  function copyStarts(s) {
    if (!s) return null;
    function cells(a) { return (a || []).map(function (p) { return { x: p.x, y: p.y }; }); }
    var out = { players: cells(s.players), monsters: cells(s.monsters), npcs: cells(s.npcs) };
    if (!out.players.length && !out.monsters.length && !out.npcs.length) return null;
    return out;
  }

  /* ---- Module state ---- */
  var CV = null, CTX = null, wrap = null, distEl = null;
  var cb = {};                 // { onMove, onSelect, onChange }
  var combatants = [];         // live array from play.js (read x/y off each)
  var map = defaultMap();
  var bgImage = null;          // Image built from map.bg
  var tool = 'select';         // 'select' | 'paint' | 'erase' | 'area'
  var paintTerrain = 'wall';
  var selectedArea = null;     // area object currently being edited (design)
  var areaEditorEl = null;     // inline area editor built by buildToolbar
  var legendEl = null;         // HTML legend element (created lazily)
  // Interaction mode:
  //   'design' — full editing (Encounter Planner / Adventure editor)
  //   'play'   — move/add tokens only, no map editing (Game Session)
  //   'view'   — read-only (shared-session viewers)
  var mode = 'design';
  var toolbarEl = null;        // container built by buildToolbar(), if any
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

  // Deterministic 0..1 from a cell + salt, so textures don't flicker between
  // renders (same cell always draws the same speckles).
  function rand(col, row, salt) {
    var h = ((col + 1) * 73856093) ^ ((row + 1) * 19349663) ^ ((salt + 1) * 83492791);
    h = (h ^ (h >>> 13)) >>> 0;
    h = (h * 1274126177) >>> 0;
    return (h >>> 0) / 4294967296;
  }

  // A warm dark-parchment floor under everything (unless a bg image is set),
  // with faint grain so open ground reads as a map, not a black void.
  function drawFloor(m) {
    CTX.fillStyle = '#211c15';
    CTX.fillRect(0, 0, CV.width, CV.height);
    CTX.fillStyle = 'rgba(120,104,74,.05)';
    var step = Math.max(10, Math.round((m.cell || m.size || 24) / 2));
    for (var y = 0; y < CV.height; y += step) {
      for (var x = 0; x < CV.width; x += step) {
        if (rand(x, y, 7) > 0.6) CTX.fillRect(x + (rand(x, y, 1) * step | 0), y + (rand(x, y, 2) * step | 0), 2, 2);
      }
    }
  }

  // Draw one square cell's terrain texture within (x,y,w,h).
  function drawTerrainCell(type, col, row, x, y, w, h) {
    var t = TERRAIN[type];
    if (!t) return;
    CTX.save();
    CTX.beginPath(); CTX.rect(x, y, w, h); CTX.clip();
    CTX.fillStyle = t.base;
    CTX.fillRect(x, y, w, h);
    var i, n, rx, ry;
    if (type === 'water' || type === 'rapids') {
      CTX.strokeStyle = type === 'rapids' ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.18)';
      CTX.lineWidth = type === 'rapids' ? 1.5 : 1;
      for (i = 0; i < 3; i++) {
        var wy = y + h * (0.25 + i * 0.28) + rand(col, row, i) * 4;
        CTX.beginPath();
        CTX.moveTo(x + 2, wy);
        CTX.bezierCurveTo(x + w * 0.33, wy - 3, x + w * 0.66, wy + 3, x + w - 2, wy);
        CTX.stroke();
      }
    } else if (type === 'wall') {
      CTX.fillStyle = 'rgba(0,0,0,.28)';
      CTX.fillRect(x, y, w, h);
      CTX.fillStyle = 'rgba(150,158,175,.5)';
      CTX.strokeStyle = 'rgba(20,22,28,.9)'; CTX.lineWidth = 1;
      var bh = h / 2;
      for (var br = 0; br < 2; br++) {
        var off = (br % 2) ? w * 0.25 : -w * 0.25;
        for (var bx = -1; bx < 2; bx++) {
          var rxx = x + bx * (w / 2) + off;
          CTX.fillRect(rxx + 1, y + br * bh + 1, w / 2 - 2, bh - 2);
          CTX.strokeRect(rxx + 1, y + br * bh + 1, w / 2 - 2, bh - 2);
        }
      }
    } else if (type === 'wood') {
      CTX.strokeStyle = 'rgba(60,38,18,.7)'; CTX.lineWidth = 1;
      for (i = 1; i < 4; i++) {
        CTX.beginPath(); CTX.moveTo(x, y + h * i / 4); CTX.lineTo(x + w, y + h * i / 4); CTX.stroke();
      }
      CTX.strokeStyle = 'rgba(60,38,18,.35)';
      CTX.beginPath(); CTX.moveTo(x + w / 2, y); CTX.lineTo(x + w / 2, y + h); CTX.stroke();
    } else if (type === 'grass') {
      CTX.strokeStyle = 'rgba(120,190,120,.5)'; CTX.lineWidth = 1;
      for (i = 0; i < 6; i++) {
        rx = x + rand(col, row, i) * w; ry = y + h - rand(col, row, i + 10) * (h * 0.4);
        CTX.beginPath(); CTX.moveTo(rx, ry); CTX.lineTo(rx - 1.5, ry - 4); CTX.stroke();
        CTX.beginPath(); CTX.moveTo(rx, ry); CTX.lineTo(rx + 1.5, ry - 4); CTX.stroke();
      }
    } else if (type === 'briars') {
      CTX.strokeStyle = 'rgba(30,60,32,.85)'; CTX.lineWidth = 1;
      for (i = 0; i < 5; i++) {
        rx = x + rand(col, row, i) * w; ry = y + rand(col, row, i + 5) * h;
        CTX.beginPath();
        CTX.moveTo(rx - 3, ry - 3); CTX.lineTo(rx + 3, ry + 3);
        CTX.moveTo(rx + 3, ry - 3); CTX.lineTo(rx - 3, ry + 3);
        CTX.stroke();
      }
    } else if (type === 'stalagmite') {
      CTX.fillStyle = 'rgba(160,166,180,.7)';
      CTX.strokeStyle = 'rgba(20,22,28,.7)'; CTX.lineWidth = 1;
      for (i = 0; i < 3; i++) {
        rx = x + (0.25 + rand(col, row, i) * 0.5) * w;
        ry = y + (0.35 + rand(col, row, i + 4) * 0.5) * h;
        var s = 3 + rand(col, row, i + 8) * 3;
        CTX.beginPath();
        CTX.moveTo(rx, ry - s); CTX.lineTo(rx - s * 0.7, ry + s); CTX.lineTo(rx + s * 0.7, ry + s);
        CTX.closePath(); CTX.fill(); CTX.stroke();
      }
    } else if (type === 'steps') {
      CTX.strokeStyle = 'rgba(40,34,22,.7)'; CTX.lineWidth = 1.5;
      for (i = 1; i < 5; i++) {
        CTX.beginPath(); CTX.moveTo(x, y + h * i / 5); CTX.lineTo(x + w, y + h * i / 5); CTX.stroke();
      }
    } else if (type === 'road') {
      // Dirt path: faint wheel-ruts + a few pebbles.
      CTX.strokeStyle = 'rgba(90,70,40,.4)'; CTX.lineWidth = 1;
      CTX.beginPath(); CTX.moveTo(x + w * 0.34, y); CTX.lineTo(x + w * 0.34, y + h);
      CTX.moveTo(x + w * 0.66, y); CTX.lineTo(x + w * 0.66, y + h); CTX.stroke();
      CTX.fillStyle = 'rgba(70,54,30,.5)';
      for (i = 0; i < 4; i++) {
        rx = x + rand(col, row, i) * w; ry = y + rand(col, row, i + 2) * h;
        CTX.beginPath(); CTX.arc(rx, ry, 1.2, 0, Math.PI * 2); CTX.fill();
      }
    } else if (type === 'lava') {
      CTX.strokeStyle = 'rgba(255,180,60,.75)'; CTX.lineWidth = 1.5;
      for (i = 0; i < 3; i++) {
        var ly = y + h * (0.3 + i * 0.3);
        CTX.beginPath();
        CTX.moveTo(x, ly); CTX.bezierCurveTo(x + w * 0.4, ly + 4, x + w * 0.6, ly - 4, x + w, ly);
        CTX.stroke();
      }
    } else { // difficult / rubble and any unknown extra
      CTX.fillStyle = 'rgba(90,72,44,.75)';
      for (i = 0; i < 7; i++) {
        rx = x + rand(col, row, i) * w; ry = y + rand(col, row, i + 3) * h;
        n = 1 + rand(col, row, i + 6) * 2;
        CTX.beginPath(); CTX.arc(rx, ry, n, 0, Math.PI * 2); CTX.fill();
      }
    }
    CTX.restore();
  }

  function drawTerrain(m) {
    for (var key in map.terrain) {
      if (!map.terrain.hasOwnProperty(key)) continue;
      var type = map.terrain[key];
      var t = TERRAIN[type];
      if (!t) continue;
      var parts = key.split(',');
      var col = +parts[0], row = +parts[1];
      if (!inBounds(col, row)) continue;
      if (m.grid === 'hex') {
        CTX.fillStyle = t.base;
        fillCellShape(col, row, m);
      } else {
        drawTerrainCell(type, col, row, col * m.cell, row * m.cell, m.cell, m.cell);
      }
    }
  }

  // Numbered encounter-area pins (like the LMoP maps): a ringed circle with
  // the area number, drawn on top of the map.
  function drawAreas(m) {
    var list = map.areas || [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a.x == null || a.y == null || !inBounds(a.x, a.y)) continue;
      var c = cellCenter(a.x, a.y, m);
      var r = (m.grid === 'hex' ? m.size : m.cell) * 0.34;
      r = Math.max(10, r);
      var sel = (selectedArea && selectedArea === a);
      CTX.save();
      CTX.beginPath(); CTX.arc(c.x, c.y, r, 0, Math.PI * 2);
      CTX.fillStyle = 'rgba(245,238,220,.95)';
      CTX.fill();
      CTX.lineWidth = sel ? 3 : 2;
      CTX.strokeStyle = sel ? '#e1b12c' : '#7a2318';
      CTX.stroke();
      CTX.fillStyle = '#7a2318';
      CTX.font = 'bold ' + Math.round(r * 1.05) + 'px "Open Sans", sans-serif';
      CTX.textAlign = 'center'; CTX.textBaseline = 'middle';
      CTX.fillText(String(a.n), c.x, c.y + 0.5);
      CTX.restore();
    }
  }

  function drawGrid(m) {
    CTX.strokeStyle = 'rgba(226,210,168,.16)';
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
      drawFloor(m);
    }
    drawTerrain(m);
    drawGrid(m);
    drawFog(m);        // fog over unrevealed cells (opaque for players, tint for DM)
    drawAreas(m);      // revealed areas + tokens ride above the fog
    drawTokens(m);
  }

  // Fog of war: paint every cell the players have not yet discovered.
  // In 'view' mode (the player client) fog is opaque — the terrain and
  // background under it were never sent anyway (see visibility.js). In
  // 'design'/'play' (the DM at the table) it's a light tint so the DM
  // sees the whole map but knows what remains hidden.
  function drawFog(m) {
    if (!map.fog) return;
    var occlude = (mode === 'view');
    var revealed = map.revealed || {};
    CTX.save();
    CTX.fillStyle = occlude ? 'rgba(8,9,12,0.98)' : 'rgba(8,9,12,0.42)';
    for (var row = 0; row < map.rows; row++) {
      for (var col = 0; col < map.cols; col++) {
        if (revealed[col + ',' + row]) continue;
        if (m.grid === 'hex') fillCellShape(col, row, m);
        else CTX.fillRect(col * m.cell, row * m.cell, m.cell, m.cell);
      }
    }
    CTX.restore();
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

  // Nearest free (non-wall, in-bounds, unoccupied) cell, searching outward in
  // square rings from an anchor — so tokens cluster near their start zone
  // without stacking on one cell.
  function ringFree(cx, cy, used) {
    var maxR = map.cols + map.rows, r, dx, dy, c, rr;
    for (r = 0; r <= maxR; r++) {
      for (dy = -r; dy <= r; dy++) {
        for (dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // ring edge only
          c = cx + dx; rr = cy + dy;
          if (!inBounds(c, rr) || isWall(c, rr) || occupied(used, c, rr)) continue;
          return { col: c, row: rr };
        }
      }
    }
    return firstFree(used);
  }

  // Which start cells apply to a combatant kind (map.starts.players/monsters/
  // npcs), or a sensible default zone: players near the bottom (the approach /
  // doorway), monsters/NPCs near the top.
  function startList(kind) {
    var s = map.starts || {};
    if (kind === 'player') return s.players || null;
    if (kind === 'npc' && s.npcs && s.npcs.length) return s.npcs;
    return s.monsters || null;
  }
  function defaultAnchor(kind) {
    var cx = Math.floor(map.cols / 2);
    return kind === 'player' ? { x: cx, y: map.rows - 2 } : { x: cx, y: 1 };
  }

  // Give every unplaced combatant a home from its kind's start zone (clamping
  // any that fell outside a resized grid). Persists via onMove so positions
  // survive a reload. Players and monsters spawn apart, not in one corner.
  function ensurePlacement() {
    var used = {};
    combatants.forEach(function (c) {
      if (c.x != null && c.y != null && inBounds(c.x, c.y)) used[c.x + ',' + c.y] = true;
    });
    var idx = {};   // next unused index into each kind's start list
    combatants.forEach(function (c) {
      var moved = false;
      if (c.x == null || c.y == null) {
        var list = startList(c.kind), spot = null;
        if (list && list.length) {
          var key = (c.kind === 'player') ? 'player' : (list === (map.starts || {}).npcs ? 'npc' : 'monster');
          var i = idx[key] || 0;
          while (i < list.length && occupied(used, list[i].x, list[i].y)) i++;
          if (i < list.length) { spot = { col: list[i].x, row: list[i].y }; idx[key] = i + 1; }
          else { var last = list[list.length - 1]; spot = ringFree(last.x, last.y, used); }
        } else {
          var a = defaultAnchor(c.kind);
          spot = ringFree(a.x, a.y, used);
        }
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

  /* ---- Numbered areas ---- */
  function areaAt(col, row) {
    var list = map.areas || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].x === col && list[i].y === row) return list[i];
    }
    return null;
  }
  function nextAreaNumber() {
    var max = 0, list = map.areas || [];
    for (var i = 0; i < list.length; i++) if (list[i].n > max) max = list[i].n;
    return max + 1;
  }
  function addArea(col, row) {
    if (!map.areas) map.areas = [];
    var a = { n: nextAreaNumber(), x: col, y: row, title: '', read: '', dm: '' };
    map.areas.push(a);
    selectArea(a);
    render();
    if (cb.onChange) cb.onChange();
  }
  function removeArea(a) {
    map.areas = (map.areas || []).filter(function (x) { return x !== a; });
    // renumber so pins stay 1..n
    map.areas.forEach(function (x, i) { x.n = i + 1; });
    if (selectedArea === a) selectArea(null);
    render();
    if (cb.onChange) cb.onChange();
  }
  function selectArea(a) {
    selectedArea = a || null;
    if (mode === 'design') updateAreaEditor();
    if (cb.onAreaSelect) cb.onAreaSelect(a || null);
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
    renderLegend();
  }

  function onDown(ev) {
    if (mode === 'view' || !CTX) return;
    var m = metrics();
    var p = evPos(ev);
    var cell = pixelToCell(p.x, p.y, m);
    if (!cell) return;

    if ((tool === 'paint' || tool === 'erase') && mode === 'design') {
      lastPaintKey = null;
      painting = true;
      paintAt(cell);
      try { CV.setPointerCapture(ev.pointerId); } catch (e) { /* older browsers */ }
      return;
    }

    if (tool === 'area' && mode === 'design') {
      var existing = areaAt(cell.col, cell.row);
      if (existing) selectArea(existing); else addArea(cell.col, cell.row);
      return;
    }

    // select tool: grab a token if one is here
    var c = tokenAt(cell.col, cell.row);
    if (c) {
      selectedId = c.id;
      selectArea(null);
      if (cb.onSelect) cb.onSelect(c.id);
      drag = { id: c.id, fromCol: c.x, fromRow: c.y, px: p.x, py: p.y, col: cell.col, row: cell.row };
      try { CV.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      showDistance(0);
      render();
      return;
    }
    // no token — maybe an area pin (tap to read it, in any mode)
    var area = areaAt(cell.col, cell.row);
    if (area) { selectArea(area); render(); return; }
    selectedId = null;
    selectArea(null);
    if (cb.onSelect) cb.onSelect(null);
    render();
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
        syncToolbar();
        if (cb.onChange) cb.onChange();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ---- Editing toolbar (design mode) ---- */
  function setTool(name) {
    tool = (name === 'paint' || name === 'erase' || name === 'area') ? name : 'select';
    if (!toolbarEl) return;
    var btns = toolbarEl.querySelectorAll('.bm-tool');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('bm-tool--active', btns[i].getAttribute('data-tool') === tool);
    }
  }

  // Keep the toolbar controls in step with the current map (after setMap etc).
  function syncToolbar() {
    if (!toolbarEl) return;
    var gridSel = toolbarEl.querySelector('.bm-grid');
    var cols = toolbarEl.querySelector('.bm-cols');
    var rows = toolbarEl.querySelector('.bm-rows');
    var bgClear = toolbarEl.querySelector('.bm-bg-clear');
    if (gridSel) gridSel.value = map.grid;
    if (cols) cols.value = map.cols;
    if (rows) rows.value = map.rows;
    if (bgClear) bgClear.hidden = !map.bg;
  }

  function buildToolbar(container) {
    if (!container) return;
    toolbarEl = container;
    var swatches = TERRAIN_ORDER.map(function (key) {
      var t = TERRAIN[key];
      return '<button class="bm-swatch" data-terrain="' + key + '" title="' + t.label + '">' +
        '<span class="bm-swatch__dot" style="background:' + t.swatch + '"></span>' + t.label + '</button>';
    }).join('');
    container.innerHTML =
      '<div class="bm-group">' +
        '<button class="bm-tool bm-tool--active" data-tool="select" title="Move &amp; select tokens">✥ Move</button>' +
        '<button class="bm-tool" data-tool="paint" title="Paint terrain">🖌 Paint</button>' +
        '<button class="bm-tool" data-tool="erase" title="Erase terrain">⌫ Erase</button>' +
        '<button class="bm-tool" data-tool="area" title="Place a numbered area with DM notes">① Area</button>' +
      '</div>' +
      '<div class="bm-group bm-terrain">' + swatches + '</div>' +
      '<div class="bm-group">' +
        '<label class="bm-lbl">Grid <select class="bm-select bm-grid" title="Square battle grid or hex overland grid">' +
          '<option value="square">Square</option><option value="hex">Hex</option></select></label>' +
        '<label class="bm-lbl">Cols <input type="number" class="bm-num bm-cols" min="4" max="60"></label>' +
        '<label class="bm-lbl">Rows <input type="number" class="bm-num bm-rows" min="4" max="60"></label>' +
      '</div>' +
      '<div class="bm-group">' +
        '<label class="bm-file" title="Use a battlemap image under the grid">🖼 Background' +
          '<input type="file" accept="image/*" class="bm-bg" hidden></label>' +
        '<button class="bm-btn bm-bg-clear" hidden>Clear image</button>' +
        '<button class="bm-btn bm-terrain-clear">Clear terrain</button>' +
      '</div>' +
      '<div class="bm-area-editor" hidden>' +
        '<div class="bm-area-editor__head"><span class="bm-area-editor__title">Area</span>' +
          '<button class="bm-btn bm-area-del" type="button">Delete area</button></div>' +
        '<input type="text" class="bm-area-title" placeholder="Area title (e.g. “Cave Mouth”)">' +
        '<textarea class="bm-area-read" rows="2" placeholder="Read-aloud text (players hear this)…"></textarea>' +
        '<textarea class="bm-area-dm" rows="2" placeholder="DM notes (secret: traps, DCs, tactics)…"></textarea>' +
      '</div>';

    areaEditorEl = container.querySelector('.bm-area-editor');
    areaEditorEl.querySelector('.bm-area-title').addEventListener('input', onAreaFieldInput);
    areaEditorEl.querySelector('.bm-area-read').addEventListener('input', onAreaFieldInput);
    areaEditorEl.querySelector('.bm-area-dm').addEventListener('input', onAreaFieldInput);
    areaEditorEl.querySelector('.bm-area-del').addEventListener('click', function () {
      if (selectedArea) removeArea(selectedArea);
    });

    var terrainBar = container.querySelector('.bm-terrain');
    container.addEventListener('click', function (ev) {
      var toolBtn = ev.target.closest('.bm-tool');
      if (toolBtn) { setTool(toolBtn.getAttribute('data-tool')); return; }
      var sw = ev.target.closest('.bm-swatch');
      if (sw) {
        paintTerrain = sw.getAttribute('data-terrain');
        setTool('paint');
        var all = terrainBar.querySelectorAll('.bm-swatch');
        for (var i = 0; i < all.length; i++) all[i].classList.toggle('bm-swatch--active', all[i] === sw);
        return;
      }
      if (ev.target.closest('.bm-terrain-clear')) { window.Battlemap.clearTerrain(); return; }
      if (ev.target.closest('.bm-bg-clear')) { window.Battlemap.clearBackground(); }
    });

    var gridSel = container.querySelector('.bm-grid');
    var colsInput = container.querySelector('.bm-cols');
    var rowsInput = container.querySelector('.bm-rows');
    function applyGrid() {
      window.Battlemap.setGrid(gridSel.value, parseInt(colsInput.value, 10), parseInt(rowsInput.value, 10));
    }
    gridSel.addEventListener('change', applyGrid);
    colsInput.addEventListener('change', applyGrid);
    rowsInput.addEventListener('change', applyGrid);

    var bgInput = container.querySelector('.bm-bg');
    bgInput.addEventListener('change', function () {
      if (bgInput.files && bgInput.files[0]) setBackgroundFromFile(bgInput.files[0]);
      bgInput.value = '';
    });

    // Highlight the default terrain swatch and reflect current state.
    var first = terrainBar.querySelector('.bm-swatch[data-terrain="' + paintTerrain + '"]');
    if (first) first.classList.add('bm-swatch--active');
    syncToolbar();
    updateAreaEditor();
  }

  function onAreaFieldInput() {
    if (!selectedArea || !areaEditorEl) return;
    selectedArea.title = areaEditorEl.querySelector('.bm-area-title').value;
    selectedArea.read = areaEditorEl.querySelector('.bm-area-read').value;
    selectedArea.dm = areaEditorEl.querySelector('.bm-area-dm').value;
    if (cb.onChange) cb.onChange();
  }

  // Show/fill the inline area editor for the selected pin (design mode only).
  function updateAreaEditor() {
    if (!areaEditorEl) return;
    if (mode !== 'design' || !selectedArea) { areaEditorEl.hidden = true; return; }
    areaEditorEl.hidden = false;
    areaEditorEl.querySelector('.bm-area-editor__title').textContent = 'Area ' + selectedArea.n;
    areaEditorEl.querySelector('.bm-area-title').value = selectedArea.title || '';
    areaEditorEl.querySelector('.bm-area-read').value = selectedArea.read || '';
    areaEditorEl.querySelector('.bm-area-dm').value = selectedArea.dm || '';
  }

  /* ---- Legend (tegnforklaring): shows terrain types present on the map ---- */
  function renderLegend() {
    if (!legendEl) {
      if (!wrap || !wrap.parentNode) return;
      legendEl = document.createElement('div');
      legendEl.className = 'bm-legend';
      wrap.parentNode.insertBefore(legendEl, wrap.nextSibling);
    }
    var present = {}, k;
    for (k in map.terrain) if (map.terrain.hasOwnProperty(k)) present[map.terrain[k]] = true;
    var items = TERRAIN_ORDER.filter(function (t) { return present[t]; }).map(function (t) {
      return '<span class="bm-legend__item"><span class="bm-legend__dot" style="background:' +
        TERRAIN[t].swatch + '"></span>' + TERRAIN[t].label + '</span>';
    });
    var nAreas = (map.areas || []).length;
    if (nAreas) items.push('<span class="bm-legend__item"><span class="bm-legend__dot bm-legend__dot--area">①</span>' +
      nAreas + ' area' + (nAreas === 1 ? '' : 's') + '</span>');
    legendEl.innerHTML = items.length
      ? '<span class="bm-legend__label">Legend</span>' + items.join('')
      : '';
    legendEl.hidden = !items.length;
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
        onChange: opts.onChange || null,
        onAreaSelect: opts.onAreaSelect || null
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
      renderLegend();
      return true;
    },

    // Point the map at the live combatant array; places any newcomers.
    setCombatants: function (list) {
      combatants = list || [];
      if (CTX) { ensurePlacement(); render(); }
    },

    setSelected: function (id) { selectedId = (id == null ? null : id); render(); },
    setMode: function (m) {
      mode = (m === 'play' || m === 'view') ? m : 'design';
      if (toolbarEl) toolbarEl.hidden = (mode !== 'design');
    },
    mode: function () { return mode; },
    setTool: setTool,
    setTerrain: function (t) { paintTerrain = t; },

    setGrid: function (type, cols, rows) {
      if (type === 'square' || type === 'hex') map.grid = type;
      if (cols) map.cols = Math.max(4, Math.min(60, cols | 0));
      if (rows) map.rows = Math.max(4, Math.min(60, rows | 0));
      ensurePlacement();
      render();
      syncToolbar();
      if (cb.onChange) cb.onChange();
    },

    clearTerrain: function () {
      map.terrain = {};
      render();
      renderLegend();
      if (cb.onChange) cb.onChange();
    },

    setBackgroundFromFile: setBackgroundFromFile,
    clearBackground: function () {
      map.bg = null; bgImage = null; render();
      syncToolbar();
      if (cb.onChange) cb.onChange();
    },
    hasBackground: function () { return !!map.bg; },

    // Build the editing toolbar into a container and wire it to this module.
    // Used by the Encounter Planner and the Adventure editor (design mode);
    // the Game Session doesn't call it (play mode = move tokens only).
    buildToolbar: function (container) { buildToolbar(container); },

    // Snapshot hooks used by play.js (ride the same session save).
    getMap: function () {
      var terrain = {};
      for (var k in map.terrain) if (map.terrain.hasOwnProperty(k)) terrain[k] = map.terrain[k];
      var revealed = {};
      for (var rk in (map.revealed || {})) if (map.revealed.hasOwnProperty(rk)) revealed[rk] = 1;
      var areas = (map.areas || []).map(function (a) {
        return { n: a.n, x: a.x, y: a.y, title: a.title || '', read: a.read || '', dm: a.dm || '',
          hidden: !!a.hidden, revealed: !!a.revealed };
      });
      return { v: 1, grid: map.grid, cols: map.cols, rows: map.rows, terrain: terrain, areas: areas,
        starts: copyStarts(map.starts), bg: map.bg || null, fog: !!map.fog, revealed: revealed };
    },
    setMap: function (data) {
      map = data ? {
        v: 1,
        grid: (data.grid === 'hex' ? 'hex' : 'square'),
        cols: Math.max(4, Math.min(60, (data.cols | 0) || 16)),
        rows: Math.max(4, Math.min(60, (data.rows | 0) || 12)),
        terrain: data.terrain || {},
        areas: (data.areas || []).map(function (a) {
          return { n: a.n, x: a.x, y: a.y, title: a.title || '', read: a.read || '', dm: a.dm || '',
            hidden: !!a.hidden, revealed: !!a.revealed };
        }),
        starts: copyStarts(data.starts),
        bg: data.bg || null,
        fog: !!data.fog,
        revealed: data.revealed || {}
      } : defaultMap();
      selectedArea = null;
      loadBg();
      syncToolbar();
      updateAreaEditor();
      renderLegend();
      if (CTX) { ensurePlacement(); render(); }
    },

    // Areas for the AI DM context (read-aloud + secret DM notes per number).
    getAreas: function () { return (map.areas || []).slice(); },
    selectedArea: function () { return selectedArea; },

    /* ---- Fog of war / progressive reveal (DM controls) ----
       The DM reveals parts of the map; visibility.js strips everything
       still hidden before the player projection is synced. */
    setFog: function (on) { map.fog = !!on; render(); if (cb.onChange) cb.onChange(); },
    isFog: function () { return !!map.fog; },
    isRevealed: function (col, row) { return !!(map.revealed && map.revealed[col + ',' + row]); },
    revealCell: function (col, row) {
      if (!inBounds(col, row)) return;
      if (!map.revealed) map.revealed = {};
      map.revealed[col + ',' + row] = 1;
      render(); if (cb.onChange) cb.onChange();
    },
    // Reveal a cell and its neighbourhood (radius in cells; default 1).
    revealAround: function (col, row, radius) {
      radius = (radius == null ? 1 : radius | 0);
      if (!map.revealed) map.revealed = {};
      for (var dr = -radius; dr <= radius; dr++) {
        for (var dc = -radius; dc <= radius; dc++) {
          var cc = col + dc, rr = row + dr;
          if (inBounds(cc, rr)) map.revealed[cc + ',' + rr] = 1;
        }
      }
      render(); if (cb.onChange) cb.onChange();
    },
    revealAll: function () {
      if (!map.revealed) map.revealed = {};
      for (var row = 0; row < map.rows; row++) {
        for (var col = 0; col < map.cols; col++) map.revealed[col + ',' + row] = 1;
      }
      render(); if (cb.onChange) cb.onChange();
    },
    clearRevealed: function () { map.revealed = {}; render(); if (cb.onChange) cb.onChange(); },
    // Mark a numbered area revealed (shown to players) — or hide it again.
    revealArea: function (n, on) {
      (map.areas || []).forEach(function (a) { if (a.n === n) a.revealed = (on !== false); });
      render(); if (cb.onChange) cb.onChange();
    },

    grid: function () { return map.grid; },
    size: function () { return { cols: map.cols, rows: map.rows }; },
    render: render, renderLegend: renderLegend
  };
})();
