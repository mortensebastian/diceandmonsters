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

  window.AIDM = {
    SYSTEM: SYSTEM,
    buildNarration: buildNarration
  };
})();
