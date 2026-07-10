# Dice & Monsters — project guide (for AI assistants & contributors)

A browser-based toolkit for running Dungeons & Dragons 5e at the table:
build encounters, keep character sheets, run the fight live, and play with an
**AI Dungeon Master**. Everything is local-first (works offline) with optional
Supabase cloud sync.

## Ground rules / architecture

- **No build step. No framework. No package.json.** Plain ES5-style vanilla JS
  loaded via `<script>` tags, and plain CSS. Every JS file is an IIFE
  (`(function(){ 'use strict'; … })()`) that exposes at most one global
  (`window.DM`, `window.Cloud`, etc.). Keep it this way — match the existing
  style (var, function declarations, no transpilation).
- **Static site, hosted on GitHub Pages** from the `master` branch (root).
  Pushing to `master` auto-deploys via GitHub's built-in "pages build and
  deployment" workflow (no workflow file in the repo).
- **Local-first.** All features work on `localStorage` with no account. Cloud
  (Supabase) is strictly additive: if it's unconfigured or unreachable, the app
  runs exactly as before. Never make a feature hard-depend on the network.
- **Dark theme** in `style.css`. Palette: panels `#1d2029`, insets `#12141a`,
  border `#2c3140`, text `#e6e6e6`, accents red `#c0392b`, gold `#e1b12c`,
  blue `#4aa3df`/`#2980b9`, green `#27ae60`, purple `#9b59b6`. Reuse existing
  class names before inventing new ones.

## Pages (each `*.html` + its `*.js`)

| Page | Files | Purpose |
|---|---|---|
| Home | `index.html` | Landing cards linking to the tools |
| Encounter Planner | `encounter.html` + `Dice&Monsters.js` | Prep only: pick monsters (322 SRD), add players/PCs/NPCs, set conditions, save named encounters. No live combat — "Start game session ▶" hands the roster off to the Game Session. |
| Game Session (gameplay) | `play.html` + `play.js` | The live table (nav label "Game Session"; file stays `play.html`): initiative, turns, attacks, HP, conditions, combat log, **AI DM chat**, **battlemap**, add combatants mid-fight, autosave, cloud saves + shared live sessions. |
| Character Sheet | `character.html` + `character.js` | 5e sheets (abilities, skills, attacks, spells). Read/edit modes. Name is editable in the always-visible title field. |
| Groups | `groups.html` + `groups.js` | DM party summary (AC/init/passive perception) from local PCs. (Not yet wired to Supabase groups.) |
| Adventure | `adventure.html` + `adventure.js` | Built-in one-shots + your own. "🎲 Play this scene" sends scene text + monsters to the Game Session. |

## Core modules

- **`combat-engine.js` → `window.DM`** — the pure, UI-agnostic game core (no DOM,
  no network). Combatant model, dice, `resolveAttack` (rolls d20 + damage
  internally, applies HP), initiative/turn-order, conditions, `serializeCombatant`/
  `deserializeCombatant`. **Both** the planner and Play use it. The engine owns
  all randomness and HP math.
- **Combatant model:** `{ id, kind: 'monster'|'npc'|'player', name, hp, maxHp,
  ac, dead, initiative, initRoll, initMod, conditions[], attacks[], x?, y?,
  template? }`. Players have **no HP counter** (they track their own);
  monsters/NPCs do. `x`/`y` are optional battlemap cell coordinates (null until
  placed), serialized by the engine so they ride the session snapshot.
- **`battlemap.js` → `window.Battlemap`** — a `<canvas>` tabletop for the Game
  Session. Draws the map *behind* the grid (paintable terrain — wall/water/
  difficult/grass/wood/lava as a sparse `{ "col,row": type }` map — and/or a
  downscaled background image stored as a data URL) and the combatant tokens
  *on* it (coloured by kind, drag to move, click to select, distance readout in
  feet). All grid geometry (neighbours/centres/`pixelToCell`/distance) is
  isolated so **square** (tactical combat, 5e Chebyshev distance) and **hex**
  (overland travel, cube distance) share the same tokens and dragging. UI-only,
  no game rules: token positions live on the combatants (engine `x`/`y`), and
  play.js persists the map config via `getMap()`/`setMap()` in the session
  snapshot. **The canvas pins its CSS width/height to its backing pixel size
  each render** — otherwise `max-width` shrinks width but not height and clicks
  map to the wrong cell. Viewers (shared sessions) get `setLocked(true)`.

### AI layer (Play page)

- **`ai-context.js` → `window.AIContext.build(state, opts)`** — pure. Serializes
  combat state into a compact, safe payload. **Hides player HP from the DM.**
  Splits a scene's read-aloud text from `DM notes:` (secrets). Enemy-HP banding
  (`opts.hideEnemyHp`) is ready for a future AI-player mode.
- **`ai-client.js` → `window.AIClient`** — transport to Claude. Pluggable:
  `direct` (browser → api.anthropic.com with the user's own key in
  `localStorage`, header `anthropic-dangerous-direct-browser-access: true`) now;
  switch to a Supabase Edge Function relay later by changing only the endpoint.
  Default model `claude-opus-4-8`.
- **`ai-dm.js` → `window.AIDM`** — DM system prompt, the tool schemas
  (`monster_action`, `set_condition`, `apply_damage`, `apply_heal`,
  `advance_turn`), and the state block. **Golden rule:** Claude picks actions via
  tools; the engine rolls — Claude never states dice/HP numbers.
