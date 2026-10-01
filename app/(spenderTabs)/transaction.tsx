import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const COLORS = {
  white: '#FFFFFF',
};

interface Transaction {
  id: string;
  amount: number;
  description: string;
  spent_at: string;
  photo_url?: string | null;
  allowance_id?: string | null;
  categories: {
    name: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
  };
}

interface Category {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

function TransactionsScreenContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Add/Edit Expense Modal States
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [allowanceIdInput, setAllowanceIdInput] = useState<string | null>(null);

  // Full-screen Image Viewer State
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  const handleBackPress = () => {
    router.push('/home'); 
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollTop(offsetY > 150);
  };

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleCloseModal = () => {
    setAmountInput('');
    setDescriptionInput('');
    setSelectedCategory(null);
    setEditingTransaction(null);
    setAllowanceIdInput(null);
    setIsAddModalVisible(false);
  };

  const handleOpenEditModal = (expense: Transaction) => {
    setEditingTransaction(expense);
    setAmountInput(expense.amount.toString());
    setDescriptionInput(expense.description);
    setAllowanceIdInput(expense.allowance_id || null);
    
    const matchedCat = categories.find(cat => cat.name === expense.categories.name);
    setSelectedCategory(matchedCat || null);
    setIsAddModalVisible(true);
  };

  const fetchCategories = async () => {
    try {
      const { data: catData, error: catErr } = await supabase
        .from('categories')
        .select('id, name, icon, color');

      if (catErr) throw catErr;
      
      const formattedCategories = (catData || []).map((cat: any) => ({
        ...cat,
        color: cat.color || '#1F4F59',
      }));

      setCategories(formattedCategories);
    } catch (err: any) {
      console.error('Error fetching categories:', err.message);
    }
  };

  const fetchTransactions = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      await fetchCategories();

      const { data, error } = await supabase
        .from('expenses')
        .select(`
          id,
          amount,
          description,
          spent_at,
          photo_url,
          allowance_id,
          categories (
            name,
            icon,
            color
          ),
          allowances!inner (
            is_archived
          )
        `)
        .eq('allowances.is_archived', false)
        .order('spent_at', { ascending: false });

      if (error) throw error;

      const formattedData = (data || []).map((expense: any) => {
        const rawCategory = Array.isArray(expense.categories) 
          ? expense.categories[0] 
          : expense.categories;

        return {
          id: expense.id,
          amount: Number(expense.amount),
          description: expense.description,
          spent_at: expense.spent_at,
          photo_url: expense.photo_url || null,
          allowance_id: expense.allowance_id || null,
          categories: {
            name: rawCategory?.name || 'Uncategorized',
            icon: rawCategory?.icon || 'receipt-outline',
            color: rawCategory?.color || '#64748B'
          }
        };
      });

