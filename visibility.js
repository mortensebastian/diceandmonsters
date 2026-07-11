/* ============================================================
   Dice & Monsters — Role-based visibility (shared core)
   ------------------------------------------------------------
   The single source of truth for "who is allowed to see what".

   FUNDAMENTAL ARCHITECTURE RULE (see CLAUDE.md):
     Hidden information must never be *sent* to a player client and
     then merely hidden in the UI. It must not leave the DM's seat
     at all. This module is where that rule is enforced: it takes a
     full DM snapshot and returns a role-scoped snapshot that
     physically omits everything the role may not know.

   Pure: no DOM, no network. Both the DM console (which computes the
   player projection before syncing it) and any local preview use it.

   Roles:
     - 'dm'      → the full snapshot (human DM / AI DM see everything).
     - 'player'  → only revealed combatants, revealed & unlocked map
                   areas (no secret DM notes), the fog-limited map,
                   the player's own character in full, and DM
                   narration. No hidden monsters, traps, secret rooms,
                   DM notes, monster statistics, AI tool state, or the
                   raw mechanical combat log.

   Snapshot shape (from play.js snapshot()):
     { v, combatants[], activeId, log[], scene, chatLog[], aiMessages, map }
   ============================================================ */
(function () {
  'use strict';

  /* ---- Coarse HP banding: a player may see that a revealed monster
     is bloodied, never its HP total or AC/attacks. ---- */
  function band(hp, maxHp, dead) {
    if (dead) return 'down';
    if (hp == null || maxHp == null || maxHp <= 0) return 'unknown';
    var r = hp / maxHp;
    if (r <= 0.1) return 'near death';
    if (r <= 0.5) return 'bloodied';
    if (r < 1) return 'wounded';
    return 'healthy';
  }

  // Split a scene's text into read-aloud vs. DM-only notes (mirrors
  // ai-context.js so we don't depend on its load order).
  function readAloudOf(scene) {
    if (!scene) return null;
    var text = String(scene.text || '');
    var m = /dm notes?:/i.exec(text);
    var read = m ? text.slice(0, m.index).trim() : text;
    return { title: scene.title || '', readAloud: read };
  }

  function isHidden(c) { return !!(c && c.hidden); }

  // True when this combatant is the viewing player's own character.
  function isSelf(c, opts) {
    if (!opts) return false;
    if (opts.selfId != null && c.id != null) return c.id === opts.selfId;
    if (opts.selfName) {
      return String(c.name || '').toLowerCase() === String(opts.selfName).toLowerCase();
    }
    return false;
  }

  // A single combatant, reduced to what a player may receive.
  //   - own character: full detail (HP, AC, attacks) — it's theirs.
  //   - other PCs: name/position/conditions, but no HP numbers
  //     (each player tracks their own).
  //   - revealed monsters/NPCs: name/position/conditions + a coarse
  //     health band only — never HP totals, AC, or attack stats.
  function playerCombatant(c, opts) {
    var v = {
      id: c.id,
      name: c.name,
      kind: c.kind,
      dead: !!c.dead,
      conditions: (c.conditions || []).slice(),
      initiative: (c.initiative == null ? null : c.initiative),
      x: (c.x == null ? null : c.x),
      y: (c.y == null ? null : c.y)
    };
    if (isSelf(c, opts)) {
      v.self = true;
      v.hp = c.hp; v.maxHp = c.maxHp; v.ac = c.ac;
      if (c.attacks) v.attacks = c.attacks;
    } else if (c.kind === 'player') {
      // A fellow player: they own their HP; we don't expose numbers.
      v.ac = (c.ac == null ? null : c.ac);
    } else {
      // Revealed monster / NPC: coarse band only, no statistics.
      v.health = band(c.hp, c.maxHp, c.dead);
    }
    return v;
  }

  // The map, fog- and secret-limited. When fog is on, unrevealed
  // terrain and the background image are stripped at the data level
  // (not sent), so the player client cannot reconstruct them.
  function playerMap(map) {
    if (!map) return null;
    var fog = !!map.fog;
    var out = {
      v: 1,
      grid: (map.grid === 'hex' ? 'hex' : 'square'),
      cols: map.cols, rows: map.rows,
      fog: fog,
      terrain: {},
      areas: [],
      starts: null,          // start zones are DM prep — never sent
      bg: fog ? null : (map.bg || null)
    };
    var revealed = map.revealed || {};
    var k;
    if (fog) {
      out.revealed = {};
      for (k in revealed) if (revealed.hasOwnProperty(k)) out.revealed[k] = 1;
      var terrain = map.terrain || {};
      for (k in terrain) {
        if (terrain.hasOwnProperty(k) && revealed[k]) out.terrain[k] = terrain[k];
      }
    } else {
      var t = map.terrain || {};
      for (k in t) if (t.hasOwnProperty(k)) out.terrain[k] = t[k];
    }
    // Areas: only those the DM has revealed and not marked hidden, and
    // with secret DM notes stripped out entirely.
    (map.areas || []).forEach(function (a) {
      if (a.hidden || !a.revealed) return;
      out.areas.push({ n: a.n, x: a.x, y: a.y, title: a.title || '', read: a.read || '' });
    });
    return out;
  }

  /* ---- The DM view: everything, unchanged. ---- */
  function dmView(snapshot) { return snapshot; }

  /* ---- The player view: only what the character may know. ---- */
  function playerView(snapshot, opts) {
    snapshot = snapshot || {};
    opts = opts || {};
    var combatants = (snapshot.combatants || [])
      .filter(function (c) { return !isHidden(c); })
      .map(function (c) { return playerCombatant(c, opts); });

    // Only DM narration reaches players — never the raw mechanical
    // combat log (it references monster HP) or the AI tool transcript.
    var chatLog = (snapshot.chatLog || []).filter(function (m) {
      return m && m.role === 'dm';
    }).map(function (m) { return { role: 'dm', text: m.text }; });

    return {
      v: 1,
      role: 'player',
      combatants: combatants,
      activeId: (snapshot.activeId == null ? null : snapshot.activeId),
      scene: readAloudOf(snapshot.scene),
      chatLog: chatLog,
      map: playerMap(snapshot.map)
      // Deliberately omitted: log, aiMessages, hidden combatants,
      // start zones, secret areas, DM notes, monster statistics.
    };
  }

  // Convenience: project a snapshot for an arbitrary role.
  function viewFor(role, snapshot, opts) {
    return role === 'player' ? playerView(snapshot, opts) : dmView(snapshot);
  }

  window.Visibility = {
    dmView: dmView,
    playerView: playerView,
    viewFor: viewFor,
    band: band,
    readAloudOf: readAloudOf
  };
})();
