// app/(sponsorTabs)/home.tsx
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
  StatusBar as NativeStatusBar,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '../../lib/supabase';

interface AllowanceDashboardItem {
  id: string;
  allowance_name: string;
  amount: number;
  spent_amount: number;
  start_date: string;
  end_date: string;
  spender_id: string;
  spender_name: string;
  spender_avatar_url: string | null;
  isActive: boolean;
  received_at: string;
}

interface ConnectedSpender {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

/* ---------- Design Tokens ---------- */
const COLORS = {
  deepTeal: '#1F4F59',
  headerBg: '#133D44',
  cyan: '#54C9CC',
  cyanLight: '#7EDDE0',
  darkOlive: '#213502',
  bg: '#F4F8F4',
  card: '#FFFFFF',
  white: '#FFFFFF',
  textMuted: '#7E8F82',
  danger: '#DC2626',
  borderLight: '#E2ECE9',
  yellowGreen: '#cfee45e5',
};

export default function HomeScreen() {
  const router = useRouter();
  const [activeAllowances, setActiveAllowances] = useState<AllowanceDashboardItem[]>([]);
  const [connectedSpenders, setConnectedSpenders] = useState<ConnectedSpender[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalAllocated, setTotalAllocated] = useState(0);
  const [totalRemaining, setTotalRemaining] = useState(0);
  const [sponsorProfile, setSponsorProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);

  const [selectedSpenderId, setSelectedSpenderId] = useState<string | null>(null);

  // Modal States for Adding Spender
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [spenderEmail, setSpenderEmail] = useState('');
  const [submittingSpender, setSubmittingSpender] = useState(false);

  const fetchDashboardData = async (isRefreshing = false) => {
    try {
      if (!isRefreshing) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();
      setSponsorProfile(profile);

      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch active allowances with received_at included
      const { data: allowancesData, error: allowancesError } = await supabase
        .from('allowances')
        .select(`
          id, allowance_name, amount, start_date, end_date, spender_id, received_at,
          profiles!allowances_spender_id_fkey (id, full_name, avatar_url),
          expenses (amount)
        `)
        .eq('sponsor_id', user.id)
        .order('received_at', { ascending: false });

      if (allowancesError) throw allowancesError;

      // 2. Fetch connected spenders gikan sa sponsor_spenders table
      const { data: connectedData, error: connectedError } = await supabase
        .from('sponsor_spenders')
        .select(`
          spender_id,
          status,
          profiles!sponsor_spenders_spender_id_fkey (id, full_name, avatar_url)
        `)
        .eq('sponsor_id', user.id)
        .eq('status', 'accepted');

      if (connectedError) throw connectedError;

      let calculatedAllocated = 0;
      let calculatedSpent = 0;

      const activeList: AllowanceDashboardItem[] = [];
      const spendersMap = new Map<string, ConnectedSpender>();

      (connectedData || []).forEach((item: any) => {
        if (item.profiles) {
          spendersMap.set(item.profiles.id, {
            id: item.profiles.id,
            full_name: item.profiles.full_name || 'Spender',
            avatar_url: item.profiles.avatar_url || null,
          });
        }
      });

      (allowancesData || []).forEach((item: any) => {
        const allowanceAmount = Number(item.amount);
        const isActive = item.start_date <= today && item.end_date >= today;

        const spentForAllowance = (item.expenses || []).reduce(
          (sum: number, exp: { amount: number }) => sum + Number(exp.amount),
          0
        );

        if (isActive) {
          calculatedAllocated += allowanceAmount;
          calculatedSpent += spentForAllowance;
        }

        const formattedItem: AllowanceDashboardItem = {
          id: item.id,
          allowance_name: item.allowance_name,
          amount: allowanceAmount,
          spent_amount: spentForAllowance,
          start_date: item.start_date,
          end_date: item.end_date,
          spender_id: item.spender_id,
          spender_name: item.profiles?.full_name || 'Unknown',
          spender_avatar_url: item.profiles?.avatar_url || null,
          isActive,
          received_at: item.received_at,
        };

        if (isActive) {
          activeList.push(formattedItem);
        }
      });

      setActiveAllowances(activeList);
      setConnectedSpenders(Array.from(spendersMap.values()));
      setTotalAllocated(calculatedAllocated);
      setTotalRemaining(Math.max(0, calculatedAllocated - calculatedSpent));
    } catch (e: any) {
      console.error('Error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchDashboardData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDashboardData(true);
  }, []);

  const handleDelete = (id: string) => {
    Alert.alert('Delete Allowance', 'Are you sure you want to delete this?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('allowances').delete().eq('id', id);
          if (error) Alert.alert('Error', 'Failed to delete allowance.');
          else fetchDashboardData();
        },
      },
    ]);
  };

  const handleEdit = (item: AllowanceDashboardItem) =>
    router.push({ pathname: '/allowance', params: { id: item.id } });

  // Handle adding a new spender via modal submission
  const handleAddSpenderSubmit = async () => {
    if (!spenderEmail.trim()) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }

    try {
      setSubmittingSpender(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Find profile matching the email
      const { data: targetProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('email', spenderEmail.trim().toLowerCase())
        .single();

      if (profileError || !targetProfile) {
        Alert.alert('Not Found', 'No user account found with this email address.');
        return;
      }

      // Check if trying to connect to yourself
      if (targetProfile.id === user.id) {
        Alert.alert('Invalid Action', 'You cannot connect your own account as a spender.');
        return;
      }

      // 2. Check if this spender is already connected to ANY sponsor (or already connected to you)
      const { data: existingConnection, error: checkError } = await supabase
        .from('sponsor_spenders')
        .select('sponsor_id, status')
        .eq('spender_id', targetProfile.id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingConnection) {
        if (existingConnection.sponsor_id === user.id) {
          Alert.alert('Already Connected', 'This spender is already connected to your account.');
        } else {
          Alert.alert(
            'Connection Unavailable',
            'This spender is already connected to another sponsor and cannot be linked.'
          );
        }
        return;
      }

      // 3. Insert into sponsor_spenders table if no existing connection found
      const { error: insertError } = await supabase
        .from('sponsor_spenders')
        .insert({
          sponsor_id: user.id,
          spender_id: targetProfile.id,
          status: 'accepted',
        });

      if (insertError) throw insertError;

      Alert.alert('Success', 'Spender connected successfully!');
      setSpenderEmail('');
      setIsAddModalVisible(false);
      fetchDashboardData(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to connect spender.');
    } finally {
      setSubmittingSpender(false);
    }
  };

  const initials = (sponsorProfile?.full_name || 'S')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const getFirstName = (fullName: string) => {
    return fullName.trim().split(' ')[0] || fullName;
  };

  const filteredAllowances = selectedSpenderId
    ? activeAllowances.filter(a => a.spender_id === selectedSpenderId)
    : activeAllowances;

  const totalSpent = Math.max(0, totalAllocated - totalRemaining);
  const overallSpentPercent = totalAllocated > 0 ? Math.min(100, Math.round((totalSpent / totalAllocated) * 100)) : 0;
  const currentDateFormatted = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();

  const formatDateRange = (startDateStr: string, endDateStr: string) => {
    try {
      const start = new Date(startDateStr);
      const end = new Date(endDateStr);

      const startMonth = start.toLocaleString('en-US', { month: 'long' });
      const startDay = String(start.getDate()).padStart(2, '0');
      
      const endMonth = end.toLocaleString('en-US', { month: 'long' });
      const endDay = String(end.getDate()).padStart(2, '0');
      const endYear = end.getFullYear();

      if (startMonth === endMonth && start.getFullYear() === endYear) {
        return `${startMonth} ${startDay} - ${endDay}, ${endYear}`;
      }
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${endYear}`;
    } catch (e) {
      return `${startDateStr} to ${endDateStr}`;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* TOP DARK HEADER CONTAINER */}
      <View style={styles.heroContainer}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/profile')}>
              {sponsorProfile?.avatar_url ? (
                <Image source={{ uri: sponsorProfile.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.welcomeText}>Hello,</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {sponsorProfile?.full_name || 'Sponsor'}
              </Text>
            </View>
          </View>

          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>{currentDateFormatted}</Text>
          </View>
        </View>

        {/* Total Remaining Balance Card inside Hero */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceTitleRow}>
            <View style={styles.walletIconContainer}>
              <Ionicons name="wallet-outline" size={12} color={COLORS.deepTeal} />
            </View>
            <Text style={styles.heroLabel}>TOTAL ALLOCATED ALLOWANCE</Text>
          </View>

          <View style={styles.heroProgressTrack}>
            <View style={[styles.heroProgressBar, { width: `${100 - overallSpentPercent}%` }]} />
          </View>

          <View style={styles.heroAmountRow}>
            <Text style={styles.heroRemainingAmount}>
              ₱{totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </Text>
            <Text style={styles.heroTotalAmount}>
              {' / '}₱{totalAllocated.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </Text>
          </View>
        </View>
      </View>

      {/* BODY CONTENT */}
      <View style={styles.bodyContent}>
        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={COLORS.deepTeal} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={filteredAllowances}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listScrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.deepTeal]} tintColor={COLORS.deepTeal} />
            }
            ListHeaderComponent={
              <>
                {/* Connected Spenders Section */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Connected Spenders</Text>
                  <Text style={styles.seeAllText}>{connectedSpenders.length} members</Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalSpendersContainer}
                >
                  {/* CHANGED: Opens the Add Spender Modal instead of router.push */}
                  <TouchableOpacity
                    style={styles.addSpenderItem}
                    activeOpacity={0.7}
                    onPress={() => setIsAddModalVisible(true)}
                  >
                    <View style={styles.addDashedCircle}>
                      <Ionicons name="add" size={22} color={COLORS.deepTeal} />
                    </View>
                    <Text style={styles.addSpenderLabel} numberOfLines={1}>Add</Text>
                  </TouchableOpacity>

                  {connectedSpenders.map((spender) => {
                    const firstName = getFirstName(spender.full_name);
                    const spenderInitials = spender.full_name
                      .split(' ')
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase();

                    return (
                      <View key={spender.id} style={styles.spenderHorizontalItem}>
                        <View style={styles.avatarBorderRing}>
                          {spender.avatar_url ? (
                            <Image source={{ uri: spender.avatar_url }} style={styles.spenderGridAvatar} />
                          ) : (
                            <View style={styles.spenderGridAvatarPlaceholder}>
                              <Text style={styles.spenderGridInitials}>{spenderInitials}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.spenderGridFirstName} numberOfLines={1}>
                          {firstName}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>

                {/* ACTIVE ALLOWANCES HEADER */}
                <View style={[styles.sectionHeader, { marginTop: 15 }]}>
                  <Text style={styles.sectionTitle}>Active Allowances</Text>
                  <Text style={styles.seeAllText}>{filteredAllowances.length} active</Text>
                </View>
              </>
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="wallet-outline" size={22} color={COLORS.deepTeal} />
                </View>
                <Text style={styles.emptyTitle}>
                  {selectedSpenderId ? 'No allowances for this spender' : 'No active allowances'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {selectedSpenderId
                    ? 'This member does not have any active allowances set up yet.'
                    : 'Connect with a spender above and set up their first allowance.'}
                </Text>
                <TouchableOpacity
                  style={styles.navigateBtn}
                  activeOpacity={0.85}
                  onPress={() => setIsAddModalVisible(true)}
                >
                  <Text style={styles.navigateBtnText}>Connect New Spender</Text>
                  <Ionicons name="arrow-forward" size={13} color={COLORS.white} />
                </TouchableOpacity>
              </View>
            }
            renderItem={({ item }) => {
              const remainingAmount = Math.max(0, item.amount - item.spent_amount);
              const remainingPercent = item.amount > 0 ? Math.min(100, Math.round((remainingAmount / item.amount) * 100)) : 0;
              
              const spenderInitials = item.spender_name
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

              return (
                <View style={styles.allowanceCard}>
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.cardHeaderLeft}>
                      {item.spender_avatar_url ? (
                        <Image source={{ uri: item.spender_avatar_url }} style={styles.cardAvatar} />
                      ) : (
                        <View style={styles.cardAvatarPlaceholder}>
                          <Text style={styles.cardAvatarInitials}>{spenderInitials}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.cardTitleText} numberOfLines={1}>
                          {item.allowance_name}
                        </Text>
                        <View style={styles.cardSpenderRow}>
                          <Ionicons name="person-outline" size={11} color={COLORS.textMuted} />
                          <Text style={styles.cardSpenderName} numberOfLines={1}>
                            {item.spender_name}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.cardActionIcons}>
                      <TouchableOpacity onPress={() => handleEdit(item)} style={styles.iconCircleBtn}>
                        <Ionicons name="pencil-outline" size={14} color={COLORS.deepTeal} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.iconCircleBtn}>
                        <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.cardDivider} />

                  <View style={styles.amountsRow}>
                    <View style={styles.amountColumn}>
                      <Text style={styles.amountLabel}>ALLOCATED</Text>
                      <Text style={styles.allocatedAmountText}>
                        ₱{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                    <View style={styles.amountColumn}>
                      <Text style={styles.amountLabel}>REMAINING</Text>
                      <Text style={styles.remainingAmountText}>
                        ₱{remainingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.progressTrack}>
                    <View style={[styles.progressBar, { width: `${remainingPercent}%` }]} />
                  </View>

                  <View style={styles.cardFooterRow}>
                    <Text style={styles.spentSoFarText}>
                      ₱{item.spent_amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} spent so far
                    </Text>
                    <View style={styles.percentBadge}>
                      <Text style={styles.percentBadgeText}>{remainingPercent}%</Text>
                    </View>
                  </View>

                  <View style={styles.dateRangePill}>
                    <Ionicons name="calendar-outline" size={12} color={COLORS.deepTeal} />
                    <Text style={styles.dateRangeText}>
                      {formatDateRange(item.start_date, item.end_date)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      {/* ADD SPENDER MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isAddModalVisible}
        onRequestClose={() => setIsAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Connect New Spender</Text>
              <TouchableOpacity onPress={() => setIsAddModalVisible(false)}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Enter your spender's registered account email address to connect them.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="spender@email.com"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={spenderEmail}
              onChangeText={setSpenderEmail}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsAddModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleAddSpenderSubmit}
                disabled={submittingSpender}
              >
                {submittingSpender ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.modalSubmitText}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.headerBg,
    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight : 0,
  },
  heroContainer: {
    backgroundColor: COLORS.headerBg,
    paddingHorizontal: 30,
    paddingBottom: 24,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  welcomeText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '400' },
  userName: { fontSize: 18, fontWeight: '700', color: COLORS.white, letterSpacing: -0.3 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: COLORS.white },
  avatarPlaceholder: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.cyanLight,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.cyan,
  },
  avatarInitials: { color: COLORS.deepTeal, fontWeight: '700', fontSize: 13 },
  dateBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  dateBadgeText: { color: COLORS.white, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  balanceCard: {
    marginTop: 4,
  },
  balanceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  walletIconContainer: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.yellowGreen,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 6,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  heroProgressTrack: {
    height: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 50,
    overflow: 'hidden',
    marginBottom: 10,
  },
  heroProgressBar: {
    height: '100%',
    backgroundColor: COLORS.cyan,
    borderRadius: 5,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  heroRemainingAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
  },
  heroTotalAmount: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 18,
    fontWeight: '600',
  },
  bodyContent: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.darkOlive,
    letterSpacing: 0.5,
  },
  seeAllText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  horizontalSpendersContainer: {
    paddingHorizontal: 5,
    paddingTop: 15,
    gap: 14,
  },
  addSpenderItem: {
    alignItems: 'center',
    width: 60,
  },
  addDashedCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: COLORS.deepTeal,
    borderStyle: 'dashed',
    backgroundColor: '#EAF6F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addSpenderLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.deepTeal,
    marginTop: 4,
  },
  spenderHorizontalItem: {
    alignItems: 'center',
    width: 60,
  },
  avatarBorderRing: {
    padding: 2,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  spenderGridAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  spenderGridAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.cyanLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spenderGridInitials: {
    color: COLORS.deepTeal,
    fontWeight: '700',
    fontSize: 14,
  },
  spenderGridFirstName: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginTop: 3,
    textAlign: 'center',
  },
  listScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 14,
  },
  allowanceCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  cardAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  cardAvatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.cyanLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardAvatarInitials: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.deepTeal,
  },
  cardTitleText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.darkOlive,
  },
  cardSpenderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  cardSpenderName: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  cardActionIcons: {
    flexDirection: 'row',
    gap: 6,
  },
  iconCircleBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F4F8F4',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: 12,
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  amountColumn: {
    flex: 1,
  },
  amountLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  allocatedAmountText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.darkOlive,
  },
  remainingAmountText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.deepTeal,
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#EAEFEA',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.cyan,
    borderRadius: 4,
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  spentSoFarText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  percentBadge: {
    backgroundColor: COLORS.cyan,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  percentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.deepTeal,
  },
  dateRangePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F4F8F4',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  dateRangeText: {
    fontSize: 11,
    color: COLORS.deepTeal,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ECEFF3',
    marginTop: 10,
  },
  emptyIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#EAF6F7',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.cyanLight,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: COLORS.darkOlive },
  emptySubtitle: {
    fontSize: 12, color: COLORS.textMuted,
    textAlign: 'center', marginTop: 4, marginBottom: 16,
    lineHeight: 16, paddingHorizontal: 10,
  },
  navigateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.deepTeal,
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 8,
  },
  navigateBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 12 },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.darkOlive,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 16,
    lineHeight: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.darkOlive,
    backgroundColor: COLORS.bg,
    marginBottom: 20,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  modalSubmitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: COLORS.deepTeal,
  },
  modalSubmitText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.white,
  },
});