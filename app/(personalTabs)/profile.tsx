// app/(personalTabs)/profile.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { supabase } from '../../lib/supabase';

export const colors = {
  headerDark: '#1F4F59',  
  headerDarker: '#173D45', 
  primary: '#3AA39F',      
  primaryTint: '#e9fcfb',
  cyan: '#9be5d9',
  olive: '#7EA00E',
  oliveTint: '#F3F6E4',    
  yellowGreen: '#DCD964',
  positive: '#0E7C5A',
  positiveBg: '#E1F5EC',
  danger: '#DC2626',
  textDark: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  border: '#E2E8F0',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  background: '#F8FAFC',
  overlay: 'rgba(9, 20, 19, 0.5)',
};

export default function PersonalProfileScreen() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError || new Error("No active user session found.");

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, role, avatar_url')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      if (profile) {
        setFullName(profile.full_name || '');
        setRole(profile.role || 'Personal');
        setAvatarUrl(profile.avatar_url || null);
      }
    } catch (error: any) {
      Alert.alert("Profile Error", error.message);
    } finally {
      setIsLoadingProfile(false);
      setIsRefreshing(false);
    }
  };

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchProfile();
  };

  const handleLogout = async () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to exit your session?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            setIsLoggingOut(true);
            try {
              const { data: { user } } = await supabase.auth.getUser();

              if (user) {
                await supabase.from('logs').insert({
                  user_id: user.id,
                  action: 'USER_LOGOUT',
                  details: `${user.email} successfully signed out.`,
                });
              }

              const { error } = await supabase.auth.signOut();
              if (error) throw error;

              router.replace('/');
            } catch (error: any) {
              Alert.alert("Error", error.message);
            } finally {
              setIsLoggingOut(false);
            }
          }
        }
      ]
    );
  };

  if (isLoadingProfile) {
    return (
      <View style={[styles.container, styles.centerLoading]}>
        <StatusBar style="light" />
        <ActivityIndicator size="small" color="#3AA39F" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.modernHeader}>
        <TouchableOpacity style={styles.backBtnTouchable} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Account</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={isRefreshing} 
            onRefresh={onRefresh} 
            tintColor="#3AA39F" 
            colors={['#3AA39F']} 
          />
        }
      >
        <View style={styles.modernHeroBlock}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.heroAvatar} />
          ) : (
            <View style={styles.heroAvatarPlaceholder}>
              <Text style={styles.avatarInitials}>{fullName ? fullName.charAt(0).toUpperCase() : 'U'}</Text>
            </View>
          )}
          <Text style={styles.heroName}>{fullName || "User Account"}</Text>
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>{role ? role.toUpperCase() : "USER"}</Text>
          </View>
        </View>

        <View style={styles.modernCardGroup}>
          <Text style={styles.groupContextLabel}>Account & Security</Text>
          <View style={styles.groupCard}>
            {[
              { id: 'personal', label: 'Personal Details', icon: 'person-outline', action: () => router.push('/profile/personal' as any) },
              { id: 'password', label: 'Change Password', icon: 'shield-checkmark-outline', action: () => router.push('/profile/change-password' as any) },
              { id: 'logs', label: 'Activity Logs', icon: 'list-outline', action: () => router.push('/profile/logs' as any) },
            ].map((item, index, arr) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.rowItemFlat, index !== arr.length - 1 && styles.rowDivider]}
                onPress={item.action}
              >
                <View style={styles.modernRowLeft}>
                  <View style={styles.iconWrapperSquare}>
                    <Ionicons name={item.icon as any} size={18} color="#000000" />
                  </View>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#173D45" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.modernCardGroup}>
          <Text style={styles.groupContextLabel}>Data Ledger</Text>
          <View style={styles.groupCard}>
            {[
              { id: 'archive', label: 'Archive Data', icon: 'archive-outline', action: () => router.push('/profile/archive' as any) },
              { id: 'export', label: 'Export Data', icon: 'cloud-download-outline', action: () => router.push('/profile/export' as any) },
            ].map((item, index, arr) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.rowItemFlat, index !== arr.length - 1 && styles.rowDivider]}
                onPress={item.action}
              >
                <View style={styles.modernRowLeft}>
                  <View style={styles.iconWrapperSquare}>
                    <Ionicons name={item.icon as any} size={18} color="#000000" />
                  </View>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#173D45" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.modernCardGroup}>
          <Text style={styles.groupContextLabel}>Support & Info</Text>
          <View style={styles.groupCard}>
            {[
              { id: 'help', label: 'Help Desk', icon: 'chatbubbles-outline', action: () => router.push('/profile/help' as any) },
              { id: 'terms', label: 'Terms of Use', icon: 'document-attach-outline', action: () => router.push('/profile/terms' as any) },
              { id: 'about', label: 'App Version', icon: 'information-circle-outline', action: () => router.push('/profile/about' as any) },
            ].map((item, index, arr) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.rowItemFlat, index !== arr.length - 1 && styles.rowDivider]}
                onPress={item.action}
              >
                <View style={styles.modernRowLeft}>
                  <View style={styles.iconWrapperSquare}>
                    <Ionicons name={item.icon as any} size={18} color="#000000" />
                  </View>
                  <Text style={styles.rowPrimaryLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#173D45" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.modernLogoutBtn, isLoggingOut && styles.disabledButton]} 
          onPress={handleLogout} 
          disabled={isLoggingOut}
        >
          {isLoggingOut ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
              <Text style={styles.modernLogoutText}>Log Out</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f5fcfa',
    borderRadius: 12,
  },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 110 },
  modernHeader: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 44 : 20,
    paddingBottom: 20,
    backgroundColor: colors.headerDark,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backBtnTouchable: { width: 20 },
  headerTitleCentered: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '800', color: '#ffffff', letterSpacing: -0.5 },
  modernHeroBlock: { alignItems: 'center', marginTop: 30, marginBottom: 15 },
  heroAvatar: { width: 88, height: 88, borderRadius: 28, backgroundColor: '#E2E8F0' },
  heroAvatarPlaceholder: { width: 88, height: 88, borderRadius: 28, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 26, fontWeight: '600', color: '#475569' },
  heroName: { fontSize: 22, fontWeight: '700', color: '#1E293B', marginTop: 14, letterSpacing: -0.5 },
  badgeContainer: { backgroundColor: '#ffffff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 11, marginTop: 8, borderWidth: 1, borderColor: '#0E7C5A' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#0E7C5A', letterSpacing: 0.5 },
  modernCardGroup: { paddingHorizontal: 20, marginTop: 24 },
  groupContextLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5, paddingLeft: 4 },
  modernRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 },
  iconWrapperSquare: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  rowPrimaryLabel: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderColor: '#E2E8F0',
    borderWidth: 1,
    shadowColor: '#0F172A',
    overflow: 'hidden',
  },
  rowItemFlat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderBottomWidth: 3,
    borderBottomColor: '#F1F5F9',
  },
  modernLogoutBtn: {
    backgroundColor: '#FEF2F2', 
    borderRadius: 24,              
    padding: 18,                     
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffb8b8',       
    marginTop: 30,          
    marginHorizontal: 24,      
  },
  modernLogoutText: {
    color: '#EF4444',          
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  disabledButton: { 
    backgroundColor: '#F1F5F9', 
    borderColor: '#E2E8F0' 
  },
});