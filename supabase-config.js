/* Supabase project config. Safe to commit: the publishable/anon key is
   meant to be public — Row Level Security (see supabase/schema.sql) is
   what actually decides who can read/write. Never put a secret /
   service_role key here. */
window.SUPABASE_CONFIG = {
  url: 'https://knldeduzioqhsxdhfijz.supabase.co',
  anonKey: 'sb_publishable_bjUHeL1xh2VOF0xx7kd-jQ_cyQBKefl'
};
