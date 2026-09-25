import { AntDesign, Feather, FontAwesome } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '../../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function RegisterScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Helper function to direct users after successful authentication
  const navigateBasedOnRole = async (userId: string) => {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      // New registered user via OAuth might not have a role set yet
      router.replace('/role-selection');
      return;
    }

    const userRole = profile.role;

    switch (userRole) {
      case 'Personal':
        router.replace('/(personalTabs)/home');
        break;
      case 'Spender':
        router.replace('/(spenderTabs)/home');
        break;
      case 'Sponsor':
        router.replace('/(sponsorTabs)/home');
        break;
      default:
        router.replace('/role-selection');
        break;
    }
  };

  // 1. Email/Password Signup Handler
  const handleRegister = async () => {
    const trimmedEmail = email.trim();
    const trimmedFullName = fullName.trim();

    if (!trimmedFullName || !trimmedEmail || !password || !confirmPassword) {
      Alert.alert("Error", "Please fill out all fields.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: password,
        options: {
          data: {
            full_name: trimmedFullName,
          },
        },
      });

      if (error) {
        Alert.alert("Signup Failed", error.message);
      } else {
        // Kung na-authenticate na dayon ang user (depende sa Supabase settings nimo)
        if (data?.user) {
          await navigateBasedOnRole(data.user.id);
        } else {
          router.replace('/role-selection');
        }
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  // 2. OAuth URL Parser for Query and Hash Fragments
  const createSessionFromUrl = async (url: string) => {
    const parsed = Linking.parse(url);
    let params: Record<string, any> = parsed.queryParams || {};

    if (url.includes('#')) {
      const hashString = url.split('#')[1];
      const hashParams = new URLSearchParams(hashString);

      if (!params.access_token) params.access_token = hashParams.get('access_token');
      if (!params.refresh_token) params.refresh_token = hashParams.get('refresh_token');
      if (!params.code) params.code = hashParams.get('code');
    }

    if (params.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(params.code as string);
      if (error) throw error;
      return;
    }

    if (params.access_token && params.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: params.access_token as string,
        refresh_token: params.refresh_token as string,
      });
      if (error) throw error;
      return;
    }

    throw new Error('Authentication parameters were not returned. Check your Supabase Redirect URLs.');
  };

  // 3. Reusable OAuth Handler
  const performOAuthLogin = async (provider: 'google' | 'facebook') => {
    setIsLoading(true);
    try {
      const redirectTo = Linking.createURL('/login');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

        if (res.type === 'success' && res.url) {
          await createSessionFromUrl(res.url);

          const { data: authUser } = await supabase.auth.getUser();
          if (authUser?.user) {
            await navigateBasedOnRole(authUser.user.id);
          }
        }
      }
    } catch (e: any) {
      Alert.alert("Authentication Error", e.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.headerContainer}>
            <Text style={styles.title}>
              Create an <Text style={styles.brandText}>Account</Text>
            </Text>
            <Text style={styles.subtitle}>
              Sign up with your email and password to continue.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputWrapper}>
              <Feather name="user" color="#085334" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                placeholderTextColor="#A0AEC0"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Feather name="mail" color="#085334" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor="#A0AEC0"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Feather name="lock" color="#085334" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#A0AEC0"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!isLoading}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
                disabled={isLoading}
              >
                <Feather name={showPassword ? 'eye-off' : 'eye'} color="#718096" size={20} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputWrapper}>
              <Feather name="lock" color="#085334" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor="#A0AEC0"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!isLoading}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
                disabled={isLoading}
              >
                <Feather name={showPassword ? 'eye-off' : 'eye'} color="#718096" size={20} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={[styles.primaryButton, isLoading && { opacity: 0.8 }]} 
              onPress={handleRegister}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.buttonText}>Sign Up</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.dividerContainer}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>Or</Text>
                      <View style={styles.dividerLine} />
                    </View>

          <View style={styles.socialContainer}>
            <TouchableOpacity 
              style={[styles.socialButton, isLoading && { opacity: 0.8 }]} 
              onPress={() => performOAuthLogin('google')}
              disabled={isLoading}
            >
              <AntDesign name="google" size={20} color="#EA4335" style={styles.socialIcon} />
              <Text style={styles.socialButtonText}>Continue with Google</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.socialButton, isLoading && { opacity: 0.8 }]} 
              onPress={() => performOAuthLogin('facebook')}
              disabled={isLoading}
            >
              <FontAwesome name="facebook" size={20} color="#1877F2" style={styles.socialIcon} />
              <Text style={styles.socialButtonText}>Continue with Facebook</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/login')} disabled={isLoading}>
              <Text style={styles.linkText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: { 
    flexGrow: 1, 
    paddingHorizontal: 28, 
    justifyContent: 'center',
    paddingVertical: 20,
  },
  headerContainer: { 
    marginBottom: 40,
  },
  title: { 
    fontSize: 34, 
    fontWeight: 'bold', 
    color: '#000000', 
    lineHeight: 42,
    marginBottom: 12, 
  },
  brandText: {
    color: '#276916', 
  },
  subtitle: { 
    fontSize: 13, 
    color: '#0e9b59',
    lineHeight: 18,
  },
  form: { 
    width: '100%', 
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f5ef',
    borderRadius: 30, 
    paddingHorizontal: 20,
    height: 58,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1A202C',
    height: '100%',
  },
  eyeIcon: {
    padding: 4,
  },
  primaryButton: {
    backgroundColor: '#204d3a',
    borderRadius: 30,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#15492f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonText: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    fontWeight: '600',
  },
dividerContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  marginVertical: 20,
},
dividerLine: {
  flex: 1,
  height: 1,
  backgroundColor: '#E2E8F0', // Light border color matching your social buttons
},
dividerText: {
  color: '#0c9c6c',
  fontSize: 14,
  marginHorizontal: 12, // Spacing between lines and text
},
  socialContainer: {
    gap: 12,
    marginBottom: 32,
  },
  socialButton: {
    backgroundColor: '#f3fdec',
    borderRadius: 30,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  socialIcon: {
    marginRight: 10,
  },
  socialButtonText: {
    color: '#1A202C',
    fontSize: 15,
    fontWeight: '500',
  },
  footer: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  footerText: { 
    color: '#3e973b', 
    fontSize: 14,
  },
  linkText: { 
    color: '#07756c',
    fontWeight: 'bold', 
    fontSize: 14,
  },
});