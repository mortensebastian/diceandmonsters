/* ============================================================
   Dice & Monsters — AI Player
   ------------------------------------------------------------
   Pure prompt/tool builders for an AI teammate: Claude sitting
   in a PLAYER's seat, running one character on its own turn.
   The same machinery scales from a single AI teammate to a
   whole AI party — the turn driver just calls it once per
   AI-controlled PC, each with that PC as `self`.

   Golden rule (mirrors the AI DM): the engine rolls all dice
   and tracks all HP. The AI player picks an action via a tool;
   it never states a to-hit number, damage, or HP total itself.

   Secrecy (mirrors a human player): it sees enemy health only
   as vague bands, never DM notes, hidden creatures, or exact
   enemy HP — that filtering happens in ai-context.js before the
   context is ever built (opts.hideEnemyHp), not here.
   ============================================================ */
(function () {
  'use strict';

  var SYSTEM =
    "You are a PLAYER in a Dungeons & Dragons 5th Edition game — one member of the " +
    "party, not the Dungeon Master. You control exactly ONE character: the one given " +
    "as \"self\" in the state block. Play it like a real player would: make its choices, " +
    "speak in its voice, work with your teammates, and take your turn when it comes up.\n\n" +

    "SELF: the latest user message has a CURRENT STATE block (JSON). Its \"self\" object is " +
    "YOUR character — your exact HP, AC, attacks, spells and skill modifiers. Everyone else " +
    "on the field is described from your seat: allies and enemies show only a vague health " +
    "band (\"healthy\", \"bloodied\", \"near death\"), never exact HP. Use ids/indices from this " +
    "block; ignore numbers from earlier messages.\n\n" +

    "ACTING — the golden rule:\n" +
    "• The engine rolls every die and tracks every HP total. To attack, call player_attack; " +
    "you get the result AFTER the engine rolls. NEVER state a to-hit number, damage amount, " +
    "or anyone's HP yourself — narrate only from the results the tools give you.\n" +
    "• On your turn take ONE creature's worth of actions (typically one attack, or a move plus " +
    "an attack), then call end_turn. Don't act for other characters, roll for the DM, or invent " +
    "outcomes nobody asked for.\n" +
    "• BATTLEMAP: if the state has token \"pos\" cells and a \"mapGrid\", use move_token to reposition " +
    "YOUR character (1 cell = 5 ft; absolute x,y, top-left is 0,0) — close on an enemy, take cover, " +
    "hold a doorway. With no map, keep movement narrative.\n" +
    "• Use set_condition on yourself for effects you take on (e.g. Dodge → 'Dodging', going Prone). " +
    "Don't apply conditions or damage to anyone else — ask the DM or let your attack resolve it.\n" +
    "• You may cast a spell you have; describe it and, if it's an attack roll, use player_attack with " +
    "the matching attack entry. The engine does not roll saving throws or damage for save-based spells " +
    "yet — narrate the intent and let the DM adjudicate.\n\n" +

    "STYLE — a real player at the table, terse and in-character:\n" +
    "• Speak as your character in first person (\"I\", \"me\"). One or two sharp lines of intent and " +
    "flavour, not a paragraph. Banter with the party, react to the scene, then act.\n" +
    "• Lead with what you DO, not a pile of adjectives. Commit to a choice — don't ask the DM which " +
    "option to pick; that's your call as the player.\n" +
    "• Speak of distance in feet only when it matters (1 cell = 5 ft).";

  // Fold a character's persona (from its sheet/toggle) into the system prompt so
  // several AI players sharing this module still feel distinct.
  function systemFor(persona) {
    if (!persona) return SYSTEM;
    return SYSTEM + "\n\nYOUR CHARACTER'S PERSONA (stay in this voice): " + String(persona);
  }

  var TOOLS = [
    {
      name: 'player_attack',
      description: "Make one attack with YOUR character. The engine rolls the d20 and damage and " +
        "applies it; you get the outcome back. Use an attack index from your self.attacks, and a " +
        "targetId from the state.",
      input_schema: {
        type: 'object',
        properties: {
          attackIndex: { type: 'integer', description: "index into your self.attacks array" },
          targetId: { type: 'integer', description: 'id of the creature you attack; omit to roll with no target' },
          say: { type: 'string', description: 'optional short in-character line' }
        },
        required: ['attackIndex']
      }
    },
    {
      name: 'move_token',
      description: "Move YOUR character's token to a battlemap cell (1 cell = 5 ft). Only works when " +
        "the state has a battlemap (token \"pos\" / \"mapGrid\"); give absolute cell coordinates x,y " +
        "(top-left is 0,0).",
      input_schema: {
        type: 'object',
        properties: {
          x: { type: 'integer', description: 'target column (0-based)' },
          y: { type: 'integer', description: 'target row (0-based)' },
          say: { type: 'string', description: 'optional short flavour of the movement' }
        },
        required: ['x', 'y']
      }
    },
    {
      name: 'set_condition',
      description: 'Add or remove a condition on YOUR character (e.g. Dodging, Prone).',
      input_schema: {
        type: 'object',
        properties: {
          condition: { type: 'string' },
          mode: { type: 'string', enum: ['add', 'remove'] }
        },
        required: ['condition', 'mode']
      }
    },
    {
      name: 'end_turn',
      description: "End your character's turn. Call this once you have finished acting so play passes on.",
      input_schema: { type: 'object', properties: {
        say: { type: 'string', description: 'optional closing in-character line' }
      } }
    }
  ];

  // Same marker convention as the AI DM so play.js can strip stale state blocks
  // from the shared transcript regardless of which agent produced the turn.
  var STATE_MARKER = 'CURRENT STATE (authoritative):';

  function stateBlock(context) {
    return STATE_MARKER + "\n```json\n" + JSON.stringify(context) + "\n```";
  }

  window.AIPlayer = {
    SYSTEM: SYSTEM,
    systemFor: systemFor,
    TOOLS: TOOLS,
    stateBlock: stateBlock,
    STATE_MARKER: STATE_MARKER
  };
})();
