// app/logs.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { colors } from '../(spenderTabs)/profile'; // Adjust import path if needed
import { supabase } from '../../lib/supabase'; // Adjust import path to your supabase client

interface LogItem {
  id: string;
  action: string;
  details: string;
  created_at: string;
}

export default function ActivityLogsScreen() {
  const router = useRouter();
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Function to fetch logs from Supabase
  const fetchLogs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching logs:', error.message);
      } else if (data) {
        setLogs(data);
      }
    } catch (err) {
      console.error('Unexpected error fetching logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchLogs();
  }, []);

  // Helper to map log actions to appropriate Ionicons and readable titles
  const getLogMeta = (action: string) => {
    switch (action) {
      case 'USER_LOGIN':
      case 'OAUTH_LOGIN':
        return { title: 'User Login', icon: 'log-in-outline' };
      case 'USER_LOGOUT':
        return { title: 'User Logout', icon: 'log-out-outline' };
      case 'PASSWORD_UPDATE':
        return { title: 'Password Updated', icon: 'key-outline' };
      case 'UPDATE_PROFILE':
        return { title: 'Profile Updated', icon: 'person-outline' };
      case 'UPDATE_AVATAR':
        return { title: 'Avatar Updated', icon: 'image-outline' };
      default:
        return { title: action.replace(/_/g, ' '), icon: 'document-text-outline' };
    }
  };

  // Helper to replace any standard email address string with "You"
  const anonymizeEmail = (text: string) => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    return text.replace(emailRegex, 'You');
  };

  // Format timestamp nicely
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Filter logs based on search query
  const filteredLogs = logs.filter((item) => {
    const meta = getLogMeta(item.action);
    const query = searchQuery.toLowerCase();
    const processedDetails = anonymizeEmail(item.details).toLowerCase();
    return (
      meta.title.toLowerCase().includes(query) ||
      processedDetails.includes(query) ||
      item.action.toLowerCase().includes(query)
    );
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Modern Curved Header */}
      <View style={styles.modernHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnTouchable}>
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered}>Activity Logs</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#204d3a" />
        }
      >
        {/* Search Input Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color="#94A3B8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search activity logs..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.sectionLabel}>Recent System Transactions</Text>
        
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#204d3a" />
          </View>
        ) : filteredLogs.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="file-tray-outline" size={48} color="#94A3B8" />
            <Text style={styles.emptyText}>
              {searchQuery ? 'No matching activity logs found.' : 'No activity logs found.'}
            </Text>
          </View>
        ) : (
          filteredLogs.map((item) => {
            const meta = getLogMeta(item.action);
            return (
              <View key={item.id} style={styles.logCard}>
                <View style={styles.iconCircle}>
                  <Ionicons name={meta.icon as any} size={20} color="#173D45" />
                </View>
                <View style={styles.logInfo}>
                  <View style={styles.logHeaderRow}>
                    <Text style={styles.logTitle}>{meta.title}</Text>
                    <Text style={styles.logTime}>{formatTimestamp(item.created_at)}</Text>
                  </View>
                  <Text style={styles.logDesc}>{anonymizeEmail(item.details)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f5fcfa',
  },
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
  headerTitleCentered: { 
    flex: 1, 
    textAlign: 'center', 
    fontSize: 20, 
    fontWeight: '800', 
    color: '#ffffff', 
    letterSpacing: -0.5 
  },
  scrollContent: { 
    paddingHorizontal: 24, 
    paddingTop: 24, 
    paddingBottom: 40,
    flexGrow: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
  },
  sectionLabel: { 
    fontSize: 12, 
    fontWeight: '700', 
    color: '#94A3B8', 
    textTransform: 'uppercase', 
    marginBottom: 16, 
    letterSpacing: 0.5 
  },
  centerContainer: {
    paddingVertical: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  logCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 16, 
    borderRadius: 20, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#EBF6F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  logInfo: {
    flex: 1,
  },
  logHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logTitle: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: '#1E293B', 
  },
  logTime: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  logDesc: { 
    fontSize: 13, 
    color: '#64748B', 
    lineHeight: 18 
  },
});