// app/(sponsorTabs)/allowance.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../lib/supabase';

/* ---------- Design Tokens — aligned with the rest of the app's teal palette ---------- */
const COLORS = {
  screenTeal: '#1F4F59',
  brand: '#173D45',
  surface: '#FFFFFF',
  pillBg: '#F1F5F9',
  softTint: '#F3F7F6',
  ink: '#173D45',
  inkSoft: '#64748B',
  muted: '#94A3B8',
  danger: '#EF4444',
  dangerSoft: '#FEF2F2',
  green: '#77f3a54b',
  pendingSoft: '#FEF9C3',
  pendingText: '#A16207',
};

const CARD_THEMES = [
  { bg: '#EAF6F7', text: '#1F4F59' },
  { bg: '#F4F8E8', text: '#213502' },
  { bg: '#FAFAD8', text: '#213502' },
];

const getLocalDateString = (year: number, monthIndex: number, day: number) => {
  const d = new Date(year, monthIndex, day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${date}`;
};

const getPeriodDates = (period: 'today' | 'week' | 'nextWeek' | 'month' | 'nextMonth') => {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();

  if (period === 'today') {
    const todayStr = getLocalDateString(year, month, day);
    return { start: todayStr, end: todayStr };
  } 
  
  if (period === 'week') {
    const currentDayOfWeek = d.getDay();
    const startOfWeek = new Date(year, month, day - currentDayOfWeek);
    const endOfWeek = new Date(year, month, day + (6 - currentDayOfWeek));

    return {
      start: getLocalDateString(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate()),
      end: getLocalDateString(endOfWeek.getFullYear(), endOfWeek.getMonth(), endOfWeek.getDate())
    };
  }

  if (period === 'nextWeek') {
    const currentDayOfWeek = d.getDay();
    const startOfNextWeek = new Date(year, month, day + (7 - currentDayOfWeek));
    const endOfNextWeek = new Date(year, month, day + (13 - currentDayOfWeek));

    return {
      start: getLocalDateString(startOfNextWeek.getFullYear(), startOfNextWeek.getMonth(), startOfNextWeek.getDate()),
      end: getLocalDateString(endOfNextWeek.getFullYear(), endOfNextWeek.getMonth(), endOfNextWeek.getDate())
    };
  }
  
  if (period === 'month') {
    const startOfMonth = getLocalDateString(year, month, 1);
    const endOfMonth = getLocalDateString(year, month + 1, 0);
    return { start: startOfMonth, end: endOfMonth };
  }

  // nextMonth
  const startOfNextMonth = getLocalDateString(year, month + 1, 1);
  const endOfNextMonth = getLocalDateString(year, month + 2, 0);
  return { start: startOfNextMonth, end: endOfNextMonth };
};

interface SelectedSpender {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

interface SpenderMember {
  id: string;
  spender_id: string;
  name: string;
  email: string;
  status: string;
  avatarUrl?: string | null;
}

export default function AllowanceScreen() {
  const router = useRouter();

  const [selectedSpender, setSelectedSpender] = useState<SelectedSpender | null>(null);
  const [allowanceName, setAllowanceName] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Modal State for Member Selection
  const [modalVisible, setModalVisible] = useState(false);
  const [connectedMembers, setConnectedMembers] = useState<SpenderMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Period Selector State (Default: 'today')
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'nextWeek' | 'month' | 'nextMonth'>('today');

  const defaultPeriodDates = getPeriodDates('today');
  const [startDate, setStartDate] = useState(defaultPeriodDates.start);
  const [endDate, setEndDate] = useState(defaultPeriodDates.end);

  // Reset state whenever the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      setAllowanceName('');
      setAmount('');
      setSelectedSpender(null);
      setSelectedPeriod('today');
      const defaultDates = getPeriodDates('today');
      setStartDate(defaultDates.start);
      setEndDate(defaultDates.end);
      setModalVisible(false);
    }, [])
  );

  // Fetch connected members for the modal list
  const fetchConnectedMembers = async () => {
    try {
      setLoadingMembers(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('sponsor_spenders')
        .select(`
          id, status, spender_id,
          profiles!spender_id ( full_name, email, avatar_url )
        `)
        .eq('sponsor_id', user.id);

      if (error) throw error;

      const formattedMembers = (data || []).map((item: any) => ({
        id: item.id,
        spender_id: item.spender_id,
        name: item.profiles?.full_name || 'No Name',
        email: item.profiles?.email || 'No Email',
        avatarUrl: item.profiles?.avatar_url || null,
        status: item.status
      }));

      setConnectedMembers(formattedMembers);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to fetch members.");
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleOpenMemberModal = () => {
    fetchConnectedMembers();
    setModalVisible(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setAllowanceName('');
    setAmount('');
    setSelectedSpender(null);
    setSelectedPeriod('today');
    const defaultDates = getPeriodDates('today');
    setStartDate(defaultDates.start);
    setEndDate(defaultDates.end);
    setRefreshing(false);
  };

  const handleSaveAllowance = async () => {
    if (!selectedSpender) {
      Alert.alert("Member Required", "Please select a member first.");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (!allowanceName.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Required Fields", "Please provide a valid name and positive amount.");
      return;
    }

    if (!startDate.trim() || !endDate.trim()) {
      Alert.alert("Required Dates", "Please provide both start and end dates.");
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        sponsor_id: user.id,
        spender_id: selectedSpender.id,
        allowance_name: allowanceName.trim(),
        amount: parsedAmount,
        start_date: startDate,
        end_date: endDate
      };

      const { error } = await supabase
        .from('allowances')
        .insert([payload]);

      if (error) throw error;
      Alert.alert("Success 🎉", "Allowance allocated successfully!");
      router.replace('/(sponsorTabs)/home');
    } catch (e: any) { 
      Alert.alert("Error", e.message); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <View style={styles.screenBg}>
      <StatusBar style="light" />

      {/* White rounded sheet */}
      <View style={styles.whiteSheet}>
        <ScrollView 
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.brand]} tintColor={COLORS.brand} />
          }
        >
          {/* Page Header with Back Button beside the title */}
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.inlineBackButton} 
              activeOpacity={0.7} 
              onPress={() => router.replace('/(sponsorTabs)/home')}
            >
              <Ionicons name="arrow-back" size={20} color={COLORS.brand} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Set Allowance</Text>
              <Text style={styles.mainSubtitle}>Select a spender and allocate allowance.</Text>
            </View>
          </View>

          {/* Target Member */}
          <Text style={styles.sectionTitle}>Target Member</Text>
          {selectedSpender ? (
            <View style={styles.selectedSpenderCard}>
              <View style={styles.avatarContainer}>
                {selectedSpender.avatarUrl ? (
                  <Image source={{ uri: selectedSpender.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={16} color={COLORS.brand} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.spenderName}>{selectedSpender.name}</Text>
                <Text style={styles.spenderEmail}>{selectedSpender.email || 'Beneficiary'}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedSpender(null)} style={styles.removeButton}>
                <Ionicons name="close" size={16} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.selectMemberButton} activeOpacity={0.7} onPress={handleOpenMemberModal}>
              <View style={styles.addCircleOutline}>
                <Ionicons name="add" size={26} color={COLORS.brand} />
              </View>
              <Text style={styles.selectMemberText}>Select a Member to Allocate</Text>
            </TouchableOpacity>
          )}

          {/* Allowance Details */}
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Allowance Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Allowance Name</Text>
            <TextInput 
              style={styles.pillInput} 
              value={allowanceName} 
              onChangeText={setAllowanceName} 
              placeholder="e.g. Weekly Allowance" 
              placeholderTextColor={COLORS.muted} 
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Amount (PHP)</Text>
            <View style={styles.amountWrapper}>
              <Text style={styles.currencyPrefix}>₱</Text>
              <TextInput 
                style={[styles.pillInput, styles.amountInput]} 
                keyboardType="decimal-pad" 
                value={amount} 
                onChangeText={setAmount} 
                placeholder="0.00" 
                placeholderTextColor={COLORS.muted} 
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Coverage Period</Text>
            
            {/* Period Selector Grid/Rows */}
            <View style={styles.periodSelectorContainer}>
              {[
                { key: 'today', label: 'Today' },
                { key: 'week', label: 'This Week' },
                { key: 'nextWeek', label: 'Next Week' },
                { key: 'month', label: 'This Month' },
                { key: 'nextMonth', label: 'Next Month' },
              ].map((item) => {
                const isActive = selectedPeriod === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.periodPill, isActive && styles.periodPillActive]}
                    activeOpacity={0.8}
                    onPress={() => {
                      setSelectedPeriod(item.key as any);
                      const dates = getPeriodDates(item.key as any);
                      setStartDate(dates.start);
                      setEndDate(dates.end);
                    }}
                  >
                    <Text style={[styles.periodPillText, isActive && styles.periodPillTextActive]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Active Date Range Indicator */}
            <View style={styles.dateRangeIndicator}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.inkSoft} />
              <Text style={styles.dateRangeIndicatorText}>
                {startDate} to {endDate}
              </Text>
            </View>
          </View>

          {/* Primary Action Button */}
          <TouchableOpacity style={styles.saveButton} activeOpacity={0.85} onPress={handleSaveAllowance} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Confirm Allocation</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Connected Members Selection Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Member</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={20} color={COLORS.brand} />
              </TouchableOpacity>
            </View>

            {loadingMembers ? (
              <ActivityIndicator size="large" color={COLORS.brand} style={{ marginVertical: 40 }} />
            ) : (
              <FlatList
                data={connectedMembers}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyTitle}>No connected members</Text>
                    <Text style={styles.emptySubtitle}>Go to the members tab to link a spender first.</Text>
                  </View>
                }
                renderItem={({ item, index }) => {
                  const theme = CARD_THEMES[index % CARD_THEMES.length];
                  const isPending = item.status === 'pending';

                  return (
                    <TouchableOpacity
                      style={[styles.modalCard, { backgroundColor: theme.bg, opacity: isPending ? 0.6 : 1 }]}
                      activeOpacity={0.8}
                      disabled={isPending}
                      onPress={() => {
                        if (isPending) {
                          Alert.alert("Pending Connection", "Spender hasn't accepted your link request yet.");
                          return;
                        }
                        setSelectedSpender({
                          id: item.spender_id,
                          name: item.name,
                          email: item.email,
                          avatarUrl: item.avatarUrl
                        });
                        setModalVisible(false);
                      }}
                    >
                      <View style={styles.gridAvatarCircle}>
                        {item.avatarUrl ? (
                          <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
                        ) : (
                          <Text style={[styles.avatarText, { color: theme.text }]}>
                            {item.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.gridMemberName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.gridMemberEmail} numberOfLines={1}>{item.email}</Text>
                      </View>
                      {isPending && (
                        <View style={[styles.gridStatusBadge, styles.badgePending]}>
                          <Text style={[styles.statusText, { color: COLORS.pendingText }]}>Pending</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screenBg: {
    flex: 1,
    backgroundColor: COLORS.screenTeal,
  },
  whiteSheet: {
    flex: 1,
    backgroundColor: COLORS.softTint,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    marginTop: 40,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  inlineBackButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.pillBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  mainSubtitle: {
    fontSize: 13,
    color: COLORS.inkSoft,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  selectMemberButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    gap: 10,
  },
  addCircleOutline: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: COLORS.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectMemberText: {
    color: COLORS.brand,
    fontWeight: '600',
    fontSize: 15,
  },
  selectedSpenderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    gap: 12,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.softTint,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  spenderName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.brand,
  },
  spenderEmail: {
    fontSize: 12,
    color: COLORS.inkSoft,
  },
  removeButton: {
    padding: 7,
    backgroundColor: COLORS.dangerSoft,
    borderRadius: 10,
  },
  inputGroup: {
    gap: 8,
    marginTop: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  pillInput: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 20,
    borderRadius: 30,
    height: 50,
    color: COLORS.brand,
    fontSize: 15,
    fontWeight: '500',
  },
  amountWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  currencyPrefix: {
    position: 'absolute',
    left: 20,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.brand,
    zIndex: 1,
  },
  amountInput: {
    paddingLeft: 36,
  },
  periodSelectorContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  periodPill: {
    width: '31%',
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  periodPillActive: {
    backgroundColor: COLORS.brand,
  },
  periodPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkSoft,
    textAlign: 'center',
  },
  periodPillTextActive: {
    color: '#FFFFFF',
  },
  dateRangeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  dateRangeIndicatorText: {
    fontSize: 12,
    color: COLORS.inkSoft,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: COLORS.brand,
    height: 56,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  saveButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: COLORS.softTint,
    borderRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    width: '100%',
    maxHeight: '75%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.pillBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  gridAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontWeight: '700',
    fontSize: 13,
  },
  gridMemberName: {
    fontSize: 15,
    fontWeight: '700',
  },
  gridMemberEmail: {
    fontSize: 11,
    color: COLORS.inkSoft,
    marginTop: 2,
  },
  gridStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgePending: {
    backgroundColor: COLORS.pendingSoft,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.brand,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.inkSoft,
    textAlign: 'center',
    marginTop: 4,
  },
});