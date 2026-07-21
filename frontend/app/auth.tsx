import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase'; // Adjust this path if you put it in a different folder!
import { useTheme, Fonts, shadow } from '../context/ThemeContext';
const logo = require('../assets/images/dollar-seeds-logo.png');
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';

WebBrowser.maybeCompleteAuthSession();

// ─── Local white "account" button ───────────────────────────────────────────
function AuthButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        shadow(3, '#06120D'),
        { opacity: pressed || disabled ? 0.8 : 1 },
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export default function AuthScreen() {
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // The Sign Up Function
  async function signUpWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email,
      password: password,
    });

    if (error) Alert.alert("Error signing up", error.message);
    else Alert.alert("Success!", "Check your email for the confirmation link!");
    setLoading(false);
  }

  // The Log In Function
  async function signInWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) Alert.alert("Error logging in", error.message);
    setLoading(false);
  }

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
        // 1. Tell Google exactly where to return to after the login finishes
        const redirectTo = makeRedirectUri();

        // 2. Ask Supabase for the secure Google Login page URL. The client is
        // configured with flowType: 'pkce' (see lib/supabase.ts), so this URL's
        // callback carries a one-time `code` rather than tokens in the fragment.
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectTo,
                skipBrowserRedirect: true, // Crucial: We want Expo to open the browser, not Supabase
            },
        });

        if (error || !data?.url) {
            console.error("OAuth Error:", error);
            Alert.alert('Error signing in with Google', error?.message ?? 'Please try again.');
            return;
        }

        // 3. Pop open the phone's web browser to the Google login screen
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

        if (res.type !== 'success') {
            // User closed the browser or cancelled — not an error, just no session.
            return;
        }

        // 4. Hand the full callback URL to Supabase so it can exchange the PKCE
        // `code` for a session using the verifier it stored when signInWithOAuth
        // was called above. This sets and persists the session itself — no manual
        // token parsing — and AuthContext's onAuthStateChange picks it up from there.
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(res.url);
        if (exchangeError) {
            console.error('OAuth session exchange error:', exchangeError);
            Alert.alert('Error signing in with Google', exchangeError.message);
        }
    } finally {
        setLoading(false);
    }
};

  // The Apple Sign In Function (iOS only). Native flow: Apple returns a signed
  // identity token, which Supabase verifies directly via signInWithIdToken — no
  // browser redirect, no URL parsing. AuthContext's onAuthStateChange picks up the
  // resulting session and routes into the app, same as the other providers.
  const signInWithApple = async () => {
    setLoading(true);
    try {
        const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
                AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
        });

        if (!credential.identityToken) {
            throw new Error('No identity token returned from Apple.');
        }

        const { error } = await supabase.auth.signInWithIdToken({
            provider: 'apple',
            token: credential.identityToken,
        });

        if (error) {
            console.error('Apple sign-in error:', error);
            Alert.alert('Error signing in with Apple', error.message);
            return;
        }

        // Apple only returns the user's name on the FIRST authorization — the identity
        // token never carries it. Persist it now (into user metadata) or it's lost for good.
        if (credential.fullName?.givenName || credential.fullName?.familyName) {
            const full_name = [credential.fullName?.givenName, credential.fullName?.familyName]
                .filter(Boolean)
                .join(' ');
            if (full_name) await supabase.auth.updateUser({ data: { full_name } });
        }
    } catch (e: any) {
        // User tapped "Cancel" in the Apple sheet — not an error, just no session.
        if (e?.code === 'ERR_REQUEST_CANCELED') return;
        console.error('Apple sign-in exception:', e);
        Alert.alert('Apple sign-in failed', e?.message ?? 'Please try again.');
    } finally {
        setLoading(false);
    }
};

  return (
    <LinearGradient
      colors={[theme.brand, theme.brand, theme.brand2]}
      locations={[0, 0.5, 1]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.header}>Welcome to DollarSeeds</Text>

        <TextInput
          style={styles.input}
          onChangeText={(text) => setEmail(text)}
          value={email}
          placeholder="Email"
          placeholderTextColor="rgba(255,255,255,0.55)"
          autoCapitalize={'none'}
        />
        <TextInput
          style={styles.input}
          onChangeText={(text) => setPassword(text)}
          value={password}
          secureTextEntry={true}
          placeholder="Password"
          placeholderTextColor="rgba(255,255,255,0.55)"
          autoCapitalize={'none'}
        />

        <View style={styles.buttonContainer}>
          {/* Sign in with Apple — iOS only. Apple's HIG asks for it to be at least as
              prominent as other providers, so it leads the stack. Uses Apple's own
              button component (a custom-styled one risks a design rejection). */}
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={styles.appleButton}
              onPress={signInWithApple}
            />
          )}
          <AuthButton label="Create Account" onPress={signUpWithEmail} disabled={loading} />
          <AuthButton label="Sign in/up with Google" onPress={signInWithGoogle} disabled={loading} />
          <AuthButton label={loading ? "Loading..." : "Sign In"} onPress={signInWithEmail} disabled={loading} />
        </View>

        <View style={styles.logoWrap}>
          <View style={[styles.logoBadge, shadow(4, '#06120D')]}>
            <Image source={logo} style={styles.logo} resizeMode="contain" />
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    fontFamily: Fonts.serif,
    fontSize: 52,
    lineHeight: 56,
    textAlign: 'center',
    marginBottom: 40,
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
    fontFamily: Fonts.sans,
    color: '#FFFFFF',
  },
  buttonContainer: {
    marginTop: 12,
    gap: 16,
  },
  appleButton: {
    width: '100%',
    height: 52,
  },
  button: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    color: '#111111',
  },
  logoWrap: {
    alignItems: 'center',
    marginTop: 48,
  },
  logoBadge: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: 172,
    height: 172,
  },
});
