// app/monitoring.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import { supabase } from '../../lib/supabase';

interface AllowanceItem {
  id: string;
  allowance_name: string;
  amount: number;
  start_date: string;
  end_date: string;
  received_at: string;
}

interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
  spent_at: string;
  photo_url?: string | null;
  category_id?: string;
  categories?: {
    name?: string;
    icon?: string;
  };
}

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
  successGreen: '#16A34A',
};

export default function MonitoringScreen() {
  const router = useRouter();
  const { spenderId } = useLocalSearchParams<{ spenderId: string }>();

  const [loading, setLoading] = useState(true);
  const [spenderName, setSpenderName] = useState('Spender Log');
  const [allowances, setAllowances] = useState<AllowanceItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  
  // Search query state for filtered expenses
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  const fetchMonitoringData = async () => {
    if (!spenderId) return;
    try {
      setLoading(true);

      // Fetch Spender Profile Name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', spenderId)
        .single();

      if (profile?.full_name) {
        setSpenderName(profile.full_name);
      }

      // Fetch Allowances for this spender
      const { data: allowanceData, error: allowanceError } = await supabase
        .from('allowances')
        .select('*')
        .eq('spender_id', spenderId)
        .order('start_date', { ascending: false });

      if (allowanceError) throw allowanceError;
      setAllowances(allowanceData || []);

      // Fetch Expenses logged by this spender via their allowances
      const { data: expenseData, error: expenseError } = await supabase
        .from('expenses')
        .select(`
          id, description, amount, spent_at, category_id, photo_url,
          allowances!inner (spender_id),
          categories (name, icon)
        `)
        .eq('allowances.spender_id', spenderId)
        .order('spent_at', { ascending: false });

      if (expenseError) throw expenseError;
      setExpenses(
        (expenseData || []).map((expense) => ({
          ...expense,
          categories: Array.isArray(expense.categories)
            ? expense.categories[0]
            : expense.categories,
        }))
      );

    } catch (e: any) {
      console.error('Error loading monitoring data:', e.message);
    } finally {
      setLoading(false);
    }
  };

  // Automatically refresh every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchMonitoringData();
    }, [spenderId])
  );

  const handleDeleteAllowance = (allowanceId: string) => {
    Alert.alert('Delete Allowance', 'Are you sure you want to remove this allowance item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
        const { error } = await supabase.from('allowances').delete().eq('id', allowanceId);
          if (error) {
            Alert.alert('Error', 'Failed to delete allowance.');
          } else {
            fetchMonitoringData();
          }
        },
      },
    ]);
  };

  const formatDateTime = (dateStr: string) => {
    try {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + 
        ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const formatDateOnly = (dateStr: string) => {
    try {
      if (!dateStr) return '';
      const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatAllowanceDateRange = (startDate: string, endDate: string, receivedAt: string) => {
    if (startDate && endDate) {
      try {
        const startD = new Date(startDate.includes('T') ? startDate : `${startDate}T00:00:00`);
        const endD = new Date(endDate.includes('T') ? endDate : `${endDate}T00:00:00`);

        const startMonth = startD.toLocaleDateString('en-US', { month: 'short' });
        const endMonth = endD.toLocaleDateString('en-US', { month: 'short' });
        const startDay = startD.getDate();
        const endDay = endD.getDate();
        const startYear = startD.getFullYear();
        const endYear = endD.getFullYear();

        if (startMonth === endMonth && startDay === endDay && startYear === endYear) {
          return `${startMonth} ${startDay}, ${startYear}`;
        }

        if (startMonth === endMonth && startYear === endYear) {
          return `${startMonth} ${startDay} - ${endDay}, ${startYear}`;
        }

        return `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`;
      } catch {
        return `${formatDateOnly(startDate)} - ${formatDateOnly(endDate)}`;
      }
    }
    return formatDateOnly(startDate || receivedAt);
  };

  // Filter expenses matching the search input (checks description or category name)
  const filteredExpenses = expenses.filter((exp) => {
    const query = searchQuery.toLowerCase();
    const descriptionMatch = exp.description?.toLowerCase().includes(query);
    const categoryMatch = exp.categories?.name?.toLowerCase().includes(query);
    return descriptionMatch || categoryMatch;
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{spenderName}</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.deepTeal} style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.contentContainer}>
          
          {/* FIXED TOP SECTION (Allowances, Header, Search Bar) */}
          <View>
            {/* RECEIPT STYLE CONTAINER FOR ALLOWANCES */}
            <View style={styles.receiptCard}>
              <View style={styles.receiptHeaderRow}>
                <Ionicons name="receipt-outline" size={16} color={COLORS.deepTeal} />
                <Text style={styles.receiptTitle}>Allocated Allowances</Text>
              </View>

              <View style={styles.receiptDividerDashed} />

              {allowances.length === 0 ? (
                <Text style={styles.emptyReceiptText}>No allowances assigned yet.</Text>
              ) : (
                <ScrollView 
                  style={styles.allowancesScrollContainer} 
                  showsVerticalScrollIndicator={true}
                  nestedScrollEnabled={true}
                >
                  {allowances.map((item) => (
                    <View key={item.id} style={styles.receiptItemRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.receiptItemName} numberOfLines={1}>{item.allowance_name}</Text>
                        <Text style={styles.receiptItemDate}>
                          {formatAllowanceDateRange(item.start_date, item.end_date, item.received_at)}
                        </Text>
                      </View>
                      <View style={styles.receiptRightSection}>
                        <Text style={styles.receiptItemAmount}>+₱{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                        <TouchableOpacity onPress={() => handleDeleteAllowance(item.id)} style={styles.deleteAllowanceBtn}>
                          <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* EXPENSES LOG LIST HEADER */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>Logged Expenses</Text>
              <Text style={styles.expenseCountText}>{filteredExpenses.length} entries</Text>
            </View>

            {/* SEARCH BAR */}
            {expenses.length > 0 && (
              <View style={styles.searchContainer}>
                <Ionicons name="search-outline" size={18} color={COLORS.textMuted} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by description or category..."
                  placeholderTextColor={COLORS.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                    <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* SCROLLABLE EXPENSES LIST ONLY */}
          <ScrollView 
            contentContainerStyle={styles.expensesScrollContent} 
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {expenses.length === 0 ? (
              <View style={styles.emptyExpensesBox}>
                <Ionicons name="wallet-outline" size={24} color={COLORS.textMuted} />
                <Text style={styles.emptyExpensesText}>No expenses logged by spender yet.</Text>
              </View>
            ) : filteredExpenses.length === 0 ? (
              <View style={styles.emptyExpensesBox}>
                <Ionicons name="search-outline" size={24} color={COLORS.textMuted} />
                <Text style={styles.emptyExpensesText}>No expenses match your search.</Text>
              </View>
            ) : (
              <View style={styles.expensesListContainer}>
                {filteredExpenses.map((exp) => (
                  <View key={exp.id} style={styles.expenseCard}>
                    <View style={styles.expenseCategoryIconCircle}>
                      <Ionicons 
                        name={(exp.categories?.icon as any) || 'pricetag-outline'} 
                        size={18} 
                        color={COLORS.deepTeal} 
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.expenseName} numberOfLines={1}>{exp.description}</Text>
                        {/* Photo Indicator Icon */}
                        {exp.photo_url ? (
                          <TouchableOpacity 
                            onPress={() => setSelectedImageUri(exp.photo_url!)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="image-outline" size={14} color="#1F4F59" />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      <Text style={styles.expenseTime}>
                        {exp.categories?.name ? `${exp.categories.name} • ` : ''}{formatDateTime(exp.spent_at)}
                      </Text>
                    </View>
                    <Text style={styles.expenseAmount}>-₱{Number(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* FULL-SCREEN IMAGE VIEWER MODAL */}
          <Modal
            visible={!!selectedImageUri}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setSelectedImageUri(null)}
          >
            <View style={styles.imageModalOverlay}>
              <TouchableOpacity 
                style={styles.closeImageButton} 
                onPress={() => setSelectedImageUri(null)}
              >
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
              {selectedImageUri ? (
                <Image 
                  source={{ uri: selectedImageUri }} 
                  style={styles.fullScreenImage} 
                  resizeMode="contain" 
                />
              ) : null}
            </View>
          </Modal>

        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    backgroundColor: COLORS.headerBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingTop: 40,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
    flex: 1,
    textAlign: 'center',
  },
  contentContainer: {
    flex: 1,
    padding: 20,
  },
  receiptCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    marginBottom: 20,
  },
  receiptHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  receiptTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.darkOlive,
  },
  receiptDividerDashed: {
    height: 1,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderStyle: 'dashed',
    marginBottom: 12,
  },
  allowancesScrollContainer: {
    maxHeight: 185,
  },
  emptyReceiptText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  receiptItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F8F4',
  },
  receiptItemName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.darkOlive,
  },
  receiptItemDate: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  receiptRightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  receiptItemAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.successGreen,
  },
  deleteAllowanceBtn: {
    padding: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.darkOlive,
  },
  expenseCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.darkOlive,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 2,
  },
  expensesScrollContent: {
    paddingBottom: 40,
  },
  emptyExpensesBox: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  emptyExpensesText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  expensesListContainer: {
    gap: 7,
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  expenseCategoryIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EAF6F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expenseName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.darkOlive,
  },
  expenseTime: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.danger,
  },
  imageModalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.9)', justifyContent: 'center', alignItems: 'center' },
  fullScreenImage: { width: '90%', height: '80%' },
  closeImageButton: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 }
});