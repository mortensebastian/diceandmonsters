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
- **Voice (ElevenLabs, BYOK)** — optional voice layer for the AI DM
  (`voice.js` / `window.Voice`). TTS reads the DM's narration aloud (toggle
  🔊 in the quick row; multilingual so it speaks English *and* Norwegian);
  STT push-to-talk (hold 🎤 in the composer) transcribes your speech and
  sends it to the DM. Key stored only in the browser, sent straight to
  ElevenLabs; hidden entirely until a key is set, so the app is unchanged
  without one.

## AI Player — design (Phase 3, in progress)

The original goal: Claude sits in a *player's* seat and runs a character. The key
realisation from the design pass: **"an extra AI teammate" and "a full AI party"
are the same capability, not two features.** Both are just "an AI that controls
one or more PCs, driven on each PC's turn." So we build **one** engine and expose
it as a per-combatant flag; N=1 is a solo AI teammate, N=all is a self-playing
party. It is also **orthogonal to who DMs** — it must work under the AI DM
(`?role=ai`), a human DM Console (`?role=dm`), and solo. So it lives in the Game
Session page as a per-creature toggle, **not** bolted onto the AI-DM chat panel.

### Decisions (locked)

- **Tied to a real character sheet** (HP/attacks/spells/checks come from the sheet).
- **Per-character loop** — the turn driver calls the model once per AI PC with that
  PC as `self` + its own persona. Scales evenly 1 → whole party, keeps distinct
  voices, and limits metagaming (each PC mainly "sees itself"). Costlier than one
  shared brain, but the existing prompt-cache breakpoint in `runLoop` softens it.
- **Enemy HP hidden** from the AI player (`AIContext.build(state,{ hideEnemyHp:true,
  selfId })`), and it never sees `dmNotes` / hidden creatures — same secrecy rules
  as a human player.
- **Player HP stays hidden from the DM context.** An AI PC gets *engine-tracked* HP
  (so damage lands and it can reason about its health), but that exact HP is exposed
  **only** through its own `self` block — in the shared context every player's HP is
  banded (`healthy`/`bloodied`/…), never exact. Human players still carry no HP.
- **Auto on its turn, behind one toggle** — "Auto-run AI turns". When initiative
  reaches an AI PC it acts itself; combined with the AI DM this yields a self-playing
  table. The driver always **stops on a human PC's turn** and has a hard iteration
  cap so it can't run away.

### Build order

1. **Engine HP plumbing** ✅ — `createPlayerFromSheet` stashes the sheet's max HP as
   `c.sheetHp` (kept separate so human players still have no HP counter).
   `DM.setAiControlled(c, on, opts)` toggles `c.aiControlled` + `c.persona` and, for a
   player, gives/removes an engine HP counter (`maxHp`/`hp`). `aiControlled`,
   `persona`, `sheetHp` are serialized (only when set, so old saves still load).
2. **`ai-player.js` → `window.AIPlayer`** ✅ — mirrors `ai-dm.js`: a player persona
   system prompt + a lean tool set (`player_attack`, `move_token`, `set_condition`,
   `end_turn`) and a `stateBlock`/`STATE_MARKER`. The engine still rolls everything
   (`player_attack` routes through the same `resolveAttack`/`performAttack` path as
   `monster_action`).
3. **Per-card UI toggle** — a "🤖 Let AI play this" control on each player card that
   calls `setAiControlled`, plus a persona field. Serialized in the snapshot.
4. **Turn driver** — generalise `runLoop` to take `{ system, tools, executor }` so it
   can drive either the DM or a specific AI PC. An "Auto-run AI turns" toggle: when the
   active combatant is an AI PC, run its `AIPlayer` turn; when it's a monster/NPC and
   the AI DM is on, run the DM; stop on a human PC. Hard iteration cap.
5. **Presets** — thin wrappers over the flag: "Add an AI teammate" (flag one) and
   "Fill the party with AI" (flag all players).
6. **Visibility check** — confirm an AI PC's context never carries `dmNotes`, hidden
   creatures, or exact enemy HP (reuse `hideEnemyHp` + self-only exact HP).
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
6. ~~**Voice (TTS)** — read the DM's narration aloud.~~ **Done** via ElevenLabs
   (`voice.js`): TTS for the DM's narration + STT push-to-talk for player input.
   Possible follow-ups: let live viewers hear the DM too; a Supabase relay so the
   ElevenLabs key isn't per-browser (mirrors the AI-key relay in item 5).

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
