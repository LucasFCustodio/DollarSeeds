import React, { useState } from 'react';
import { Alert, StyleSheet, View, Text, TextInput } from 'react-native';
import { supabase } from '../lib/supabase'; // Adjust this path if you put it in a different folder!
import Button from '../components/ui/Button';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
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
    <View style={styles.container}>
      <Text style={styles.header}>Welcome to DollarSeeds</Text>
      
      <TextInput
        style={styles.input}
        onChangeText={(text) => setEmail(text)}
        value={email}
        placeholder="Email"
        autoCapitalize={'none'}
      />
      <TextInput
        style={styles.input}
        onChangeText={(text) => setPassword(text)}
        value={password}
        secureTextEntry={true}
        placeholder="Password"
        autoCapitalize={'none'}
      />
      
      <View style={styles.buttonContainer}>
        <Button 
            label="Create Account"
            rgbaColor="#1ca8eb"
            width="100%"
            padding="12"
            font="16"
            onPress={signUpWithEmail}
        />
        <View style={styles.spacer} />
        <Button 
            label="Sign in/up with Google"
            rgbaColor="#ff9d5c" // Classic Google Red
            width="100%"
            padding="15"
            font="16"
            onPress={signInWithGoogle}
        />
        <Button 
            label={loading ? "Loading..." : "Sign In"}
            rgbaColor="#ff9d5c"
            width="100%"
            padding="12"
            font="16"
            onPress={signInWithEmail}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 40,
    color: '#212529',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
  },
  buttonContainer: {
    marginTop: 10,
  },
  spacer: {
    height: 15,
  }
});