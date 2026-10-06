import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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

interface IncomeItem {
  id: string;
  user_id: string;
  source_name: string;
  amount: number;
  start_date: string;
  end_date: string;
  received_at: string;
}

export default function IncomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [incomes, setIncomes] = useState<IncomeItem[]>([]);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeItem | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchIncomes = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('income')
        .select('*')
        .eq('user_id', user.id)
        .order('start_date', { ascending: false });

      if (error) throw error;
      setIncomes(data || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchIncomes();
  }, []);

  const handleOpenAddModal = () => {
    const d = new Date();
    const todayStr = d.toISOString().split('T')[0];

    setEditingIncome(null);
    setSourceName('');
    setAmount('');
    setStartDate(todayStr);
    setEndDate('');
    setModalVisible(true);
  };

  const handleOpenEditModal = (item: IncomeItem) => {
    setEditingIncome(item);
    setSourceName(item.source_name);
    setAmount(String(item.amount));
    setStartDate(item.start_date);
    setEndDate(item.end_date);
    setModalVisible(true);
  };

  const handleSaveIncome = async () => {
    if (!sourceName.trim() || !amount.trim() || !startDate.trim() || !endDate.trim()) {
      Alert.alert('Validation Error', 'Please fill in all required fields.');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid amount.');
      return;
    }

    // Basic Date Format Validation (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      Alert.alert('Validation Error', 'Dates must be in YYYY-MM-DD format.');
      return;
    }

    if (startDate > endDate) {
      Alert.alert('Validation Error', 'Start Date cannot be later than End Date.');
      return;
    }

    // Check for Overlapping Dates with existing incomes
    const hasOverlap = incomes.some((item) => {
      if (editingIncome && item.id === editingIncome.id) {
        return false;
      }
      return startDate <= item.end_date && endDate >= item.start_date;
    });

    if (hasOverlap) {
      Alert.alert(
        'Date Overlap Error',
        'This income date range overlaps with an existing income record. Please choose a different date range.'
      );
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        user_id: user.id,
        source_name: sourceName.trim(),
        amount: parsedAmount,
        start_date: startDate,
        end_date: endDate,
        received_at: editingIncome ? editingIncome.received_at : new Date().toISOString(),
      };

      if (editingIncome) {
        const { error } = await supabase
          .from('income')
          .update(payload)
          .eq('id', editingIncome.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('income').insert([payload]);
        if (error) throw error;
      }

      setModalVisible(false);
      fetchIncomes();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteIncome = (id: string) => {
    Alert.alert(
      'Delete Income',
      'Are you sure you want to delete this income record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('income').delete().eq('id', id);
              if (error) throw error;
              fetchIncomes();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  // Status helper based on local date
  const isIncomeActive = (start: string, end: string) => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return start <= today && end >= today;
  };

  const activeIncomes = incomes.filter((i) => isIncomeActive(i.start_date, i.end_date));

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingCenter]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#38B2AC" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.iconCircleButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Income Sources</Text>
          <TouchableOpacity style={styles.iconCircleButton} onPress={handleOpenAddModal}>
            <Ionicons name="add-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchIncomes(); }} colors={['#1B494E']} />
        }
      >
        <View style={styles.bodyCard}>
          {/* Active Income Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Active Income</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{activeIncomes.length}</Text>
            </View>
          </View>

          {activeIncomes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="wallet-outline" size={36} color="#CBD5E1" />
              <Text style={styles.emptyText}>No active income stream found.</Text>
            </View>
          ) : (
            activeIncomes.map((item) => (
              <IncomeCard
                key={item.id}
                item={item}
                onEdit={() => handleOpenEditModal(item)}
                onDelete={() => handleDeleteIncome(item.id)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Add / Edit Modal */}
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>{editingIncome ? 'Edit Income' : 'Add Income'}</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Source Name (e.g. Allowance, Salary)"
              placeholderTextColor="#94A3B8"
              value={sourceName}
              onChangeText={setSourceName}
            />

            <TextInput
              style={styles.modalInput}
              placeholder="Amount (₱)"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />

            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Start Date</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                  value={startDate}
                  onChangeText={setStartDate}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>End Date</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                  value={endDate}
                  onChangeText={setEndDate}
                />
              </View>
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelBtn]} onPress={() => setModalVisible(false)} disabled={submitting}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.confirmBtn]} onPress={handleSaveIncome} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>{editingIncome ? 'Update' : 'Save'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Fixed Card Component with side-by-side header & properly constrained buttons
function IncomeCard({ item, onEdit, onDelete }: { item: IncomeItem; onEdit: () => void; onDelete: () => void }) {
  return (
    <View style={styles.incomeCard}>
      {/* Top Row: Icon + Title/Badge & Amount */}
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.statusBadge}>
            <Ionicons name="trending-up-outline" size={20} color="#319795" />
          </View>
          <View style={styles.titleWrapper}>
            <Text style={styles.sourceText} numberOfLines={1}>{item.source_name}</Text>
            <View style={styles.pillBadge}>
              <View style={styles.pillDot} />
              <Text style={styles.pillText}>Active Stream</Text>
            </View>
          </View>
        </View>

        <View style={styles.amountContainer}>
          <Text style={styles.amountText}>₱{Number(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
        </View>
      </View>

      <View style={styles.cardDivider} />

      {/* Bottom Row: Date Range & Action Buttons */}
      <View style={styles.cardFooterRow}>
        <View style={styles.dateContainer}>
          <Ionicons name="calendar-outline" size={13} color="#64748B" />
          <Text style={styles.dateText}>{item.start_date} → {item.end_date}</Text>
        </View>

        <View style={styles.actionButtonsRow}>
          <TouchableOpacity onPress={onEdit} style={styles.actionButton}>
            <Ionicons name="pencil-outline" size={14} color="#334155" />
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={[styles.actionButton, styles.deleteButtonBorder]}>
            <Ionicons name="trash-outline" size={14} color="#E11D48" />
            <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingCenter: { justifyContent: 'center', alignItems: 'center' },
  headerContainer: {
    backgroundColor: '#1F4F59',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ? NativeStatusBar.currentHeight + 12 : 40) : 10,
    paddingBottom: 20,
    borderBottomLeftRadius: 30, borderBottomRightRadius: 30,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  iconCircleButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: { flexGrow: 1, backgroundColor: '#F8FAF8', borderTopLeftRadius: 32, borderTopRightRadius: 32, },
  bodyCard: {
    flex: 1,
    backgroundColor: '#F8FAF8',
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1B494E' },
  countBadge: {
    backgroundColor: '#E6FFFA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  countBadgeText: { fontSize: 13, fontWeight: '700', color: '#319795' },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderStyle: 'dashed',
  },
  emptyText: { fontSize: 14, color: '#94A3B8', marginTop: 8, fontWeight: '500' },
  
  // Income Card Styles
  incomeCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#1B494E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
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
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#E6FFFA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleWrapper: {
    flex: 1,
  },
  sourceText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 3,
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#DEF7EC',
    gap: 4,
  },
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#059669',
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#065F46',
  },
  amountContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amountText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1B494E',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    marginRight: 6,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  deleteButtonBorder: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FFE3E3',
  },
  deleteButtonText: {
    color: '#E11D48',
  },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { backgroundColor: '#FFFFFF', width: '88%', padding: 20, borderRadius: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
  inputLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 4 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    borderRadius: 12,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
  },
  dateRow: { flexDirection: 'row', gap: 10 },
  modalButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  modalButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  cancelBtn: { backgroundColor: '#F1F5F9' },
  cancelBtnText: { color: '#475569', fontWeight: '600' },
  confirmBtn: { backgroundColor: '#1F4F59' },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '600' },
});