- **`voice.js` → `window.Voice`** — optional ElevenLabs voice layer (BYOK, direct
  browser→ElevenLabs with the `xi-api-key` header). **TTS:** `speak`/`enqueue`
  read the DM's narration aloud (`enqueue` queues lines so one turn's multiple
  bubbles don't overlap); default model `eleven_multilingual_v2` so it speaks
  English *and* Norwegian. **STT:** `startRecording`/`stopAndTranscribe`
  (MediaRecorder → `speech-to-text`, model `scribe_v1`) power push-to-talk input.
  Key + settings live only in `localStorage`; with no key set, `hasKey()` is
  false and the whole layer no-ops (the 🔊/🎤 buttons stay hidden). `play.js`
  auto-speaks new `dm` chat lines when the 🔊 toggle is on and drives the 🎤
  push-to-talk button.
- `play.js` runs the chat + agentic tool loop: send → Claude responds with text
  and/or tool_use → execute each tool via `window.DM` → feed results back → loop
  until `end_turn` (hard iteration cap). Player HP stays hidden; a viewer (shared
  session) is read-only.

### Cloud (Supabase, optional)

- **`supabase-config.js`** — `window.SUPABASE_CONFIG = { url, anonKey }`. The
  anon/publishable key is public by design (RLS protects data). Safe to commit;
  never put a `service_role`/secret key here.
- **`cloud.js` → `window.Cloud`** — thin Supabase data layer: auth, `play_sessions`
  CRUD + Realtime, `user_collections` get/save, groups (create/join/list),
  `setSessionShare`. `Cloud.available()` is false when unconfigured → everything
  no-ops. The Supabase JS client is loaded from a CDN `<script>` (UMD →
  `window.supabase`).
- **`auth-ui.js`** — one global sign-in widget on every page, mounted **inside the
  `.nav` bar** (top-right pin on the home page which has no nav). Signed out:
  "Sign in"; signed in: "Logged in as <email>" + Sign out. Auth is shared across
  pages (same origin).
- **`cloud-sync.js` → `window.CloudSync`** — syncs a `localStorage` collection to
  Supabase (no UI of its own). Used by Character/Adventure/Encounter. Merges
  cloud + local by id on sign-in (union, nothing lost), pushes local changes up
  (debounced). Pages call `CloudSync.push(kind)` after each local save and pass
  an `onRemoteChange` re-render callback.

## Data: localStorage keys

| Key | Owner |
|---|---|
| `diceAndMonsters.characters` | character.js (array of sheets, id) |
| `diceAndMonsters.adventures` | adventure.js (user adventures, id) |
| `diceAndMonsters.encounters` | Dice&Monsters.js (saved encounters, keyed by **name**) |
| `diceAndMonsters.playAutosave` | play.js (live session snapshot) |
| `diceAndMonsters.playSession` | handoff from planner/adventure → Play (consumed once) |
| `diceAndMonsters.pendingEncounter` | handoff adventure → planner |
| `diceAndMonsters.anthropicKey` / `.aiModel` | AIClient (BYOK) |
| `diceAndMonsters.elevenKey` / `.elevenVoice` / `.elevenTtsModel` / `.elevenSttModel` / `.voiceAuto` | Voice (ElevenLabs BYOK, voice id, TTS/STT models, auto-speak flag) |

The Play "snapshot" (`snapshot()`/`applySnapshot()` in play.js) is the shared
shape used for local autosave **and** cloud `play_sessions.state`.

## Supabase

- Schema in `supabase/schema.sql` (run once in the SQL Editor). Tables:
  `profiles`, `groups`, `group_members`, `character_sheets` (legacy, unused by
  the frontend), `play_sessions` (live game state + Realtime), `user_collections`
  (characters/adventures/encounters blobs). RLS throughout; owner-writes /
  group-members-read for shared sessions.
- Setup steps and the new-dashboard locations for URL + key are in `SUPABASE.md`.
- **Sharing model:** single-writer. The DM owns and writes a `play_sessions` row;
  when `shared=true` + attached to a group, group members open it read-only and
  get live Realtime updates (~2s cadence, the cloud-autosave debounce).

## Running & testing locally

No server needed to open files, but `localStorage`/fetch behave best over HTTP:

```
python3 -m http.server 8199    # then open http://localhost:8199/play.html
```

For automated checks in this environment, Chromium is preinstalled and
`playwright-core` can drive it (executable at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `--no-sandbox`). External
hosts (fonts CDN, supabase.co, the Supabase JS CDN) are blocked in the sandbox,
so **cloud/AI network calls can't be tested here** — stub `window.supabase` /
`window.fetch` in an `addInitScript`, and verify graceful degradation when
they're absent. Always `node --check <file>.js` after edits.

## Deploy & git workflow

- Work on branch `claude/ai-player-tabletop-game-5z1b2m`; commit there, then
  fast-forward `master` and push both. Pushing `master` triggers the Pages
  deploy.
- If a deploy fails with a GitHub infra error ("job was not acquired by
  Runner…", "Deployment failed, try again later"), it's transient — push an
  empty commit to `master` (or Re-run the job) to retrigger.
- Live URL: `https://mortensebastian.github.io/diceandmonsters/` (needs a hard
  refresh / private tab after a deploy because JS/CSS are cached).

## Gotchas

- **Never let Claude produce dice results or HP** — it returns tool calls; the
  engine (`window.DM`) rolls. This keeps rolls impartial and the log honest.
- **AI DM must not see player HP** and must not reveal `DM notes:` — enforced in
  `ai-context.js` + the system prompt, not left to chance.
- **BYOK key** lives only in the user's browser; direct browser→Anthropic needs
  the `anthropic-dangerous-direct-browser-access` header.
- **NPC-from-sheet HP** defaults to 1 when the sheet has no max HP — an imported
  NPC can die instantly. (Known rough edge; see plan.md.)
- **Cloud collection sync is last-write-wins per collection** (whole array as one
  jsonb blob). Two devices editing simultaneously can clobber each other.
