import React, { useState } from 'react';
import { Alert, StyleSheet, View, Text, TextInput } from 'react-native';
import { supabase } from '../lib/supabase'; // Adjust this path if you put it in a different folder!
import Button from '../components/ui/Button';

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
            label={loading ? "Loading..." : "Sign In"}
            rgbaColor="#1ca8eb"
            width="100%"
            padding="12"
            font="16"
            onPress={signInWithEmail}
        />
        <View style={styles.spacer} />
        <Button 
            label="Create Account"
            rgbaColor="#6c757d"
            width="100%"
            padding="12"
            font="16"
            onPress={signUpWithEmail}
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