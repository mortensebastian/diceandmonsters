# Cross-device sync & group sharing (Supabase)

This is the plan for letting players sign in, sync their character
sheets across devices, and share them within a play group — all on
Supabase's free tier, with no server to run yourself.

## How it works

- **Supabase** hosts a Postgres database + authentication for us
  ("serverless"). The app talks to it directly from the browser.
- **Row Level Security (RLS)** in the database enforces who can see
  what. The rules (in [`supabase/schema.sql`](supabase/schema.sql)):
  - You own your character sheets and only you can edit them.
  - A **group** is a play party. Anyone with the invite code can join.
  - A sheet attached to a group and marked **shared** is readable by
    every member of that group (DM included).
  - A **live session's full state is owner-only** (it holds hidden
    monsters, DM notes and traps). When a DM shares a session, players
    read a *separate* `play_player_views` row that contains only the
    sanitized projection — hidden info never reaches a player client.
- The site keeps working offline via `localStorage`; when you're
  signed in, data syncs to the cloud too.

## One-time setup (≈5 minutes)

1. Go to [supabase.com](https://supabase.com), sign up (free), and
   create a **New project**. Pick a region near you and set a database
   password (you won't need it for the app).
2. Open **SQL Editor** → **New query**, paste the whole contents of
   [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
   This creates the tables, the sharing rules, and the join/group
   helper functions. (Re-run it after updating the app — it's
   idempotent — to add the `play_player_views` table and tighten the
   session policy for the live-multiplayer split.)
3. Open **Authentication → Providers** and enable **Email** (and
   optionally **Google** for one-click login).
4. Open **Project Settings → API** and copy two values:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - **anon public** key (the long one labelled `anon` / `public`)

## Stopping bots from creating accounts (captcha)

Sign-up always runs through `captcha.js`. Out of the box it shows a
small **dice question** plus a hidden honeypot field and a "filled in
impossibly fast" timing check. That's enough to turn away naive
form-filling bots, but it runs in the browser — a determined script can
skip the form and POST to the Supabase auth endpoint directly.

For protection that actually holds, let **Supabase** verify a captcha
token server-side:

1. Create a free site at [Cloudflare
   Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) (or
   [hCaptcha](https://www.hcaptcha.com/)) and add your domain
   (`mortensebastian.github.io`, plus `localhost` for local testing).
   You get a **site key** (public) and a **secret key** (private).
2. In Supabase: **Authentication → Attack Protection → Enable Captcha
   protection**, pick the same provider, paste the **secret key**, save.
3. In `supabase-config.js`, add the **site key**:

   ```js
   window.SUPABASE_CONFIG = {
     url: '…', anonKey: '…',
     captcha: { provider: 'turnstile', siteKey: '0x4AAA…' }
   };
   ```

The site key is public by design — safe to commit. The secret key lives
only in Supabase; never put it in this repo.

With that on, Supabase rejects any sign-up (and sign-in) without a valid
token, so bots can't get in through the API either. The widget then
appears in the sign-in panel automatically; if it can't load (offline,
blocked), the form falls back to the dice question so humans aren't
locked out — Supabase will still refuse the request and say so.

Also worth turning on while you're in that screen: **Authentication →
Sign In / Providers → Confirm email**, so an address has to be real
before the account works.

## What I need from you

Send me those two values (Project URL + anon public key), or paste
them into a `supabase-config.js` file in the repo root:

```js
window.SUPABASE_CONFIG = {
  url: 'https://xxxx.supabase.co',
  anonKey: 'eyJ...'   // the anon / public key
};
```

**These are safe to put in client-side code.** The anon key is meant
to be public — it only lets the browser *attempt* requests; the RLS
rules above decide what's actually allowed. (Never commit the
`service_role` key — that one bypasses RLS. We don't use it.)

## Then I'll wire up the frontend

Once a project exists, I'll add (loaded via `<script>`, no build step):

1. The Supabase JS client + a small `cloud.js` data layer.
2. A **Sign in** button (email / Google).
3. **Groups**: create a group, share the invite code, join by code,
   see who's in the party.
4. **Character sheets** synced to your account, with a "share with
   group" toggle so the rest of the party (and the DM) can view them.
5. `localStorage` kept as an offline fallback.

> Note: the character-sheet UI itself (HP, abilities, etc.) is still
> to be built — players are currently just name + AC + initiative.
> The `data` column is freeform JSON, so we can grow the sheet without
> touching the database schema.
