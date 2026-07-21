import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vbvsblpyeylnemrecyqv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZidnNibHB5ZXlsbmVtcmVjeXF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NDM4MjIsImV4cCI6MjA5MjIxOTgyMn0.BiOl2LjzICGMmyu6Ssw_Zq4v9do4zK9J5caa92E2Zss';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // React Native has no browser location bar for Supabase to inspect, so automatic
    // URL detection is off — the OAuth redirect URL is instead handed explicitly to
    // exchangeCodeForSession() (see signInWithGoogle in app/auth.tsx). PKCE means that
    // exchange trades a `code` for a session server-side, instead of a token sitting
    // in a redirect URL for us to parse by hand.
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});