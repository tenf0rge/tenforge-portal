import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cookieStorage = {
  getItem(key) {
    const cookie = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${encodeURIComponent(key)}=`));
    return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : null;
  },
  setItem(key, value) {
    document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; domain=.tenforge.dev; path=/; SameSite=Lax; Secure`;
  },
  removeItem(key) {
    document.cookie = `${encodeURIComponent(key)}=; domain=.tenforge.dev; path=/; SameSite=Lax; Secure; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  },
};

const supabase = createClient(window.__SUPABASE_URL__, window.__SUPABASE_ANON_KEY__, {
  auth: {
    storage: cookieStorage,
    storageKey: 'tenforge-auth-token',
    autoRefreshToken: true,
    persistSession: true,
  },
});

export { supabase };