      setTransactions(formattedData as Transaction[]);
    } catch (error: any) {
      console.error('Fetch Transactions Error:', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [fetchTransactions])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTransactions(true);
  }, [fetchTransactions]);

  const handleSaveExpense = async () => {
    const numericAmount = parseFloat(amountInput);
    if (!amountInput || isNaN(numericAmount) || numericAmount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (!descriptionInput.trim()) {
      alert('Please enter a description');
      return;
    }
    if (!selectedCategory) {
      alert('Please select a category');
      return;
    }

    try {
      setIsSubmitting(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        alert('You must be logged in to manage expenses.');
        setIsSubmitting(false);
        return;
      }

      // 1. Fetch the latest active allowance
      let targetAllowanceId = allowanceIdInput;
      let currentAllowance: any = null;

      if (targetAllowanceId) {
        const { data: specificAllowance } = await supabase
          .from('allowances')
          .select('*')
          .eq('id', targetAllowanceId)
          .single();
        currentAllowance = specificAllowance;
      }

      if (!currentAllowance) {
        const { data: latestAllowance } = await supabase
          .from('allowances')
          .select('*')
          .eq('spender_id', user.id)
          .order('received_at', { ascending: false })
          .limit(1)
          .single();

        if (latestAllowance) {
          currentAllowance = latestAllowance;
          targetAllowanceId = latestAllowance.id;
        }
      }

      // Rule 1: Prevent saving if there is no allowance available
      if (!currentAllowance) {
        alert('Cannot save expense: No active allowance found.');
        setIsSubmitting(false);
        return;
      }

      // Calculate current remaining balance for this allowance
      // Sum up existing expenses tied to this allowance (excluding current editing item if editing)
      let expensesQuery = supabase
        .from('expenses')
        .select('amount')
        .eq('allowance_id', targetAllowanceId);

      if (editingTransaction) {
        expensesQuery = expensesQuery.neq('id', editingTransaction.id);
      }

      const { data: existingExpenses } = await expensesQuery;
      const totalSpent = (existingExpenses || []).reduce((sum, item) => sum + Number(item.amount), 0);
      const remainingBalance = Number(currentAllowance.amount) - totalSpent;

      // Rule 2: Prevent saving if the amount exceeds the remaining allowance balance
      if (numericAmount > remainingBalance) {
        alert(`Expense exceeds remaining allowance balance (₱${remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}).`);
        setIsSubmitting(false);
        return;
      }

      if (editingTransaction) {
        const { error } = await supabase
          .from('expenses')
          .update({
            amount: numericAmount,
            description: descriptionInput.trim(),
            category_id: selectedCategory.id,
            allowance_id: targetAllowanceId || null,
          })
          .eq('id', editingTransaction.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('expenses').insert({
          amount: numericAmount,
          description: descriptionInput.trim(),
          category_id: selectedCategory.id,
          user_id: user.id,
          allowance_id: targetAllowanceId || null,
          spent_at: new Date().toISOString(),
        });

        if (error) throw error;
      }

      handleCloseModal();
      fetchTransactions();
    } catch (err: any) {
      console.error('Error saving expense:', err.message);
      alert('Failed to save expense: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = (id: string) => {
    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('expenses')
                .delete()
                .eq('id', id);

              if (error) throw error;
              fetchTransactions();
            } catch (err: any) {
              console.error('Error deleting expense:', err.message);
              alert('Failed to delete expense: ' + err.message);
            }
          },
        },
      ]
    );
  };

  const filteredTransactions = useMemo(() => {
    let filtered = transactions;
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      filtered = filtered.filter(tx => {
        const matchesDescription = tx.description?.toLowerCase().includes(query);
        const matchesCategory = tx.categories?.name?.toLowerCase().includes(query);
        return matchesDescription || matchesCategory;
      });
    }
    return filtered;
  }, [searchQuery, transactions]);

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const timeString = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    if (date.toDateString() === today.toDateString()) {
      return `Today at ${timeString}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${timeString}`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  if (loading && transactions.length === 0) {
    return (
      <View style={[styles.container, styles.centeredContent]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#1F4F59" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />

      {/* HEADER */}
      <View style={[
        styles.topBackgroundHeader, 
        { paddingTop: Platform.OS === 'android' ? insets.top + 12 : insets.top + 8 }
      ]}>
        <View style={styles.header}>
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={handleBackPress}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle} numberOfLines={1}>Transactions</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              setEditingTransaction(null);
              setIsAddModalVisible(true);
            }}
            style={styles.quickFormTrigger}
          >
            <Ionicons name="add" size={22} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* TRANSACTION LIST WITH PULL-TO-REFRESH */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 80, paddingTop: 16 }}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor="#1F4F59" 
            colors={['#1F4F59']} 
          />
        }
      >
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <View style={styles.searchContainer}>
            <View style={styles.searchWrapper}>
              <Ionicons name="search-outline" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search transactions or categories..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>
        </View>

        {filteredTransactions.length === 0 ? (
          <View style={styles.emptyTransactions}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="receipt-outline" size={28} color="#94A3B8" />
            </View>
            <Text style={styles.emptyText}>No Transactions Found</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 8 }}>
            {filteredTransactions.map((expense) => {
              const catColor = expense.categories?.color || '#64748B';
              return (
                <TouchableOpacity
                  key={expense.id}
                  activeOpacity={0.7}
                  onPress={() => handleOpenEditModal(expense)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: '#F8FAFC',
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: '#F1F5F9',
                  }}
                >
                  <View style={{ 
                    width: 40, 
                    height: 40, 
                    borderRadius: 10, 
                    backgroundColor: `${catColor}15`, 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    marginRight: 12 
                  }}>
                    <Ionicons name={expense.categories?.icon || 'receipt-outline'} size={18} color={catColor} />
                  </View>
                  
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }} numberOfLines={1}>
                        {expense.description}
                      </Text>
                      {expense.photo_url ? (
                        <TouchableOpacity 
                          onPress={() => setSelectedImageUri(expense.photo_url!)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="image-outline" size={14} color="#1F4F59" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginTop: 2 }}>
                      {formatDate(expense.spent_at)}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#DC2626' }}>
                      -₱{(expense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                    <TouchableOpacity 
                      onPress={() => handleDeleteExpense(expense.id)}
                      style={styles.deleteIconButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ADD / EDIT EXPENSE MODAL */}
      <Modal
        visible={isAddModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingTransaction ? 'Edit Expense' : 'Add Expense'}
              </Text>
              <TouchableOpacity onPress={handleCloseModal}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.calcInputContainer}>
              <TextInput
                style={styles.calcInput}
                placeholder="₱0.00"
                placeholderTextColor="#CBD5E1"
                keyboardType="numeric"
                value={amountInput}
                onChangeText={setAmountInput}
                autoFocus={true}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={styles.textInputStyle}
                placeholder="e.g., Grocery shopping, Coffee..."
                placeholderTextColor="#94A3B8"
                value={descriptionInput}
                onChangeText={setDescriptionInput}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {categories.map((cat) => {
                  const isSelected = selectedCategory?.id === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => setSelectedCategory(cat)}
                      style={[
                        styles.categoryChip,
                        { backgroundColor: isSelected ? '#1F4F59' : '#F8FAFC', borderColor: isSelected ? '#1F4F59' : '#E2E8F0' }
                      ]}
                    >
                      <Ionicons name={cat.icon || 'receipt-outline'} size={16} color={isSelected ? '#FFFFFF' : cat.color} />
                      <Text style={[styles.categoryChipText, { color: isSelected ? '#FFFFFF' : '#1E293B' }]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <TouchableOpacity 
              style={[styles.submitButton, isSubmitting && { opacity: 0.7 }]}
              onPress={handleSaveExpense}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {editingTransaction ? 'Update Expense' : 'Save Expense'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

      {showScrollTop && (
        <TouchableOpacity style={styles.scrollTopFAB} activeOpacity={0.8} onPress={scrollToTop}>
          <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  centeredContent: { justifyContent: 'center', alignItems: 'center' },
  topBackgroundHeader: { backgroundColor: '#1F4F59', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingBottom: 15 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.15)', justifyContent: 'center', alignItems: 'center' },
  headerContent: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3 },
  scrollContent: { flex: 1, backgroundColor: '#FFFFFF' },
  searchContainer: { paddingVertical: 4, marginTop: 4 },
  searchWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontSize: 13, color: '#0F172A', paddingVertical: 0 },
  emptyTransactions: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, paddingHorizontal: 36, gap: 8 },
  emptyIconContainer: { width: 56, height: 56, borderRadius: 14, backgroundColor: '#EFF4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#2D3748', letterSpacing: -0.3 },
  scrollTopFAB: { position: 'absolute', bottom: 24, right: 24, width: 42, height: 42, borderRadius: 21, backgroundColor: '#1F4F59', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  quickFormTrigger: { width: 38, height: 38, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  calcInputContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', paddingVertical: 12, marginBottom: 20 },
  calcInput: { fontSize: 36, fontWeight: '700', color: '#1E293B', minWidth: 140, textAlign: 'center' },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#64748B', marginBottom: 8 },
  textInputStyle: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, height: 46, fontSize: 14, color: '#1E293B' },
  categoryChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, gap: 6 },
  categoryChipText: { fontSize: 13, fontWeight: '600' },
  submitButton: { backgroundColor: '#1F4F59', borderRadius: 14, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  submitButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  deleteIconButton: { padding: 4, justifyContent: 'center', alignItems: 'center' },
  imageModalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.9)', justifyContent: 'center', alignItems: 'center' },
  fullScreenImage: { width: '90%', height: '80%' },
  closeImageButton: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 }
});

export default function TransactionsScreenWrapper() {
  return (
    <SafeAreaProvider>
      <TransactionsScreenContent />
    </SafeAreaProvider>
  );
}