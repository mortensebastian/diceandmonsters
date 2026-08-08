/* Supabase project config. Safe to commit: the publishable/anon key is
   meant to be public — Row Level Security (see supabase/schema.sql) is
   what actually decides who can read/write. Never put a secret /
   service_role key here. */
window.SUPABASE_CONFIG = {
  url: 'https://knldeduzioqhsxdhfijz.supabase.co',
  anonKey: 'sb_publishable_bjUHeL1xh2VOF0xx7kd-jQ_cyQBKefl',

  /* Bot guard on account creation (captcha.js). With no `captcha` block
     the sign-up form falls back to a local dice question + honeypot,
     which only stops naive bots. For real protection, turn on
     Supabase → Authentication → Attack Protection → Captcha, then paste
     the *site* key here (it's public; the secret key stays in Supabase):

       captcha: { provider: 'turnstile', siteKey: '0x4AAA…' }

     provider: 'turnstile' (Cloudflare) or 'hcaptcha'. Must match what
     you selected in Supabase. See SUPABASE.md. `{ off: true }` disables
     the guard entirely. */
  // captcha: { provider: 'turnstile', siteKey: 'PASTE_SITE_KEY' }
};
