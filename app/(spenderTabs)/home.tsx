import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState, } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { supabase } from '../../lib/supabase';

const COLORS = {
  black: '#000000',
  headerDark: '#1F4F59',   
  headerDarker: '#173D45', 
  deepTeal: '#1F4F59',
  cyan: '#54C9CC',
  cyanLight: '#7EDDE0',
  olive: '#7EA00E',
  yellowGreen: '#DCD964',
  darkOlive: '#213502',
  bg: '#F8FAFC',
  card: '#FFFFFF',
  white: '#FFFFFF',
  textMuted: '#64748B',
  overlay: 'rgba(9, 20, 19, 0.5)',
  modalShadow: '#04201C',
};

const PALETTE_LIGHT_CARDS = [
  '#E6F0F2',
  '#F4F8E8',
  '#FAFAD8',
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown error occurred';
}

function getDaysInfo(dueDateStr: string): { text: string; urgent: boolean } {
  const dueDate = new Date(dueDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return { 
      text: absDays === 1 ? '1 day overdue' : `${absDays} days overdue`, 
      urgent: true 
    };
  }
  if (diffDays === 0) {
    return { text: 'Due today', urgent: true };
  }
  if (diffDays === 1) {
    return { text: '1 day left', urgent: true };
  }
  if (diffDays <= 3) {
    return { text: `${diffDays} days left`, urgent: true };
  }
  return { text: `${diffDays} days left`, urgent: false };
}

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
interface DashboardSummary {
  allowanceId: string;
  allowanceName: string;
  totalAllowance: number;
  totalSpent: number;
  remaining: number;
  unallocated: number;
}

interface ReminderItem {
  id: string;
  title: string;
  amount: number;
  due_date: string;
  status: string;
  categories?: {
    name?: string;
    icon?: string;
  } | null;
}

interface FriendItem {
  id: string;
  full_name: string;
  email?: string;
  avatar_url?: string | null;
  amount_owed: number;
}

interface TransactionItem {
  id: string;
  amount: number;
  created_at: string;
  description?: string;
  categories?: {
    name?: string;
    icon?: string;
    color?: string;
  } | null;
}

