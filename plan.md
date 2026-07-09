# Dice & Monsters — status & plan

Living document: what's built and what's next. Pair it with `CLAUDE.md`
(how the codebase works). When you finish something, move it up to "Done".

## The vision

Turn the D&D toolkit into a place where a small group can actually *play*: a live
gameplay page, an **AI Dungeon Master** that narrates and runs the monsters
(and later an **AI player**), running prewritten adventures from the start, with
cloud saves and shared live sessions so several people watch the same game.

## Done

- **Combat engine extracted** (`combat-engine.js` / `window.DM`) — shared, pure
  core used by both the planner and the Play page.
- **Play (gameplay) page** — initiative, turns, attacks, HP, conditions, combat
  log. Add monsters/players/character-sheets **mid-fight**. Local autosave +
  restore.
- **AI Dungeon Master (BYOK)** — a real back-and-forth chat that both talks and
  **acts** via tool use (`monster_action`, `set_condition`, `apply_damage`,
  `apply_heal`, `advance_turn`). The engine rolls; Claude narrates from results.
  Player HP hidden; `DM notes:` kept secret. Model `claude-opus-4-8`, direct
  browser→Anthropic with the user's own key.
- **Adventure → Play** — "🎲 Play this scene" drops the scene's monsters on the
  table and loads its text into the AI DM's scene field.
- **Cloud (Supabase)** — email auth; save/open/delete named `play_sessions`;
  continuous cloud autosave; **shared live sessions** (DM shares to a group via
  invite code, players open a read-only live viewer over Realtime); **cloud sync
  of characters, adventures, encounters** (`user_collections`). One **global
  login** widget in the nav on every page ("Logged in as …" when signed in).
- **Character name** editable from the always-visible title field.

## Next up (rough priority)

1. **AI Player (Phase 3)** — the original goal: Claude controls **one** character
   at the table. Chosen shape (from earlier decisions): tied to a real character
   **sheet** (1a) and it **acts on its own** (2b), with **enemy HP hidden** from
   it. **Prerequisite / do this first:** AI-controlled characters must carry HP
   in the engine (today `createPlayerFromSheet` gives players no HP, so damage
   isn't applied and the AI can't reason about its own health). Plumb HP for
   AI-controlled PCs (treat mechanically like an NPC but on the players' side).
   Reuse `ai-context.js` (`opts.hideEnemyHp`, `opts.selfId`) and add
   `ai-player.js` (persona + `take_action` tool) mirroring `ai-dm.js`.
2. **NPC-HP fix** — `DM.createNpcFromSheet` defaults maxHp to 1 when the sheet has
   no HP, so imported NPCs die instantly. Default to something sane or prompt.
3. **Trim Encounter Planner to pure prep** — now that Play is self-sufficient,
   remove the live-combat bits from the planner (attacks/turn-order/log), leaving
   monster picker + players + save + "Start play session". (Deferred cleanup; the
   duplication is harmless.)
4. **Battle map** — grid + tokens + optional background image; later feed token
   positions into `ai-context.js` so the AI can reason about position (today it's
   told to keep positioning vague).
5. **Supabase relay for the AI key** — a Supabase Edge Function holding the
   Anthropic key server-side so the whole group can use the AI without each
   person needing their own key. `ai-client.js` is already pluggable — only the
   endpoint/mode changes. This is the "Phase 4b" of the AI plan.
6. **Voice (TTS)** — read the DM's narration aloud (Web Speech API free tier;
   optional ElevenLabs behind a flag).

## Known rough edges / decisions to revisit

- **Cloud collection sync is last-write-wins per collection** (whole array as one
  blob). Fine for one person across devices; two simultaneous editors can clobber
  each other. If it bites, switch to per-item rows + per-item timestamps.
- **Groups UI is minimal** (create/join/invite-code inside the Play cloud panel);
  `groups.html` is still a local-only party summary, not wired to Supabase groups.
- **Character "wizard"** — the sheet is functional but the UX could be friendlier
  (guided creation, clearer read vs edit).

## Setup reminders (for a fresh environment/account)

- `supabase-config.js` must hold the project URL + anon/publishable key.
- Run `supabase/schema.sql` in the Supabase SQL Editor (idempotent). It includes
  `play_sessions` and `user_collections`.
- Enable Email auth in Supabase; turn **off** "Confirm email" for painless testing.
- Deploy = push to `master` (GitHub Pages). Hard-refresh / private tab to bust
  the JS/CSS cache after a deploy.
