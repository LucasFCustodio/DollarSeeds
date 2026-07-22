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
    // URL detection is off — signInWithGoogle (app/auth.tsx) reads the redirect URL
    // itself. We use the implicit flow: Supabase returns the session tokens in the
    // redirect fragment and we hand them to setSession(). The PKCE code-exchange flow
    // was unreliable in this native split-browser setup (it failed with "invalid flow
    // state, no valid flow state found"); implicit is the flow Supabase's React Native
    // guide uses for exactly this case.
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
});