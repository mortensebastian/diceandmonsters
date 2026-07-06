/* ============================================================
   Dice & Monsters — AI Context builder
   ------------------------------------------------------------
   Pure: turns the live combat `state` into a compact, safe
   payload for the model. No DOM, no network.

   Safety rules baked in here (not left to the prompt):
     - Player HP is never exposed to the AI DM (players track
       their own HP; a DM doesn't know PC totals).
     - Enemy HP can be coarse-banded for AI-player mode
       (opts.hideEnemyHp).
     - Scene "DM notes:" are split out from read-aloud text so
       secret DCs / solutions can be marked private.
   ============================================================ */
(function () {
  'use strict';
  var DM = window.DM;

  function hpBand(c) {
    if (c.dead) return 'down';
    var r = c.hp / c.maxHp;
    if (r <= 0.1) return 'near death';
    if (r <= 0.5) return 'bloodied';
    if (r < 1) return 'wounded';
    return 'healthy';
  }

  // A combatant is an "enemy" from the AI's seat if it's a monster/npc
  // (AI DM) — for AI-player mode the caller marks its own side.
  function combatantView(c, opts) {
    var v = {
      id: c.id, name: c.name, kind: c.kind, ac: c.ac,
      dead: !!c.dead, conditions: c.conditions.slice(),
      initiative: c.initiative
    };
    if (c.attacks && c.attacks.length) {
      v.attacks = c.attacks.map(function (a, i) {
        return {
          index: i, name: a.name, toHit: a.toHit,
          damage: (a.sides > 0 ? a.count + 'd' + a.sides : '') +
            (a.bonus ? (a.bonus > 0 ? '+' : '') + a.bonus : ''),
          type: a.type, ranged: !!a.ranged
        };
      });
    }
    if (DM.hasHp(c)) {
      var isEnemy = (c.kind === 'monster' || c.kind === 'npc');
      if (isEnemy && opts.hideEnemyHp) {
        v.health = hpBand(c);
      } else {
        v.hp = c.hp; v.maxHp = c.maxHp;
      }
    } else {
      // No HP counter (a human player in AI-DM mode): never invent one.
      v.health = 'unknown (player tracks their own)';
    }
    return v;
  }

  // Split a scene's text into read-aloud vs. DM-only notes.
  function splitScene(scene) {
    if (!scene) return null;
    var text = String(scene.text || '');
    var out = { title: scene.title || '', readAloud: text, dmNotes: '' };
    var m = /dm notes?:/i.exec(text);
    if (m) {
      out.readAloud = text.slice(0, m.index).trim();
      out.dmNotes = text.slice(m.index + m[0].length).trim();
    }
    return out;
  }

  // recentLog: array of {text} (newest last), from state.log.
  function recentLog(state, n) {
    var log = state.log || [];
    return log.slice(-(n || 15)).map(function (e) { return e.text; });
  }

  function build(state, opts) {
    opts = opts || {};
    var order = DM.trackerOrder(state.combatants).map(function (c) {
      return { id: c.id, name: c.name, kind: c.kind, initiative: c.initiative, dead: !!c.dead };
    });
    var active = null;
    if (state.activeId != null) {
      var a = DM.findCombatant(state.combatants, state.activeId);
      if (a) active = { id: a.id, name: a.name, kind: a.kind };
    }
    var ctx = {
      scene: splitScene(opts.scene || state.scene),
      turnOrder: order,
      active: active,
      combatants: state.combatants.map(function (c) { return combatantView(c, opts); }),
      recentLog: recentLog(state, opts.logLines)
    };
    if (opts.selfId != null) {
      var self = DM.findCombatant(state.combatants, opts.selfId);
      if (self) ctx.self = combatantView(self, { hideEnemyHp: false });
    }
    return ctx;
  }

  window.AIContext = { build: build, splitScene: splitScene, hpBand: hpBand };
})();
