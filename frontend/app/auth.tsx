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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import {
  signInWithApple as signInApple,
  signInWithEmail as signInEmail,
  signInWithGoogle as signInGoogle,
  signUpWithEmail as signUpEmail,
  type AuthOutcome,
} from '../lib/authActions';
import { useTheme, Fonts, shadow } from '../context/ThemeContext';
import * as AppleAuthentication from 'expo-apple-authentication';
const logo = require('../assets/images/dollar-seeds-logo.png');

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
  const { t } = useTranslation('auth');
  // Keeps the heading clear of the notch / Dynamic Island on every model. The inset
  // is 0 on devices with no cutout, so the `+ 16` floor gives those a breathing gap too.
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // The flows themselves live in lib/authActions.ts, shared with the onboarding's
  // sign-up screen; this screen only turns their outcomes into alerts.
  const alertFailure = (title: string, outcome: AuthOutcome) => {
    if (outcome.status !== 'error') return;
    const fallback = outcome.reason === 'no_session' ? t('error.googleNoSession')
      : outcome.reason === 'no_token' ? t('error.appleNoToken')
      : t('error.tryAgain');
    // `message` comes from Supabase and is not localised by us.
    Alert.alert(title, outcome.message ?? fallback);
  };

  async function signUpWithEmail() {
    setLoading(true);
    try {
      const outcome = await signUpEmail(email, password);
      if (outcome.status === 'error') Alert.alert(t('error.signUpTitle'), outcome.message ?? t('error.tryAgain'));
      else if (outcome.status === 'confirm') Alert.alert(t('signUpSuccess.title'), t('signUpSuccess.body'));
    } finally {
      // Always re-enable the button, even if the request throws or the network hangs.
      setLoading(false);
    }
  }

  async function signInWithEmail() {
    setLoading(true);
    try {
      alertFailure(t('error.signInTitle'), await signInEmail(email, password));
    } finally {
      setLoading(false);
    }
  }

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      alertFailure(t('error.googleTitle'), await signInGoogle());
    } finally {
      setLoading(false);
    }
  };

  // iOS only. AuthContext's onAuthStateChange picks up the session and routes into
  // the app, same as the other providers.
  const signInWithApple = async () => {
    setLoading(true);
    try {
      const outcome = await signInApple();
      // Apple's own sheet failing (or returning no token) vs Supabase refusing the token.
      const sheetFailed = outcome.status === 'error' && (outcome.reason === 'exception' || outcome.reason === 'no_token');
      alertFailure(sheetFailed ? t('error.appleFailedTitle') : t('error.appleTitle'), outcome);
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
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={styles.header}>{t('header')}</Text>
          <View style={[styles.logoBadge, shadow(4, '#06120D')]}>
            <Image source={logo} style={styles.logo} resizeMode="contain" />
          </View>
        </View>

        <TextInput
          style={styles.input}
          onChangeText={(text) => setEmail(text)}
          value={email}
          placeholder={t('emailPlaceholder')}
          placeholderTextColor="rgba(255,255,255,0.55)"
          autoCapitalize={'none'}
        />
        <TextInput
          style={styles.input}
          onChangeText={(text) => setPassword(text)}
          value={password}
          secureTextEntry={true}
          placeholder={t('passwordPlaceholder')}
          placeholderTextColor="rgba(255,255,255,0.55)"
          autoCapitalize={'none'}
        />

        <View style={styles.buttonContainer}>
          <AuthButton label={t('createAccount')} onPress={signUpWithEmail} disabled={loading} />
          <AuthButton label={loading ? t('loading') : t('signIn')} onPress={signInWithEmail} disabled={loading} />
          <AuthButton label={t('google')} onPress={signInWithGoogle} disabled={loading} />
          {/* Sign in with Apple — iOS only. Uses Apple's own button component (a
              custom-styled one risks a design rejection). Note: Apple's HIG suggests
              placing this at least as prominently as other providers. */}
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={styles.appleButton}
              onPress={signInWithApple}
            />
          )}
        </View>

        {/* Back to the onboarding for someone who landed here without an account. */}
        <Pressable
          onPress={() => router.replace('/onboarding' as any)}
          hitSlop={10}
          accessibilityRole="link"
          style={({ pressed }) => [styles.newHere, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.newHereText}>{t('newHere')}</Text>
        </Pressable>
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
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 32,
  },
  header: {
    flex: 1,
    fontFamily: Fonts.serif,
    fontSize: 34,
    lineHeight: 40,
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
  newHere: {
    alignSelf: 'center',
    marginTop: 28,
    paddingVertical: 8,
  },
  newHereText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
  logoBadge: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: 98,
    height: 98,
  },
});
