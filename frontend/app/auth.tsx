import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
} from 'react-native';
import { Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase'; // Adjust this path if you put it in a different folder!
import { useTheme, Fonts, shadow } from '../context/ThemeContext';
const logo = require('../assets/images/dollar-seeds-logo.png');
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

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
    // 1. Tell Google exactly where to return to after the login finishes
    const redirectTo = makeRedirectUri();

    console.log("EXPO REDIRECT URL IS:", redirectTo);

    // 2. Ask Supabase for the secure Google Login page URL
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: redirectTo,
            skipBrowserRedirect: true, // Crucial: We want Expo to open the browser, not Supabase
        },
    });

    if (error || !data?.url) {
        console.error("OAuth Error:", error);
        return;
    }

    // 3. Pop open the phone's web browser to the Google login screen
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    // 4. When the browser closes, grab the secure tokens it brought back
    if (res.type === 'success') {
        const url = res.url;

        // Extract the raw tokens from the returned URL string
        const access_token = url.split("access_token=")[1]?.split("&")[0];
        const refresh_token = url.split("refresh_token=")[1]?.split("&")[0];

        if (access_token && refresh_token) {
            // Hand the VIP pass directly to Supabase.
            // Your AuthContext will instantly detect this and kick the router into gear!
            await supabase.auth.setSession({
                access_token,
                refresh_token
            });
        }
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