export default function SpenderHomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spenderName, setSpenderName] = useState('Guian Sumbi');
  const [spenderRole, setSpenderRole] = useState('Member');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [upcomingDues, setUpcomingDues] = useState<ReminderItem[]>([]);
  const [friendsList, setFriendsList] = useState<FriendItem[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionItem[]>([]);

  // ---------------------------------------------------------------------------
  // DATA FETCHING
  // ---------------------------------------------------------------------------
  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch Profile (including role)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, role')
        .eq('id', user.id)
        .single();

      if (profileData?.full_name) setSpenderName(profileData.full_name);
      if (profileData?.avatar_url) setAvatarUrl(profileData.avatar_url);
      if (profileData?.role) setSpenderRole(profileData.role);

      const today = new Date().toISOString().split('T')[0];

      // 2. Fetch Allowances
      const { data: allowanceData, error: allowanceError } = await supabase
        .from('allowances')
        .select('id, allowance_name, amount, start_date, end_date')
        .eq('spender_id', user.id)
        .lte('start_date', today)
        .gte('end_date', today)
        .order('received_at', { ascending: false })
        .limit(1);

      if (allowanceError) throw allowanceError;

      let totalSpentCounter = 0;
      let totalAllocatedCounter = 0;

      if (allowanceData && allowanceData.length > 0) {
        const activeAllowance = allowanceData[0];

        const { data: budgetsData, error: budgetsError } = await supabase
          .from('budgets')
          .select(`
            id,
            category_id,
            allocated_amount,
            allowance_id,
            expenses (
              id,
              amount
            )
          `)
          .eq('user_id', user.id)
          .eq('allowance_id', activeAllowance.id);

        if (budgetsError) throw budgetsError;

        ((budgetsData as any[]) || []).forEach((budget) => {
          const currentAllocation = Number(budget.allocated_amount || 0);
          totalAllocatedCounter += currentAllocation;

          const expensesList = budget.expenses || [];
          const categoryTotalSpent = expensesList.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0);
          totalSpentCounter += categoryTotalSpent;
        });

        const totalAllowanceVal = Number(activeAllowance.amount);

        setSummary({
          allowanceId: activeAllowance.id,
          allowanceName: activeAllowance.allowance_name,
          totalAllowance: totalAllowanceVal,
          totalSpent: totalSpentCounter,
          remaining: totalAllowanceVal - totalSpentCounter,
          unallocated: totalAllowanceVal - totalAllocatedCounter,
        });
      } else {
        setSummary(null);
      }

      // 3. Fetch Upcoming Dues
      const { data: duesData, error: duesError } = await supabase
        .from('reminders')
        .select(`
          id,
          title,
          amount,
          due_date,
          status,
          categories ( name, icon )
        `)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('due_date', { ascending: true })
        .limit(5);

      if (duesError) throw duesError;
      setUpcomingDues((duesData as unknown as ReminderItem[]) || []);

      // 4. FETCH FRIENDS AND THEIR OWED AMOUNTS
      try {
        const { data: friendsData, error: friendsErr } = await supabase
          .from('friends')
          .select(`
            id,
            full_name,
            email,
            avatar_url,
            split_friends (
              owed_amount
            )
          `)
          .eq('user_id', user.id)
          .order('full_name', { ascending: true });

        if (friendsErr) {
          console.error('Error fetching friends:', friendsErr.message);
        }

        if (friendsData && friendsData.length > 0) {
          const mappedFriends: FriendItem[] = friendsData.map((f: any) => {
            const totalOwed = (f.split_friends || []).reduce(
              (sum: number, entry: any) => sum + Number(entry.owed_amount || 0),
              0
            );

            return {
              id: f.id,
              full_name: f.full_name || 'Friend',
              email: f.email,
              avatar_url: f.avatar_url || null,
              amount_owed: totalOwed,
            };
          });

          setFriendsList(mappedFriends);
        } else {
          setFriendsList([]);
        }
      } catch (friendErr) {
        console.error('Error fetching friends:', friendErr);
      }

      // 5. FETCH RECENT TRANSACTIONS
      try {
        const { data: transactionData, error: transactionErr } = await supabase
          .from('expenses')
          .select(`
            id,
            amount,
            spent_at,
            description,
            budgets (
              categories (
                name,
                icon,
                color
              )
            )
          `)
          .eq('budgets.user_id', user.id)
          .order('spent_at', { ascending: false })
          .limit(5);

        if (transactionErr) {
          console.error('Error fetching transactions:', transactionErr.message);
        }

        if (transactionData && transactionData.length > 0) {
          const mappedTransactions: TransactionItem[] = (transactionData as any[]).map((t: any) => ({
            id: t.id,
            amount: t.amount,
            created_at: t.spent_at,
            description: t.description,
            categories: t.budgets?.categories || null,
          }));

          setRecentTransactions(mappedTransactions);
        } else {
          setRecentTransactions([]);
        }
      } catch (transactionErr) {
        console.error('Error fetching transactions:', transactionErr);
      }

    } catch (error: unknown) {
      console.error('Spender Dashboard Error:', extractErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: COLORS.bg }]}>
        <ExpoStatusBar style="light" />
        <ActivityIndicator size="large" color={COLORS.deepTeal} />
      </View>
    );
  }

  const remainingPercentage = summary && summary.totalAllowance > 0
    ? Math.max(0, Math.min(((summary.totalAllowance - summary.totalSpent) / summary.totalAllowance) * 100, 100))
    : 0;

  return (
    <View style={styles.mainContainer}>
      <ExpoStatusBar style="light" />

      {/* ========== STATIC HEADER (NO ANIMATIONS) ========== */}
      <View style={styles.headerBackground}>
        <View style={styles.topRowContainer}>
          <View style={styles.topRow}>
            <View style={styles.userProfileGroup}>
              <TouchableOpacity onPress={() => router.push('/profile')}>
                <View>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarInitial}>{spenderName.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              <View>
                <Text style={styles.helloText}>Hello,</Text>
                <Text style={styles.userNameText} numberOfLines={1}>
                  {spenderName}
                </Text>
              </View>
            </View>

            <View style={styles.roleBadgeContainer}>
              <Text style={styles.roleBadgeText} numberOfLines={1}>
                {spenderRole ? spenderRole.toUpperCase() : ''}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.balanceBlock}>
          <View style={styles.balanceLabelRow}>
            <View style={styles.balanceLabelIconWrap}>
              <Ionicons name="wallet-outline" size={13} color={COLORS.deepTeal} />
            </View>
            <Text style={styles.balanceLabel}>Total Remaining</Text>
          </View>

          <View style={styles.pillTrackOuter}>
            <View style={styles.pillTrack}>
              <View style={[styles.pillFill, { width: `${remainingPercentage}%` }]} />
            </View>
          </View>

          <View style={styles.balanceAmountRow}>
            <Text style={styles.pillAmountText}>
              ₱{summary ? summary.remaining.toLocaleString('en-US') : '0'}
            </Text>
            <Text style={styles.pillAmountDivider}>/</Text>
            <Text style={styles.pillAmountTotal}>
              ₱{summary ? summary.totalAllowance.toLocaleString('en-US') : '0'}
            </Text>
          </View>
        </View>
      </View>

      {/* ========== SCROLLABLE CONTENT ========== */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.olive]} tintColor={COLORS.olive} />
        }
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* ========== UPCOMING DUES ========== */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Upcoming Dues</Text>
            <TouchableOpacity onPress={() => router.push('/reminders')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          {upcomingDues.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconWrapper}>
                <Ionicons name="checkmark-done-circle-outline" size={40} color={COLORS.cyan} />
              </View>
              <Text style={styles.emptyText}>All clear! No upcoming dues.</Text>
              <TouchableOpacity style={styles.addDueButton} onPress={() => router.push('/reminders')}>
                <Ionicons name="add-circle-outline" size={16} color={COLORS.olive} />
                <Text style={styles.addDueButtonText}>Add a reminder</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.dueCardsContainer}>
              {upcomingDues.map((due, index) => {
                const cardBgColor = PALETTE_LIGHT_CARDS[index % PALETTE_LIGHT_CARDS.length];
                const daysInfo = getDaysInfo(due.due_date);
                const dateObj = new Date(due.due_date);
                const monthStr = dateObj.toLocaleString('en-US', { month: 'short' }).toUpperCase();
                const dayStr = dateObj.getDate();

                return (
                  <TouchableOpacity
                    key={due.id}
                    activeOpacity={0.85}
                    onPress={() => router.push('/reminders')}
                    style={[styles.reminderCardHome, { backgroundColor: cardBgColor }]}
                  >
                    <View style={styles.calendarBadgeHome}>
                      <Text style={styles.calendarMonthHome}>{monthStr}</Text>
                      <Text style={styles.calendarDayHome}>{dayStr}</Text>
                    </View>

                    <View style={styles.cardContentHome}>
                      <Text style={styles.reminderTitleHome}>{due.title}</Text>
                      <Text style={styles.reminderSubHome}>
                        ₱{Number(due.amount).toFixed(2)}
                      </Text>
                    </View>

                    <View style={[
                      styles.dueBadgeHome, 
                      { backgroundColor: daysInfo.urgent ? '#FEF2F2' : 'rgba(31, 79, 89, 0.1)' }
                    ]}>
                      <Text style={[
                        styles.dueBadgeTextHome, 
                        { color: daysInfo.urgent ? '#DC2626' : COLORS.deepTeal }
                      ]}>
                        {daysInfo.text}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ========== WHO OWES YOU ========== */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Who Owes You</Text>
            <TouchableOpacity onPress={() => router.push('/split')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          {friendsList.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="people-outline" size={32} color={COLORS.textMuted} style={{ marginBottom: 6 }} />
              <Text style={styles.emptyText}>No debts recorded yet.</Text>
            </View>
          ) : (
            <View style={styles.debtListContainer}>
              {[...friendsList]
                .filter(item => (Number(item.amount_owed) || 0) > 0)
                .sort((a, b) => (Number(b.amount_owed) || 0) - (Number(a.amount_owed) || 0))
                .map((item) => {
                  return (
                    <TouchableOpacity
                      key={`debt-friend-${item.id}`}
                      style={styles.debtCardItem}
                      onPress={() => router.push('/split')}
                      activeOpacity={0.8}
                    >
                      <View style={styles.debtItemLeft}>
                        {item.avatar_url ? (
                          <Image source={{ uri: item.avatar_url }} style={styles.friendAvatarImageRow} />
                        ) : (
                          <Image 
                            source={require('../../assets/images/default.png')} 
                            style={styles.friendAvatarImageRow} 
                          />
                        )}
                        <Text style={styles.friendNameRowText} numberOfLines={1}>
                          {item.full_name}
                        </Text>
                      </View>

                      <View style={styles.debtItemRight}>
                        <Text style={styles.owesYouLabel}>owes you</Text>
                        <Text style={styles.owesYouAmountText}>
                          ₱{(Number(item.amount_owed) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
            </View>
          )}
        </View>

        {/* ========== RECENT TRANSACTIONS ========== */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <TouchableOpacity onPress={() => router.push('/transaction')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          {recentTransactions.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={32} color={COLORS.textMuted} style={{ marginBottom: 6 }} />
              <Text style={styles.emptyText}>No transactions yet.</Text>
            </View>
          ) : (
            <View style={styles.transactionCardsContainer}>
              {recentTransactions.map((transaction) => {
                const transactionDate = new Date(transaction.created_at);
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);

                let dateLabel: string;
                const timeString = transactionDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

                if (transactionDate.toDateString() === today.toDateString()) {
                  dateLabel = `Today at ${timeString}`;
                } else if (transactionDate.toDateString() === yesterday.toDateString()) {
                  dateLabel = `Yesterday at ${timeString}`;
                } else {
                  dateLabel = transactionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                }

                const iconName = (transaction.categories?.icon as any) || 'receipt-outline';
                const iconColor = transaction.categories?.color || '#1F4F59';

                return (
                  <View
                    key={transaction.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      backgroundColor: '#ffffff',
                      borderRadius: 15,
                      gap: 10,
                    }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#EFF4F6', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                      <Ionicons name={iconName} size={18} color={iconColor} />
                    </View>

                    <View style={{ flex: 1, justifyContent: 'center', marginRight: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }} numberOfLines={1} ellipsizeMode="tail">
                        {transaction.description || transaction.categories?.name || 'Transaction'}
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginTop: 2 }}>
                        {dateLabel}
                      </Text>
                    </View>

                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1F4F59', flexShrink: 0 }}>
                      -₱{Number(transaction.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { backgroundColor: COLORS.bg, paddingBottom: 100 },

  // Header
  headerBackground: {
    backgroundColor: COLORS.headerDark,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 22,
    paddingBottom: 30,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 5,
    zIndex: 10,
  },
  topRowContainer: { marginBottom: 24 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userProfileGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarImage: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#FFFFFF' },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.yellowGreen,
  },
  avatarInitial: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  helloText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3, lineHeight: 26 },
  userNameText: { fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.82)', marginTop: 1 },
  
  roleBadgeContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: 120,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
    letterSpacing: 0.5,
  },

  balanceBlock: { alignItems: 'center' },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  balanceLabelIconWrap: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.yellowGreen, justifyContent: 'center', alignItems: 'center',
  },
  balanceLabel: { fontSize: 12, color: COLORS.white, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  pillTrackOuter: { width: '100%', padding: 4, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' },
  pillTrack: { width: '100%', height: 46, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  pillFill: { height: '100%', borderRadius: 26, backgroundColor: COLORS.cyan },
  balanceAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 16 },
  pillAmountText: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.6 },
  pillAmountDivider: { fontSize: 22, color: 'rgba(255,255,255,0.3)', fontWeight: '300' },
  pillAmountTotal: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },

  // Sections
  sectionBlock: { paddingHorizontal: 24, marginTop: 28 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.darkOlive, letterSpacing: -0.3 },
  seeAllText: { fontSize: 13, color: COLORS.black, fontWeight: '600' },

  debtListContainer: {
    gap: 10,
  },
  debtCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  debtItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  friendAvatarImageRow: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  friendNameRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.black,
    flex: 1,
  },
  debtItemRight: {
    alignItems: 'flex-end',
  },
  owesYouLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  owesYouAmountText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7EA00E',
  },

  // Upcoming Dues
  dueCardsContainer: { gap: 10 },
  reminderCardHome: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
  },
  cardContentHome: {
    flex: 1,
    marginRight: 8,
  },
  reminderTitleHome: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  reminderSubHome: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  dueBadgeHome: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dueBadgeTextHome: {
    fontSize: 11,
    fontWeight: '700',
  },

  transactionCardsContainer: { gap: 10 },

  emptyIconWrapper: { marginBottom: 10 },
  addDueButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: 24, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7',
  },
  addDueButtonText: { fontSize: 13, color: COLORS.olive, fontWeight: '600' },
  emptyBox: {
    padding: 28, backgroundColor: COLORS.card, borderRadius: 22, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12
  },
  emptyText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '500' },

  calendarBadgeHome: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  calendarMonthHome: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.deepTeal,
    letterSpacing: 0.5,
  },
  calendarDayHome: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.deepTeal,
    lineHeight: 18,
  },
});