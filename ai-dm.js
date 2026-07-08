/* ============================================================
   Dice & Monsters — AI Dungeon Master
   ------------------------------------------------------------
   Pure prompt/message builders for the AI DM. Phase 1 is
   narration only (free text): set the scene, and narrate what
   just happened. No dice, no mechanics — those come in Phase 2
   via tool use, and will map onto window.DM.

   Golden rule (mirrors combat-engine): the model narrates and
   decides intent; it never invents dice results, HP totals, or
   secret information. Randomness stays in the engine.
   ============================================================ */
(function () {
  'use strict';

  var SYSTEM =
    "You are the Dungeon Master for a Dungeons & Dragons 5th Edition game, " +
    "narrating a live encounter at the table.\n\n" +
    "STYLE: Vivid, atmospheric, second person (\"you see…\"), concise — " +
    "2–4 sentences unless asked for more. Address the players directly.\n\n" +
    "HARD RULES — never break these:\n" +
    "• Never invent or state dice rolls, to-hit numbers, damage, or exact HP. " +
    "Only describe events that have ALREADY happened (given in the context/log).\n" +
    "• Never reveal DM-only information: the scene's \"dmNotes\", secret DCs, " +
    "hidden solutions, monster tactics, or enemies' exact HP. Describe enemy " +
    "health only in vague terms (\"bloodied\", \"barely standing\").\n" +
    "• Never decide what the player characters do or say. You run the world and " +
    "the monsters/NPCs, not the heroes.\n" +
    "• You have no map yet: keep positioning and distances vague and narrative, " +
    "never precise squares or feet.";

  // Compact JSON of the situation the DM can see.
  function contextBlock(context) {
    return "Current situation (JSON):\n```json\n" +
      JSON.stringify(context, null, 2) + "\n```";
  }

  // mode: 'scene' (set the scene now) | 'round' (narrate recent events)
  // Returns { system, messages } for AIClient.complete.
  function buildNarration(context, mode, extra) {
    var ask;
    if (mode === 'round') {
      ask = "Narrate what just happened in the fight, based on the recent log " +
        "above. Keep it punchy and in-the-moment. Do not add new mechanical " +
        "outcomes — only dramatize what the log already shows.";
    } else {
      ask = "Set the scene for the players: describe what they currently see, " +
        "hear and feel. Use the scene's read-aloud text if present. Do not " +
        "reveal anything from dmNotes.";
    }
    if (extra) ask += "\n\nAdditional direction from the DM: " + extra;

    return {
      system: SYSTEM,
      max_tokens: 700,
      messages: [
        { role: 'user', content: contextBlock(context) + "\n\n" + ask }
      ]
    };
  }

  /* ---- Phase 2: conversational DM with tool use ---- */

  var CHAT_SYSTEM =
    "You are the Dungeon Master for a Dungeons & Dragons 5th Edition game, in an " +
    "ongoing conversation with the people at the table. You both TALK (narrate, " +
    "describe, answer questions, banter in character) and ACT — you drive the " +
    "monsters and NPCs through tools wired to the real game engine.\n\n" +

    "CURRENT STATE: the latest user message contains a CURRENT STATE block (JSON). " +
    "It is authoritative — use its combatant ids, attack indices and turn order, " +
    "and ignore state numbers from earlier messages.\n\n" +

    "ACTING — the golden rule:\n" +
    "• The engine rolls all dice and tracks all HP. When a monster/NPC attacks, call " +
    "the monster_action tool; you will receive the result AFTER the engine rolls. " +
    "NEVER state a to-hit number, damage amount, or HP total yourself — narrate only " +
    "from the results the tools give you.\n" +
    "• Use set_condition, apply_damage, apply_heal and advance_turn as the fight needs.\n" +
    "• You control ONLY monsters and NPCs. Never attack for, roll for, or decide the " +
    "actions of the player characters. On a player's turn, ask the table what they do.\n" +
    "• Act when asked to run the fight or a creature's turn. Don't invent extra rounds " +
    "or attacks nobody asked for. A monster with several attacks may call monster_action " +
    "more than once in its turn.\n\n" +

    "SECRECY: never reveal the scene's dmNotes, secret DCs, hidden solutions, or an " +
    "enemy's exact HP. Describe enemy health vaguely (\"bloodied\", \"barely standing\").\n\n" +

    "STYLE: vivid but concise, second person to the players. No battle map yet — keep " +
    "positioning and range narrative, never precise squares or feet.";

  var TOOLS = [
    {
      name: 'monster_action',
      description: "Make one attack with a monster or NPC you control. The engine rolls " +
        "the d20 and damage and applies it; you get the outcome back. Use ids/indices from CURRENT STATE.",
      input_schema: {
        type: 'object',
        properties: {
          combatantId: { type: 'integer', description: 'id of the attacking monster/NPC' },
          attackIndex: { type: 'integer', description: "index into that combatant's attacks array" },
          targetId: { type: 'integer', description: 'id of the target; omit to just roll with no target' },
          say: { type: 'string', description: 'optional short in-character line or flavour' }
        },
        required: ['combatantId', 'attackIndex']
      }
    },
    {
      name: 'set_condition',
      description: 'Add or remove a condition (e.g. Prone, Poisoned, Frightened) on a combatant.',
      input_schema: {
        type: 'object',
        properties: {
          combatantId: { type: 'integer' },
          condition: { type: 'string' },
          mode: { type: 'string', enum: ['add', 'remove'] }
        },
        required: ['combatantId', 'condition', 'mode']
      }
    },
    {
      name: 'apply_damage',
      description: 'Deal damage to a combatant that has an HP counter (monster/NPC) — for spells, ' +
        'environmental effects, or anything not covered by monster_action. The engine subtracts it.',
      input_schema: {
        type: 'object',
        properties: {
          combatantId: { type: 'integer' },
          amount: { type: 'integer' },
          note: { type: 'string', description: 'optional source, e.g. "fireball"' }
        },
        required: ['combatantId', 'amount']
      }
    },
    {
      name: 'apply_heal',
      description: 'Heal a combatant that has an HP counter (monster/NPC). The engine adds it.',
      input_schema: {
        type: 'object',
        properties: {
          combatantId: { type: 'integer' },
          amount: { type: 'integer' },
          note: { type: 'string' }
        },
        required: ['combatantId', 'amount']
      }
    },
    {
      name: 'advance_turn',
      description: 'Advance initiative to the next living combatant.',
      input_schema: { type: 'object', properties: {} }
    }
  ];

  function stateBlock(context) {
    return "CURRENT STATE (authoritative):\n```json\n" +
      JSON.stringify(context, null, 2) + "\n```";
  }

  window.AIDM = {
    SYSTEM: SYSTEM,
    buildNarration: buildNarration,
    CHAT_SYSTEM: CHAT_SYSTEM,
    TOOLS: TOOLS,
    stateBlock: stateBlock
  };
})();
