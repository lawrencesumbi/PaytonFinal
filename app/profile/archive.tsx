import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../(spenderTabs)/profile';
import { supabase } from '../../lib/supabase';

export default function ArchiveScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [inactiveItems, setInactiveItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  
  // Search state for associated expenses
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchArchivedData();
  }, []);

  const fetchArchivedData = async () => {
    try {
      setLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) return;
      setUserRole(profile.role);

      const today = new Date().toISOString().split('T')[0];

      if (profile.role === 'Personal') {
        const { data: incomes, error } = await supabase
          .from('income')
          .select('*')
          .eq('user_id', user.id)
          .lt('end_date', today)
          .order('end_date', { ascending: false });

        if (!error) setInactiveItems(incomes || []);
      } else {
        const { data: allowances, error } = await supabase
          .from('allowances')
          .select('*')
          .or(`spender_id.eq.${user.id},sponsor_id.eq.${user.id}`)
          .lt('end_date', today)
          .order('end_date', { ascending: false });

        if (!error) setInactiveItems(allowances || []);
      }
    } catch (err) {
      console.error('Error fetching archive:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItem = async (item: any) => {
    setSelectedItem(item);
    setLoadingExpenses(true);
    setSearchQuery('');

    let query = supabase
      .from('expenses')
      .select(`
        *,
        budgets (
          categories (
            name,
            icon,
            color
          )
        )
      `);

    if (item.allowance_name) {
      query = query.eq('allowance_id', item.id);
    } else if (item.source_name) {
      query = query.eq('income_id', item.id);
    }

    const { data, error } = await query.order('spent_at', { ascending: false });

    if (!error) {
      setExpenses(data || []);
    }
    setLoadingExpenses(false);
  };

  // Function to handle deletion of allowance or income record
  const handleDeleteItem = (item: any) => {
    const isIncome = !!item.source_name;
    const tableName = isIncome ? 'income' : 'allowances';
    const itemName = item.allowance_name || item.source_name;

    Alert.alert(
      'Delete Record',
      `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from(tableName)
                .delete()
                .eq('id', item.id);

              if (error) {
                Alert.alert('Error', error.message);
              } else {
                // Remove from local state so UI updates instantly
                setInactiveItems((prev) => prev.filter((i) => i.id !== item.id));
              }
            } catch (err) {
              console.error('Error deleting item:', err);
              Alert.alert('Error', 'An unexpected error occurred while deleting.');
            }
          },
        },
      ]
    );
  };

  const handleBackToArchiveList = () => {
    setSelectedItem(null);
    setExpenses([]);
    setSearchQuery('');
  };

  const formatDateString = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const [year, month, day] = dateStr.split('-');
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: '2-digit',
        year: 'numeric',
      });
    } catch (e) {
      return dateStr;
    }
  };

  const formatDateRange = (startDateStr: string, endDateStr: string) => {
    if (!startDateStr || !endDateStr) return '';
    try {
      const [startYear, startMonth, startDay] = startDateStr.split('-');
      const [endYear, endMonth, endDay] = endDateStr.split('-');

      const startDate = new Date(Number(startYear), Number(startMonth) - 1, Number(startDay));
      const endDate = new Date(Number(endYear), Number(endMonth) - 1, Number(endDay));

      const startMonthName = startDate.toLocaleDateString('en-US', { month: 'long' });
      const endMonthName = endDate.toLocaleDateString('en-US', { month: 'long' });

      if (startYear === endYear && startMonth === endMonth) {
        return `${startMonthName} ${startDay} - ${endDay}, ${startYear}`;
      } else if (startYear === endYear) {
        return `${startMonthName} ${startDay} - ${endMonthName} ${endDay}, ${startYear}`;
      } else {
        return `${formatDateString(startDateStr)} - ${formatDateString(endDateStr)}`;
      }
    } catch (e) {
      return `${startDateStr} → ${endDateStr}`;
    }
  };

  const totalSpent = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalAmount = Number(selectedItem?.amount || 0);
  const totalRemaining = totalAmount - totalSpent;
  
  const remainingRatio = totalAmount > 0 ? Math.max(0, Math.min(totalRemaining / totalAmount, 1)) : 0;
  const isOverBudget = totalSpent > totalAmount;

  const filteredExpenses = expenses.filter((item) => {
    const desc = item.description?.toLowerCase() || '';
    const categoryName = item.budgets?.categories?.name?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();
    return desc.includes(query) || categoryName.includes(query);
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.modernHeader}>
        <TouchableOpacity 
          onPress={selectedItem ? handleBackToArchiveList : () => router.back()} 
          style={styles.backBtnTouchable}
        >
          <Ionicons name="arrow-back" size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleCentered} numberOfLines={1}>
          {selectedItem ? (selectedItem.allowance_name || selectedItem.source_name) : 'Archive Data'}
        </Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#173D45" />
        </View>
      ) : selectedItem ? (
        <View style={styles.detailContainer}>
          
          <View style={styles.cardDetail}>
            <View style={styles.cardTopRow}>
              <View>
                <Text style={styles.cardLabel}>Total Allocation</Text>
                <Text style={styles.cardAmount}>₱{totalAmount.toLocaleString()}</Text>
              </View>
              <View style={styles.validityBadge}>
                <Ionicons name="calendar-outline" size={12} color="#94a3b8" style={{ marginRight: 4 }} />
                <Text style={styles.cardDates}>
                  {formatDateRange(selectedItem.start_date, selectedItem.end_date)}
                </Text>
              </View>
            </View>

            <View style={styles.metricsGrid}>
              <View style={styles.metricBox}>
                <Text style={styles.metricTitle}>Total Spent</Text>
                <Text style={[styles.metricValue, { color: '#f87171' }]}>₱{totalSpent.toLocaleString()}</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricBox}>
                <Text style={styles.metricTitle}>Remaining</Text>
                <Text style={[styles.metricValue, { color: isOverBudget ? '#f87171' : '#34d399' }]}>
                  ₱{totalRemaining.toLocaleString()}
                </Text>
              </View>
            </View>

            <View style={styles.progressSection}>
              <View style={styles.progressHeaderRow}>
                <Text style={styles.progressLabel}>Remaining</Text>
                <Text style={styles.progressPercent}>{(remainingRatio * 100).toFixed(0)}%</Text>
              </View>
              <View style={styles.progressBarBackground}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { 
                      width: `${remainingRatio * 100}%`,
                      backgroundColor: isOverBudget ? '#ef4444' : '#34d399' 
                    }
                  ]} 
                />
              </View>
            </View>
          </View>

          <Text style={styles.sectionHeader}>Associated Expenses</Text>
          
          {!loadingExpenses && expenses.length > 0 && (
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={16} color="#94a3b8" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search description or category..."
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {loadingExpenses ? (
            <ActivityIndicator size="small" color="#173D45" style={{ marginTop: 20 }} />
          ) : expenses.length === 0 ? (
            <View style={styles.emptyExpenses}>
              <Ionicons name="receipt-outline" size={32} color="#cbd5e1" style={{ marginBottom: 8 }} />
              <Text style={styles.subTitle}>No expenses recorded under this record.</Text>
            </View>
          ) : filteredExpenses.length === 0 ? (
            <View style={styles.emptyExpenses}>
              <Ionicons name="search-outline" size={32} color="#cbd5e1" style={{ marginBottom: 8 }} />
              <Text style={styles.subTitle}>No matching expenses found.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredExpenses}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const category = item.budgets?.categories;
                const iconName = (category?.icon || 'pricetag-outline') as any;
                const iconBgColor = category?.color || '#e2e8f0';

                return (
                  <View style={styles.expenseItem}>
                    <View style={[styles.expenseIconContainer, { backgroundColor: iconBgColor }]}>
                      <Ionicons name={iconName} size={16} color="#173D45" />
                    </View>

                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={styles.expenseDesc}>{item.description || 'No Description'}</Text>
                      <Text style={styles.expenseDate}>{formatDateString(item.spent_at?.split('T')[0])}</Text>
                    </View>
                    <Text style={styles.expenseAmount}>-₱{Number(item.amount).toLocaleString()}</Text>
                  </View>
                );
              }}
              contentContainerStyle={{ paddingBottom: 30 }}
            />
          )}
        </View>
      ) : inactiveItems.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="archive-outline" size={40} color="#173D45" />
          </View>
          <Text style={styles.mainTitle}>Archive Empty</Text>
          <Text style={styles.subTitle}>You have no inactive records at this moment.</Text>
        </View>
      ) : (
        <FlatList
          data={inactiveItems}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <View style={styles.archiveCard}>
              <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => handleSelectItem(item)}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.itemTitle}>{item.allowance_name || item.source_name}</Text>
                  <View style={styles.itemSubtitleRow}>
                    <Ionicons name="time-outline" size={12} color="#64748B" style={{ marginRight: 4 }} />
                    <Text style={styles.itemSubtitle}>
                      {formatDateRange(item.start_date, item.end_date)}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                  <Text style={styles.itemAmount}>₱{Number(item.amount).toLocaleString()}</Text>
                  <View style={styles.chevronRow}>
                    <Text style={styles.viewDetailsText}>View</Text>
                    <Ionicons name="chevron-forward" size={14} color="#0f766e" />
                  </View>
                </View>
              </TouchableOpacity>

              {/* Delete Button - Hidden if userRole is 'Spender' */}
              {userRole !== 'Spender' && (
                <TouchableOpacity 
                  style={styles.deleteBtn} 
                  onPress={() => handleDeleteItem(item)}
                >
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f8fafc',
  },
  modernHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 44 : 20,
    paddingBottom: 20,
    backgroundColor: colors.headerDark,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  backBtnTouchable: { 
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  headerTitleCentered: { 
    flex: 1, 
    textAlign: 'center', 
    fontSize: 17, 
    fontWeight: '700', 
    color: '#ffffff', 
    marginHorizontal: 12,
  },
  centerContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 40 
  },
  iconCircle: { 
    width: 80, 
    height: 80, 
    borderRadius: 24, 
    backgroundColor: '#EBF6F5', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 20 
  },
  mainTitle: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#1E293B', 
    marginBottom: 8 
  },
  subTitle: { 
    fontSize: 14, 
    color: '#64748B', 
    textAlign: 'center', 
    lineHeight: 22 
  },
  listContainer: {
    padding: 20,
  },
  archiveCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    borderWidth: 3,
    borderColor: '#f1f5f9',
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  itemSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f766e',
    marginBottom: 4,
  },
  chevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewDetailsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f766e',
    marginRight: 2,
  },
  detailContainer: {
    flex: 1,
    padding: 20,
  },
  cardDetail: {
    backgroundColor: '#1F4F59',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#1F4F59',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 12,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cardAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
  },
  validityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: '55%',
  },
  cardDates: {
    fontSize: 10,
    color: '#cbd5e1',
    fontWeight: '500',
    flexShrink: 1,
  },
  metricsGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  metricTitle: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 2,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  progressSection: {
    marginTop: 4,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '500',
  },
  progressPercent: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '700',
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
  },
  emptyExpenses: {
    marginTop: 40,
    alignItems: 'center',
  },
  expenseItem: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  expenseIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  expenseDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  expenseDate: {
    fontSize: 11,
    color: '#94a3b8',
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ef4444',
  }
});