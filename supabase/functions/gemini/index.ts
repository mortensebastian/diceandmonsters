// ============================================================
// Dice & Monsters — Gemini relay (Supabase Edge Function)
// ------------------------------------------------------------
// Server-side proxy so the FREE TIER can use Gemini without the owner's API
// key ever reaching a browser. The key lives here as a secret; only a
// signed-in Supabase user can call the function.
//
// The browser (ai-gemini.js in relay mode) POSTs:
//     { "model": "gemini-flash-latest", "request": <Gemini generateContent body> }
// with the user's Supabase session token in Authorization. This function
// verifies the user, injects GEMINI_API_KEY, forwards to Google, and returns
// Google's JSON verbatim (the client normalizes it).
//
// DEPLOY:
//   supabase secrets set GEMINI_API_KEY=<your Google AI Studio key>
//   supabase functions deploy gemini
// Then in the browser (no geminiKey needed in relay mode):
//   localStorage.setItem('diceAndMonsters.geminiRelay',
//     'https://<project-ref>.supabase.co/functions/v1/gemini');
//   localStorage.setItem('diceAndMonsters.aiProvider', 'gemini');
//
// TO REMOVE: delete this folder and unset the geminiRelay key. Nothing else
// depends on it.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const ALLOW_MODEL = /^gemini[\w.\-]*$/i; // only gemini* model ids
const MAX_BODY = 200_000;                // ~200 KB request cap

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json({ error: 'Relay not configured (missing GEMINI_API_KEY)' }, 500);

  // Require a real signed-in user — anon-key-only callers are rejected, so a
  // random visitor can't spend the key. Add tier / per-user quota checks here.
  const authHeader = req.headers.get('Authorization') ?? '';
  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return json({ error: 'Sign in required' }, 401);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'Request too large' }, 413);

  let payload: { model?: unknown; request?: unknown };
  try { payload = JSON.parse(raw); } catch { return json({ error: 'Bad JSON' }, 400); }

  const model = String(payload.model ?? '');
  if (!ALLOW_MODEL.test(model)) return json({ error: 'Model not allowed' }, 400);
  if (!payload.request || typeof payload.request !== 'object') {
    return json({ error: 'Missing request body' }, 400);
  }

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) +
    ':generateContent?key=' + encodeURIComponent(key);

  const g = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload.request),
  });

  // Pass Google's response (and status) straight back; client normalizes it.
  const text = await g.text();
  return new Response(text, {
    status: g.status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
});
