// app/(sponsorTabs)/allowances.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StatusBar as NativeStatusBar,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { supabase } from '../../lib/supabase';

interface AllowanceGroupItem {
  id: string;
  allowance_name: string;
  amount: number;
}

interface SpenderAllowanceCardData {
  spender_id: string;
  spender_name: string;
  spender_avatar_url: string | null;
  allowances: AllowanceGroupItem[];
  totalAllocated: number;
  totalSpent: number;
  totalRemaining: number;
}

/* ---------- Design Tokens ---------- */
const COLORS = {
  bgLight: '#F3F4F6',
  lightGreen: '#C0E6BA',
  mediumGreen: '#4CA771',
  darkTeal: '#013237',
  bg: '#F9FAFB',
  card: '#FFFFFF',
  white: '#FFFFFF',
  textPrimary: '#111827',
  textMuted: '#6B7280',
  danger: '#DC2626',
  borderLight: '#E5E7EB',
  success: '#2E7D32',
};

export default function AllowancesScreen() {
  const router = useRouter();
  const [spenderCards, setSpenderCards] = useState<SpenderAllowanceCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalAllocated, setTotalAllocated] = useState(0);

  const fetchAllowancesData = async (isRefreshing = false) => {
    try {
      if (!isRefreshing) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: allowancesData, error: allowancesError } = await supabase
        .from('allowances')
        .select(`
          id, 
          allowance_name, 
          amount, 
          spender_id, 
          received_at,
          profiles!allowances_spender_id_fkey (id, full_name, avatar_url),
          expenses!expenses_allowance_id_fkey (amount)
        `)
        .eq('sponsor_id', user.id)
        .eq('is_archived', false)
        .order('received_at', { ascending: false });

      if (allowancesError) throw allowancesError;

      let calculatedAllocated = 0;
      const spenderCardMap = new Map<string, SpenderAllowanceCardData>();

      (allowancesData || []).forEach((item: any) => {
        const allowanceAmount = Number(item.amount);
        const spentForAllowance = (item.expenses || []).reduce(
          (sum: number, exp: { amount: number }) => sum + Number(exp.amount),
          0
        );

        calculatedAllocated += allowanceAmount;

        const spenderId = item.spender_id;
        const spenderName = item.profiles?.full_name || 'Unknown';
        const spenderAvatar = item.profiles?.avatar_url || null;

        if (!spenderCardMap.has(spenderId)) {
          spenderCardMap.set(spenderId, {
            spender_id: spenderId,
            spender_name: spenderName,
            spender_avatar_url: spenderAvatar,
            allowances: [],
            totalAllocated: 0,
            totalSpent: 0,
            totalRemaining: 0,
          });
        }

        const cardData = spenderCardMap.get(spenderId)!;
        cardData.totalAllocated += allowanceAmount;
        cardData.totalSpent += spentForAllowance;
        cardData.allowances.push({
          id: item.id,
          allowance_name: item.allowance_name,
          amount: allowanceAmount,
        });
      });

      spenderCardMap.forEach((card) => {
        card.totalRemaining = Math.max(0, card.totalAllocated - card.totalSpent);
      });

      setSpenderCards(Array.from(spenderCardMap.values()));
      setTotalAllocated(calculatedAllocated);
    } catch (e: any) {
      console.error('Error fetching allowances:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchAllowancesData(); }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAllowancesData(true);
  }, []);

  const handleCardPress = (spenderId: string) => {
    router.push({ pathname: '/monitoring', params: { spenderId } });
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* HEADER */}
      <LinearGradient
        colors={[COLORS.lightGreen, COLORS.bgLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.heroContainer}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={COLORS.darkTeal} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Allowances Management</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>TOTAL ALLOCATED</Text>
          <Text style={styles.summaryAmount}>
            ₱{totalAllocated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>
      </LinearGradient>

      {/* BODY CONTENT */}
      <View style={styles.bodyContent}>
        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={COLORS.textPrimary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={spenderCards}
            keyExtractor={(item) => item.spender_id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listScrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.textPrimary]} tintColor={COLORS.textPrimary} />
            }
            ListHeaderComponent={
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>All Allowances</Text>
                <Text style={styles.seeAllText}>{spenderCards.length} spenders</Text>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="wallet-outline" size={22} color={COLORS.textPrimary} />
                </View>
                <Text style={styles.emptyTitle}>No allowances found</Text>
                <Text style={styles.emptySubtitle}>
                  Connect with a spender and set up their first allowance.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const remainingAmount = Math.max(0, item.totalAllocated - item.totalSpent);
              const remainingPercent = item.totalAllocated > 0 ? Math.min(100, Math.round((remainingAmount / item.totalAllocated) * 100)) : 0;
              
              const spenderInitials = item.spender_name
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

              return (
                <TouchableOpacity 
                  style={styles.allowanceCard} 
                  activeOpacity={0.9}
                  onPress={() => handleCardPress(item.spender_id)}
                >
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
                          {item.spender_name}
                        </Text>
                        <View style={styles.cardSpenderRow}>
                          <Ionicons name="wallet-outline" size={11} color={COLORS.textMuted} />
                          <Text style={styles.cardSpenderName} numberOfLines={1}>
                            {item.allowances.length} active allowance{item.allowances.length > 1 ? 's' : ''}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={styles.cardDivider} />

                  <View style={styles.amountsRow}>
                    <View style={styles.amountColumn}>
                      <Text style={styles.amountLabel}>TOTAL ALLOCATED</Text>
                      <Text style={styles.allocatedAmountText}>
                        ₱{item.totalAllocated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                    <View style={styles.amountColumnRight}>
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
                      ₱{item.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} spent total
                    </Text>
                    <View style={styles.percentBadge}>
                      <Text style={styles.percentBadgeText}>{remainingPercent}%</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  heroContainer: {
    paddingTop: (Platform.OS === 'android' ? NativeStatusBar.currentHeight || 24 : 44) + 10,
    paddingHorizontal: 24,
    paddingBottom: 24,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.darkTeal,
  },
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  summaryLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  summaryAmount: {
    color: COLORS.textPrimary,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
  },
  bodyContent: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  seeAllText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
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
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  cardAvatarInitials: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  cardTitleText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
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
  amountColumnRight: {
    flex: 1,
    alignItems: 'flex-end',
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
    color: COLORS.textPrimary,
  },
  remainingAmountText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  progressTrack: {
    height: 8,
    backgroundColor: COLORS.bgLight,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.textPrimary,
    borderRadius: 4,
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spentSoFarText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  percentBadge: {
    backgroundColor: COLORS.bgLight,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  percentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginTop: 10,
    paddingVertical: 75,
  },
  emptyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  emptySubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 16,
    paddingHorizontal: 10,
  },
});