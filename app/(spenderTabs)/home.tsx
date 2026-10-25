import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Polygon,
  Polyline,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { supabase } from '../../lib/supabase';

const COLORS = {
  black: '#000000',
  headerDark: '#013237',
  deepTeal: '#013237',
  cyan: '#4CA771',
  cyanLight: '#C0E6BA',      // fixed: was '#COE6BA' (letter O instead of zero = invalid color)
  olive: '#4CA771',
  yellowGreen: '#C0E6BA',    // fixed: same typo as above
  darkOlive: '#013237',
  bg: '#EAF9E7',
  card: '#FFFFFF',
  white: '#FFFFFF',
  textMuted: '#64748B',
  overlay: 'rgba(1, 50, 55, 0.5)',
  modalShadow: '#013237',

  // Redesign tokens
  primary: '#2F5D5E',
  headerGradientTop: '#6DB596',
  headerGradientBottom: '#2F5D5E',
  balanceTrack: '#E8F7EA',
  surfaceSoft: '#F6F8F7',
  border: '#EAEFEC',
  donutTrack: '#F1F3F2',
  expenseRed: '#E5252A',
};

// Vivid, clearly distinguishable category colors (matches the reference donut)
const CATEGORY_COLORS = [
  '#4C6FFF', // blue
  '#14D2BC', // teal
  '#FFA62B', // orange
  '#FF4FA8', // pink
  '#8B5CF6', // violet
  '#4CA771', // brand green
];

const PALETTE_LIGHT_CARDS = [
  '#F6F8F7',
  '#F2F8F3',
  '#F6F8F7',
];

const DUE_TILE_COLORS = ['#4CA771', '#1F8A83'];

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Display-only helper for the due-date tile ("14" / "Oct")
function getDateParts(dateStr: string): { day: string; month: string } {
  const [, month, day] = (dateStr || '').split('-').map(Number);
  return {
    day: day ? String(day) : '',
    month: MONTH_SHORT[(month || 0) - 1] || '',
  };
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ---------- Collapsing header geometry (UI only) ----------
const H_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 16 : 56;
const HEADER_EXPANDED_H = H_INSET + 254;
const HEADER_COLLAPSED_H = H_INSET + 92;
const HEADER_SCROLL_RANGE = HEADER_EXPANDED_H - HEADER_COLLAPSED_H;
const AMOUNT_SHIFT = (H_INSET + 69) - (H_INSET + 180); // moves the amount line up into the compact bar

// ---------- Expense period filter ----------
type CategoryPeriod = 'daily' | 'weekly' | 'monthly';

const PERIOD_OPTIONS: { key: CategoryPeriod; label: string; hint: string; empty: string; icon: string }[] = [
  { key: 'daily', label: 'Daily', hint: 'Today', empty: 'today', icon: 'today-outline' },
  { key: 'weekly', label: 'Weekly', hint: 'This week (Mon–Sun)', empty: 'this week', icon: 'calendar-outline' },
  { key: 'monthly', label: 'Monthly', hint: 'This month', empty: 'this month', icon: 'calendar-number-outline' },
];

function isInPeriod(spentAt: string | null | undefined, period: CategoryPeriod): boolean {
  if (!spentAt) return false;
  const d = new Date(spentAt);
  if (isNaN(d.getTime())) return false;

  const now = new Date();
  if (period === 'daily') {
    return d.toDateString() === now.toDateString();
  }
  if (period === 'weekly') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return d >= start && d < end;
  }
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

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

function formatReadableDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function generateDateRange() {
  const dates = [];
  const today = new Date();
  
  for (let i = -7; i <= 7; i++) {
    const d = new Date();
    d.setDate(today.getDate() + i);
    dates.push({
      dateString: d.toISOString().split('T')[0],
      dayName: d.toLocaleString('en-US', { weekday: 'short' }).toUpperCase(),
      dayNumber: d.getDate(),
      monthStr: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
      isToday: i === 0,
      isSeeMore: false,
    });
  }

  dates.push({
    isSeeMore: true,
  });

  return dates;
}

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
  category_id?: string | null;
  categories?: {
    name?: string;
    icon?: string;
  } | null;
}

interface CategoryItem {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

interface CategoryStat {
  categoryId: string;
  categoryName: string;
  icon?: string;
  total: number;
  percentage: number;
  color: string;
}

interface DailyTrendItem {
  dateStr: string;
  displayDay: string;
  amount: number;
}

interface DueDatesCalendarModalProps {
  visible: boolean;
  selectedDate: string;
  dues: ReminderItem[];
  onClose: () => void;
  onSelectDate: (dateString: string) => void;
}

function DueDatesCalendarModal({
  visible,
  selectedDate,
  dues,
  onClose,
  onSelectDate,
}: DueDatesCalendarModalProps) {
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    dues.forEach((due) => {
      if (due.status === 'pending') {
        marks[due.due_date] = {
          marked: true,
          dotColor: COLORS.olive,
        };
      }
    });

    marks[selectedDate] = {
      ...(marks[selectedDate] || {}),
      selected: true,
      selectedColor: COLORS.primary,
      selectedTextColor: COLORS.white,
      ...(marks[selectedDate]?.marked ? { dotColor: COLORS.yellowGreen } : {}),
    };

    return marks;
  }, [dues, selectedDate]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Upcoming Dues</Text>
              <Text style={styles.modalSubtitle}>Tap a date to view its reminders</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.calendarCard}>
            <Calendar
              current={selectedDate}
              onDayPress={(day) => onSelectDate(day.dateString)}
              markedDates={markedDates}
              enableSwipeMonths
              theme={{
                backgroundColor: COLORS.card,
                calendarBackground: COLORS.card,
                textSectionTitleColor: COLORS.textMuted,
                selectedDayBackgroundColor: COLORS.primary,
                selectedDayTextColor: COLORS.white,
                todayTextColor: COLORS.cyan,
                dayTextColor: COLORS.darkOlive,
                textDisabledColor: '#CBD5E1',
                dotColor: COLORS.olive,
                selectedDotColor: COLORS.yellowGreen,
                arrowColor: COLORS.primary,
                monthTextColor: COLORS.darkOlive,
                textDayFontWeight: '600',
                textMonthFontWeight: '700',
                textDayHeaderFontWeight: '700',
                textDayFontSize: 15,
                textMonthFontSize: 17,
                textDayHeaderFontSize: 12,
              }}
            />
          </View>

          <View style={styles.calendarLegendRow}>
            <View style={styles.calendarLegendDot} />
            <Text style={styles.calendarLegendText}>Has pending dues</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function SpenderHomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spenderName, setSpenderName] = useState('Patricia Ann');
  const [spenderRole, setSpenderRole] = useState('Spender');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [upcomingDues, setUpcomingDues] = useState<ReminderItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  
  const [expenseRecords, setExpenseRecords] = useState<any[]>([]);
  const [categoryPeriod, setCategoryPeriod] = useState<CategoryPeriod>('monthly');
  const [periodMenuVisible, setPeriodMenuVisible] = useState(false);

  // Category breakdown for the selected period (Daily / Weekly / Monthly)
  const { categoryStats, overallTotalExpenses } = useMemo(() => {
    const filtered = expenseRecords.filter((exp: any) => isInPeriod(exp.spent_at, categoryPeriod));
    const total = filtered.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0);

    const categoryMap: { [key: string]: { name: string; icon?: string; total: number } } = {};
    filtered.forEach((exp: any) => {
      const catId = exp.category_id || 'uncategorized';
      const catName = exp.categories?.name || 'Uncategorized';
      const catIcon = exp.categories?.icon;
      const amt = Number(exp.amount || 0);

      if (!categoryMap[catId]) {
        categoryMap[catId] = { name: catName, icon: catIcon, total: 0 };
      }
      categoryMap[catId].total += amt;
    });

    const stats: CategoryStat[] = Object.keys(categoryMap).map((catId, index) => {
      const item = categoryMap[catId];
      const percentage = total > 0 ? (item.total / total) * 100 : 0;
      return {
        categoryId: catId,
        categoryName: item.name,
        icon: item.icon,
        total: item.total,
        percentage,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      };
    });

    return { categoryStats: stats, overallTotalExpenses: total };
  }, [expenseRecords, categoryPeriod]);
  const [dailyTrends, setDailyTrends] = useState<DailyTrendItem[]>([]);
  
  const dateList = generateDateRange();
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [modalVisible, setModalVisible] = useState(false);
  const horizontalScrollRef = useRef<ScrollView>(null);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newDueDate, setNewDueDate] = useState(todayStr);
  const [newCategoryId, setNewCategoryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [reminderToDelete, setReminderToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isCalendarModalVisible, setIsCalendarModalVisible] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const mainScrollRef = useRef<any>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const headerCollapsedRef = useRef(false);

  const centerToday = (animated = false) => {
    const todayIndex = dateList.findIndex(item => item.isToday);
    const dateBoxWidth = 54; 
    const dateBoxGap = 8;         
    const containerPadding = 24; 

    const totalItemWidth = dateBoxWidth + dateBoxGap;
    const computedX = (todayIndex * totalItemWidth) - (SCREEN_WIDTH / 2 - containerPadding - (dateBoxWidth / 2));

    horizontalScrollRef.current?.scrollTo({
      x: Math.max(0, computedX),
      animated: animated,
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      centerToday(false);
    }, 150);

    return () => clearTimeout(timer);
  }, []);

  const fetchCategories = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let query = supabase.from('categories').select('id, name, icon, color');
      
      if (user) {
        query = query.or(`user_id.eq.${user.id},user_id.is.null`);
      } else {
        query = query.is('user_id', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCategories(data || []);
    } catch (error: unknown) {
      console.error('Error fetching categories:', extractErrorMessage(error));
    }
  };

  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, role')
        .eq('id', user.id)
        .single();

      if (profileData?.full_name) setSpenderName(profileData.full_name);
      if (profileData?.avatar_url) setAvatarUrl(profileData.avatar_url);
      if (profileData?.role) setSpenderRole(profileData.role);

      const { data: allowanceData, error: allowanceError } = await supabase
        .from('allowances')
        .select('id, allowance_name, amount, received_at')
        .eq('spender_id', user.id)
        .eq('is_archived', false)
        .order('received_at', { ascending: false });

      if (allowanceError) throw allowanceError;

      let totalSpentCounter = 0;
      let combinedTotalAllowance = 0;

      if (allowanceData && allowanceData.length > 0) {
        const allowanceIds = allowanceData.map((item) => item.id);
        
        combinedTotalAllowance = allowanceData.reduce(
          (sum, item) => sum + Number(item.amount || 0),
          0
        );

        const { data: expensesData, error: expensesError } = await supabase
          .from('expenses')
          .select(`
            id, 
            amount, 
            allowance_id,
            category_id,
            spent_at,
            categories ( id, name, icon )
          `)
          .in('allowance_id', allowanceIds);

        if (expensesError) throw expensesError;

        totalSpentCounter = (expensesData || []).reduce(
          (sum: number, exp: any) => sum + Number(exp.amount || 0),
          0
        );

        setExpenseRecords(expensesData || []);

        const todayObj = new Date();
        const trendData: DailyTrendItem[] = [];
        
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(todayObj.getDate() - i);
          const yyyyMmDd = d.toISOString().split('T')[0];
          const displayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

          const dayExpenses = (expensesData || []).filter((exp: any) => exp.spent_at?.startsWith(yyyyMmDd));
          const dayTotal = dayExpenses.reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0);

          trendData.push({
            dateStr: yyyyMmDd,
            displayDay: displayLabel,
            amount: dayTotal,
          });
        }
        setDailyTrends(trendData);

        setSummary({
          allowanceId: allowanceIds[0], 
          allowanceName: allowanceData.map(a => a.allowance_name).join(', '),
          totalAllowance: combinedTotalAllowance,
          totalSpent: totalSpentCounter,
          remaining: combinedTotalAllowance - totalSpentCounter,
          unallocated: 0,
        });
      } else {
        setSummary(null);
        setExpenseRecords([]);
        setDailyTrends([]);
      }

      const { data: duesData, error: duesError } = await supabase
        .from('reminders')
        .select(`
          id,
          title,
          amount,
          due_date,
          status,
          category_id,
          categories ( name, icon )
        `)
        .eq('user_id', user.id)
        .in('status', ['pending', 'paid'])
        .order('due_date', { ascending: true });

      if (duesError) throw duesError;
      setUpcomingDues((duesData as unknown as ReminderItem[]) || []);

      await fetchCategories();

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
      setSelectedDate(todayStr);
      centerToday(true);
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    setSelectedDate(todayStr);
    fetchDashboardData().then(() => {
      setTimeout(() => centerToday(true), 100);
    });
  };

  const resetForm = () => {
    setNewTitle('');
    setNewAmount('');
    setNewDueDate(todayStr);
    setNewCategoryId(null);
    setSubmitting(false);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleCalendarDateSelect = (dateString: string) => {
    setSelectedDate(dateString);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsCalendarModalVisible(false);
    setTimeout(() => setModalVisible(true), 350);
  };

  const handleCreateReminder = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!newTitle.trim() || !newAmount.trim()) {
      setErrorMessage('Please fill in both title and amount.');
      return;
    }

    if (!newCategoryId) {
      setErrorMessage('Please choose a category for this reminder.');
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newDueDate)) {
      setErrorMessage('Invalid due date. Please use YYYY-MM-DD.');
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const parsedAmount = parseFloat(newAmount);

      const { error } = await supabase.from('reminders').insert({
        user_id: user.id,
        title: newTitle.trim(),
        amount: parsedAmount,
        due_date: newDueDate,
        status: 'pending',
        allowance_id: summary?.allowanceId || null,
        category_id: newCategoryId,
      });

      if (error) throw error;

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `created reminder "${newTitle.trim()}" (${parsedAmount}).`,
      });

      setSuccessMessage('Reminder saved successfully!');
      fetchDashboardData();

      setTimeout(() => {
        resetForm();
        setAddModalVisible(false);
        setSuccessMessage(null);
      }, 1000);

    } catch (error: unknown) {
      console.error('Error adding reminder:', extractErrorMessage(error));
      setErrorMessage('Failed to save reminder. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReminder = (reminderId: string, reminderTitle: string) => {
    setReminderToDelete({ id: reminderId, title: reminderTitle });
    setDeleteModalVisible(true);
  };

  const confirmDeleteReminder = async () => {
    if (!reminderToDelete) return;

    try {
      setIsDeleting(true);
      const { error } = await supabase
        .from('reminders')
        .delete()
        .eq('id', reminderToDelete.id);

      if (error) throw error;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('logs').insert({
          user_id: user.id,
          details: `deleted reminder "${reminderToDelete.title || reminderToDelete.id}".`,
        });
      }

      fetchDashboardData();
      setErrorMessage(null);
      setSuccessMessage(`Successfully deleted "${reminderToDelete.title || 'reminder'}"`);
      setDeleteModalVisible(false);
      setReminderToDelete(null);

      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);

    } catch (error: unknown) {
      console.error('Error deleting reminder:', extractErrorMessage(error));
      setSuccessMessage(null);
      setErrorMessage('Failed to delete reminder.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSettleReminder = async (reminder: ReminderItem) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: allowances, error: allowanceFetchError } = await supabase
        .from('allowances')
        .select('amount')
        .eq('spender_id', user.id)
        .eq('is_archived', false);

      if (allowanceFetchError) throw allowanceFetchError;

      if (!allowances || allowances.length === 0) {
        setErrorMessage('Cannot settle reminder: No allowance records found.');
        return;
      }

      const totalAllowance = allowances.reduce((sum, item) => sum + Number(item.amount), 0);

      const { data: expenses, error: expenseFetchError } = await supabase
        .from('expenses')
        .select(`
          amount,
          allowances!inner (
            is_archived
          )
        `)
        .eq('user_id', user.id)
        .eq('allowances.is_archived', false);

      if (expenseFetchError) throw expenseFetchError;

      const totalExpenses = expenses ? expenses.reduce((sum, item) => sum + Number(item.amount), 0) : 0;
      const remaining = totalAllowance - totalExpenses;

      if (reminder.amount > remaining) {
        setErrorMessage(`Cannot settle reminder: The amount (${reminder.amount}) exceeds your remaining balance (${remaining}).`);
        return;
      }

      const { error: updateError } = await supabase
        .from('reminders')
        .update({ status: 'paid' })
        .eq('id', reminder.id);

      if (updateError) throw updateError;

      const { error: expenseError } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          description: reminder.title,
          amount: reminder.amount,
          category_id: reminder.category_id || null,
          allowance_id: summary?.allowanceId || null,
          spent_at: new Date().toISOString(),
        });

      if (expenseError) throw expenseError;

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `settled reminder "${reminder.title}" (${reminder.amount}).`,
      });

      setSuccessMessage(`"${reminder.title}" has been settled and recorded.`);
      fetchDashboardData();
    } catch (error: unknown) {
      console.error('Error settling reminder:', extractErrorMessage(error));
      setErrorMessage('Failed to settle reminder.');
    }
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

  const hasPendingOnDate = (dateStr: string) => {
    return upcomingDues.some(due => due.due_date === dateStr && due.status === 'pending');
  };

  const handleDatePress = (dateStr: string) => {
    setSelectedDate(dateStr);
    setModalVisible(true);
  };

  const filteredDues = upcomingDues.filter(due => due.due_date === selectedDate);
  const selectedDaysInfo = getDaysInfo(selectedDate);

  // ---------- UI-only layout values ----------
  const size = 190;
  const strokeWidth = 24;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const segmentGap = 6; // visual gap between donut segments

  const CONTENT_WIDTH = SCREEN_WIDTH - 40;
  const DONUT_AREA_HEIGHT = 250;
  const labelRadius = radius + strokeWidth / 2 + 20;
  const DUE_CARD_GAP = 12;
  const DUE_CARD_WIDTH = (CONTENT_WIDTH - DUE_CARD_GAP) / 2;

  // Donut segments + label positions (derived from the same categoryStats data)
  let runningPercent = 0;
  const donutSegments = categoryStats.map((stat) => {
    const startPercent = runningPercent;
    runningPercent += stat.percentage;

    const midAngle = ((startPercent + stat.percentage / 2) / 100) * 2 * Math.PI; // clockwise from top
    const arcLength = (circumference * stat.percentage) / 100;
    const full = stat.percentage >= 99.5;
    const dashLength = full ? circumference : Math.max(0.1, arcLength - strokeWidth - segmentGap);
    const startOffsetPx = strokeWidth / 2 + segmentGap / 2;
    const rotation = full ? -90 : (startPercent / 100) * 360 - 90 + (startOffsetPx / radius) * (180 / Math.PI);

    return {
      stat,
      full,
      dashLength,
      rotation,
      labelX: CONTENT_WIDTH / 2 + (labelRadius + Math.abs(Math.sin(midAngle)) * 10) * Math.sin(midAngle),
      labelY: DONUT_AREA_HEIGHT / 2 - labelRadius * Math.cos(midAngle),
    };
  });

  const pendingDues = upcomingDues.filter((due) => due.status === 'pending');
  const roleLabel = spenderRole ? spenderRole.charAt(0).toUpperCase() + spenderRole.slice(1) : 'Spender';
  const selectedPeriod = PERIOD_OPTIONS.find((p) => p.key === categoryPeriod) || PERIOD_OPTIONS[2];

  // Header collapse animation: transforms + opacity only, so it runs on the native thread
  const clampTo = (outputRange: number[], inputRange: number[] = [0, HEADER_SCROLL_RANGE]) =>
    scrollY.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });

  const headerTranslateY = clampTo([0, -HEADER_SCROLL_RANGE]);        // whole header slides up
  const pinnedTranslateY = clampTo([0, HEADER_SCROLL_RANGE]);         // compact bar + thin bar stay put
  const expandedOpacity = clampTo([1, 0], [0, HEADER_SCROLL_RANGE * 0.45]);
  const labelOpacity = clampTo([1, 0], [0, HEADER_SCROLL_RANGE * 0.3]);
  const thickPillOpacity = clampTo([1, 0], [HEADER_SCROLL_RANGE * 0.1, HEADER_SCROLL_RANGE * 0.55]);
  const thinPillOpacity = clampTo([0, 1], [HEADER_SCROLL_RANGE * 0.35, HEADER_SCROLL_RANGE * 0.8]);
  const compactOpacity = clampTo([0, 1], [HEADER_SCROLL_RANGE * 0.5, HEADER_SCROLL_RANGE * 0.9]);
  const amountTranslateY = clampTo([0, AMOUNT_SHIFT + HEADER_SCROLL_RANGE]);
  const amountScale = clampTo([1, 0.45]);

  const snapHeader = (offsetY: number) => {
    if (offsetY > 0 && offsetY < HEADER_SCROLL_RANGE) {
      const node = mainScrollRef.current?.getNode?.() ?? mainScrollRef.current;
      node?.scrollTo({ y: offsetY < HEADER_SCROLL_RANGE / 2 ? 0 : HEADER_SCROLL_RANGE, animated: true });
    }
  };

  return (
    <View style={styles.mainContainer}>
      <ExpoStatusBar style="light" />

      {/* HEADER (collapses on scroll) */}
      <Animated.View style={[styles.headerBackground, { transform: [{ translateY: headerTranslateY }] }]}>
        <Svg width={SCREEN_WIDTH} height={HEADER_EXPANDED_H} style={styles.headerGradient}>
          <Defs>
            <LinearGradient id="headerGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={COLORS.headerGradientTop} />
              <Stop offset="1" stopColor={COLORS.headerGradientBottom} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={SCREEN_WIDTH} height={HEADER_EXPANDED_H} fill="url(#headerGradient)" />
        </Svg>

        {/* Expanded greeting row */}
        <Animated.View
          pointerEvents={headerCollapsed ? 'none' : 'auto'}
          style={[styles.headerExpandedRow, { opacity: expandedOpacity }]}
        >
          <View style={styles.userProfileGroup}>
            <TouchableOpacity onPress={() => router.push('/profile')} activeOpacity={0.8}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>{spenderName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.greetingGroup}>
              <Text style={styles.helloText}>Hello,</Text>
              <Text style={styles.userNameText} numberOfLines={1}>
                {spenderName}
              </Text>
            </View>
          </View>

          <View style={styles.roleBadgeContainer}>
            <Text style={styles.roleBadgeText} numberOfLines={1}>
              {roleLabel}
            </Text>
          </View>
        </Animated.View>

        {/* Compact bar (appears when collapsed) */}
        <Animated.View
          pointerEvents={headerCollapsed ? 'auto' : 'none'}
          style={[styles.headerCompactRow, { opacity: compactOpacity, transform: [{ translateY: pinnedTranslateY }] }]}
        >
          <TouchableOpacity
            onPress={() => router.push('/profile')}
            activeOpacity={0.8}
            style={styles.compactProfile}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.compactAvatar} />
            ) : (
              <View style={[styles.compactAvatar, styles.compactAvatarFallback]}>
                <Text style={styles.compactAvatarInitial}>{spenderName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.compactName} numberOfLines={1}>{spenderName}</Text>
          </TouchableOpacity>

          <View style={styles.roleBadgeContainer}>
            <Text style={styles.roleBadgeText} numberOfLines={1}>
              {roleLabel}
            </Text>
          </View>
        </Animated.View>

        {/* Shared balance block: label fades, bar thins, amount shrinks upward */}
        <Animated.Text style={[styles.balanceLabel, { opacity: labelOpacity }]}>Remaining Balance</Animated.Text>

        <Animated.View style={[styles.pillTrack, { opacity: thickPillOpacity }]}>
          <View style={[styles.pillFill, { width: `${remainingPercentage}%` }]} />
        </Animated.View>
        <Animated.View
          style={[styles.pillTrackThin, { opacity: thinPillOpacity, transform: [{ translateY: pinnedTranslateY }] }]}
        >
          <View style={[styles.pillFill, { width: `${remainingPercentage}%` }]} />
        </Animated.View>

        <Animated.View
          style={[styles.balanceAmountRow, { transform: [{ translateY: amountTranslateY }, { scale: amountScale }] }]}
        >
          <Text style={styles.pillAmountText}>
            ₱{summary ? summary.remaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '1,998.65'}
          </Text>
          <Text style={styles.pillAmountSlash}>/</Text>
          <Text style={styles.pillAmountTotal}>
            ₱{summary ? summary.totalAllowance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '7,045'}
          </Text>
        </Animated.View>
      </Animated.View>

      {/* SCROLLABLE CONTENT */}
      <Animated.ScrollView
        ref={mainScrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.cyan]}
            tintColor={COLORS.cyan}
            progressViewOffset={HEADER_EXPANDED_H}
          />
        }
        showsVerticalScrollIndicator={false}
        bounces
        scrollEventThrottle={16}
        onScrollBeginDrag={() => setPeriodMenuVisible(false)}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: (e: any) => {
            const collapsed = e.nativeEvent.contentOffset.y > HEADER_SCROLL_RANGE * 0.5;
            if (collapsed !== headerCollapsedRef.current) {
              headerCollapsedRef.current = collapsed;
              setHeaderCollapsed(collapsed);
            }
          },
        })}
        onScrollEndDrag={(e) => {
          const v = e.nativeEvent.velocity?.y;
          if (v !== undefined && Math.abs(v) < 0.1) snapHeader(e.nativeEvent.contentOffset.y);
        }}
        onMomentumScrollEnd={(e) => snapHeader(e.nativeEvent.contentOffset.y)}
      >
        {periodMenuVisible && (
          <TouchableOpacity
            activeOpacity={1}
            style={styles.periodBackdrop}
            onPress={() => setPeriodMenuVisible(false)}
          />
        )}

        {/* UPCOMING DUES */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Upcoming Dues</Text>
            <View style={styles.sectionActions}>
              <TouchableOpacity
                onPress={() => setIsCalendarModalVisible(true)}
                style={styles.calendarIconBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar-outline" size={16} color={COLORS.deepTeal} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAddModalVisible(true)} style={styles.reminderBtn} activeOpacity={0.8}>
                <Ionicons name="add" size={14} color={COLORS.deepTeal} />
                <Text style={styles.reminderText}>Set Reminders</Text>
              </TouchableOpacity>
            </View>
          </View>

          {pendingDues.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.dueCardsScroll}
              contentContainerStyle={styles.dueCardsRow}
              snapToInterval={DUE_CARD_WIDTH + DUE_CARD_GAP}
              snapToAlignment="start"
              decelerationRate="fast"
            >
              {pendingDues.map((due, index) => {
                const parts = getDateParts(due.due_date);
                const daysInfo = getDaysInfo(due.due_date);

                return (
                  <TouchableOpacity
                    key={due.id}
                    activeOpacity={0.85}
                    onPress={() => handleDatePress(due.due_date)}
                    style={[styles.dueCard, { width: DUE_CARD_WIDTH }]}
                  >
                    <View style={styles.dueCardTop}>
                      <View style={[styles.dueDateTile, { backgroundColor: DUE_TILE_COLORS[index % DUE_TILE_COLORS.length] }]}>
                        <Text style={styles.dueDateDay}>{parts.day}</Text>
                        <Text style={styles.dueDateMonth}>{parts.month}</Text>
                      </View>

                      <View style={styles.dueCardInfo}>
                        <Text style={styles.dueTitle} numberOfLines={1}>{due.title}</Text>
                        <Text style={styles.dueAmount} numberOfLines={1}>
                          ₱{Number(due.amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.dueCardBottom}>
                      <Text style={[styles.dueMeta, daysInfo.urgent && styles.dueMetaUrgent]} numberOfLines={1}>
                        Due {parts.month} {parts.day} · {daysInfo.text}
                      </Text>
                      <Ionicons name="chevron-forward" size={12} color={COLORS.textMuted} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.dueEmptyCard}>
              <Ionicons name="checkmark-circle-outline" size={26} color={COLORS.cyan} />
              <Text style={styles.dueEmptyTitle}>No upcoming dues</Text>
              <Text style={styles.dueEmptyText}>Tap “Set Reminders” to add one.</Text>
            </View>
          )}
        </View>

        {/* EXPENSE PER CATEGORY */}
        <View style={[styles.sectionBlock, styles.periodSection]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Expense per Category</Text>
            <TouchableOpacity
              style={styles.dropdownContainer}
              activeOpacity={0.8}
              onPress={() => setPeriodMenuVisible((v) => !v)}
            >
              <Text style={styles.dropdownText}>{selectedPeriod.label}</Text>
              <Ionicons name={periodMenuVisible ? 'chevron-up' : 'chevron-down'} size={12} color={COLORS.deepTeal} />
            </TouchableOpacity>
          </View>

          <View style={[styles.donutArea, { height: DONUT_AREA_HEIGHT }]}>
            <View style={{ width: size, height: size }}>
              <Svg width={size} height={size}>
                <Circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={COLORS.donutTrack}
                  strokeWidth={strokeWidth}
                  fill="none"
                />

                {donutSegments.map(({ stat, full, dashLength, rotation }) => (
                  <Circle
                    key={stat.categoryId}
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={stat.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={[dashLength, circumference]}
                    strokeLinecap={full ? 'butt' : 'round'}
                    fill="none"
                    rotation={rotation}
                    origin={`${center}, ${center}`}
                  />
                ))}
              </Svg>

              <View style={styles.innerCircle}>
                <Text style={styles.statsAmount} numberOfLines={1} adjustsFontSizeToFit>
                  ₱{overallTotalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={styles.statsLabel}>Total Expenses</Text>
              </View>
            </View>

            {donutSegments
              .filter((seg) => seg.stat.percentage >= 4)
              .map((seg) => (
                <View
                  key={`label-${seg.stat.categoryId}`}
                  style={[styles.donutLabel, { left: seg.labelX - 28, top: seg.labelY - 10 }]}
                >
                  <Ionicons name={(seg.stat.icon || 'pricetag-outline') as any} size={12} color={seg.stat.color} />
                  <Text style={[styles.donutLabelText, { color: seg.stat.color }]}>
                    {seg.stat.percentage.toFixed(0)}%
                  </Text>
                </View>
              ))}
          </View>

          <View style={styles.legendContainer}>
            {categoryStats
              .slice()
              .sort((a, b) => b.total - a.total)
              .map((stat) => (
                <View key={stat.categoryId} style={styles.legendRow}>
                  <View style={styles.legendLeft}>
                    <View style={[styles.legendColorDot, { backgroundColor: stat.color }]} />
                    <View style={styles.legendTextGroup}>
                      <Text style={styles.legendCategoryName} numberOfLines={1}>{stat.categoryName}</Text>
                      <Text style={styles.legendSubText}>{stat.percentage.toFixed(0)}% of total</Text>
                    </View>
                  </View>
                  <Text style={styles.legendAmount}>
                    -₱{stat.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              ))}
            {categoryStats.length === 0 && (
              <Text style={styles.emptyLegendText}>No expenses recorded {selectedPeriod.empty}.</Text>
            )}
          </View>

          {/* Period dropdown (inline, anchored under the pill) */}
          {periodMenuVisible && (
            <View style={styles.periodMenu}>
              {PERIOD_OPTIONS.map((opt, idx) => {
                const active = opt.key === categoryPeriod;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    activeOpacity={0.7}
                    style={[
                      styles.periodMenuItem,
                      idx < PERIOD_OPTIONS.length - 1 && styles.periodMenuItemDivider,
                      active && styles.periodMenuItemActive,
                    ]}
                    onPress={() => {
                      setCategoryPeriod(opt.key);
                      setPeriodMenuVisible(false);
                    }}
                  >
                    <View style={styles.periodMenuText}>
                      <Text style={[styles.periodMenuLabel, active && styles.periodMenuLabelActive]}>{opt.label}</Text>
                      <Text style={styles.periodMenuHint}>{opt.hint}</Text>
                    </View>
                    {active && <Ionicons name="checkmark" size={18} color={COLORS.cyan} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* DAILY SPENDING TREND */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Daily Spending Trend</Text>
          </View>

          <View style={styles.statsCard}>
            <Text style={styles.lineGraphSubtitle}>Expenses incurred per day (Past 7 Days)</Text>

            <View style={styles.graphWrapper}>
              {(() => {
                const chartWidth = SCREEN_WIDTH - 80;
                const chartHeight = 170;
                const paddingLeft = 35;
                const paddingRight = 15;
                const paddingTop = 20;
                const paddingBottom = 35;

                const usableWidth = chartWidth - paddingLeft - paddingRight;
                const usableHeight = chartHeight - paddingTop - paddingBottom;
                const baseY = paddingTop + usableHeight;

                const maxAmount = Math.max(...dailyTrends.map(d => d.amount), 100);

                const points = dailyTrends.map((item, index) => {
                  const x = paddingLeft + (index / (dailyTrends.length - 1 || 1)) * usableWidth;
                  const y = paddingTop + usableHeight - (item.amount / maxAmount) * usableHeight;
                  return { x, y, ...item };
                });

                const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
                const areaPoints = points.length > 0
                  ? `${points[0].x},${baseY} ${polylinePoints} ${points[points.length - 1].x},${baseY}`
                  : '';

                return (
                  <Svg width={chartWidth} height={chartHeight}>
                    <Defs>
                      <LinearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={COLORS.cyan} stopOpacity="0.28" />
                        <Stop offset="1" stopColor={COLORS.cyan} stopOpacity="0" />
                      </LinearGradient>
                    </Defs>

                    {[0, 0.5, 1].map((ratio, idx) => {
                      const yPos = paddingTop + usableHeight * ratio;
                      const valLabel = Math.round(maxAmount * (1 - ratio));
                      return (
                        <G key={idx}>
                          <Line
                            x1={paddingLeft}
                            y1={yPos}
                            x2={chartWidth - paddingRight}
                            y2={yPos}
                            stroke="#E8EEEA"
                            strokeDasharray="4,4"
                            strokeWidth="1"
                          />
                          <SvgText
                            x={paddingLeft - 15}
                            y={yPos + 4}
                            fontSize="9"
                            fill={COLORS.textMuted}
                            textAnchor="end"
                          >
                            {valLabel}
                          </SvgText>
                        </G>
                      );
                    })}

                    {points.length > 0 && <Polygon points={areaPoints} fill="url(#trendGradient)" />}

                    <Polyline
                      points={polylinePoints}
                      fill="none"
                      stroke={COLORS.cyan}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {points.map((p, idx) => (
                      <G key={idx}>
                        <Circle
                          cx={p.x}
                          cy={p.y}
                          r={4.5}
                          fill="#FFFFFF"
                          stroke={COLORS.cyan}
                          strokeWidth="2.5"
                        />
                        <SvgText
                          x={p.x}
                          y={chartHeight - 6}
                          fontSize="9"
                          fill={COLORS.textMuted}
                          textAnchor="middle"
                        >
                          {p.displayDay}
                        </SvgText>
                      </G>
                    ))}
                  </Svg>
                );
              })()}
            </View>
          </View>
        </View>
      </Animated.ScrollView>

      {/* PENDING DUES MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View>
                  <Text style={styles.modalTitle}>Scheduled Dues</Text>
                  <Text style={styles.modalSubtitle}>{formatReadableDate(selectedDate)}</Text>
                </View>
                {filteredDues.length > 0 && filteredDues.some(d => d.status === 'pending') && (
                  <View style={[
                    styles.dueBadgeHome,
                    { backgroundColor: selectedDaysInfo.urgent ? '#FEF2F2' : 'rgba(76, 167, 113, 0.12)' }
                  ]}>
                    <Text style={[
                      styles.dueBadgeTextHome,
                      { color: selectedDaysInfo.urgent ? '#DC2626' : COLORS.deepTeal }
                    ]}>
                      {selectedDaysInfo.text}
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  setSelectedDate(todayStr);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {errorMessage && (
              <View style={styles.inlineErrorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
                <Text style={styles.inlineErrorText}>{errorMessage}</Text>
              </View>
            )}

            {successMessage && (
              <View style={styles.inlineSuccessContainer}>
                <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.olive} />
                <Text style={styles.inlineSuccessText}>{successMessage}</Text>
              </View>
            )}

            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              {filteredDues.length > 0 ? (
                filteredDues.map((due, index) => {
                  const cardBgColor = PALETTE_LIGHT_CARDS[index % PALETTE_LIGHT_CARDS.length];
                  const categoryIcon = due.categories?.icon || 'pricetag-outline';
                  const isPaid = due.status === 'paid';

                  return (
                    <View
                      key={due.id}
                      style={[styles.reminderCardHome, { backgroundColor: cardBgColor, opacity: isPaid ? 0.75 : 1 }]}
                    >
                      <View style={styles.calendarBadgeHome}>
                        <Ionicons name={categoryIcon as any} size={22} color={COLORS.primary} />
                      </View>

                      <View style={styles.cardContentHome}>
                        <Text style={[styles.reminderTitleHome, isPaid && { textDecorationLine: 'line-through', color: COLORS.textMuted }]}>
                          {due.title}
                        </Text>
                        <Text style={styles.reminderSubHome}>
                          ₱{Number(due.amount).toFixed(2)}
                        </Text>
                      </View>

                      <View style={styles.reminderActions}>
                        {isPaid ? (
                          <View style={styles.paidBadge}>
                            <Text style={styles.paidBadgeText}>Paid</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.settleButton}
                            onPress={() => handleSettleReminder(due)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="checkmark-outline" size={18} color={COLORS.primary} />
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={styles.deleteButtonHome}
                          onPress={() => handleDeleteReminder(due.id, due.title)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={18} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyStateContainer}>
                  <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.cyan} />
                  <Text style={styles.emptyStateTitle}>All Clear!</Text>
                  <Text style={styles.emptyStateText}>No reminders set for this date.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={deleteModalVisible}
        onRequestClose={() => {
          if (!isDeleting) setDeleteModalVisible(false);
        }}
      >
        <View style={[styles.modalOverlay, styles.modalOverlayCentered]}>
          <View style={styles.deleteCard}>
            <View style={styles.deleteIconWrap}>
              <Ionicons name="alert-circle-outline" size={24} color="#DC2626" />
            </View>

            <Text style={styles.deleteTitle}>Delete Reminder</Text>

            <Text style={styles.deleteMessage}>
              Are you sure you want to delete "{reminderToDelete?.title}"?{'\n'}This action cannot be undone.
            </Text>

            <View style={styles.deleteActions}>
              <TouchableOpacity
                style={styles.deleteCancelBtn}
                onPress={() => setDeleteModalVisible(false)}
                disabled={isDeleting}
              >
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteConfirmBtn}
                onPress={confirmDeleteReminder}
                disabled={isDeleting}
              >
                <Text style={styles.deleteConfirmText}>
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ADD REMINDER MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={addModalVisible}
        onRequestClose={() => {
          resetForm();
          setAddModalVisible(false);
          setErrorMessage(null);
          setSuccessMessage(null);
        }}
        onShow={() => fetchCategories()}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add New Reminder</Text>
                <Text style={styles.modalSubtitle}>Fill in reminder details</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  resetForm();
                  setAddModalVisible(false);
                }}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {errorMessage && (
              <View style={styles.inlineErrorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
                <Text style={styles.inlineErrorText}>{errorMessage}</Text>
              </View>
            )}

            {successMessage && (
              <View style={styles.inlineSuccessContainer}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#16A34A" />
                <Text style={styles.inlineSuccessText}>{successMessage}</Text>
              </View>
            )}

            <ScrollView contentContainerStyle={styles.formContainer} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Electricity Bill"
                placeholderTextColor={COLORS.textMuted}
                value={newTitle}
                onChangeText={setNewTitle}
              />

              <Text style={styles.inputLabel}>Amount (₱)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="0.00"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="numeric"
                value={newAmount}
                onChangeText={setNewAmount}
              />

              <Text style={styles.inputLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                {categories.map((cat) => {
                  const isSelected = newCategoryId === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => setNewCategoryId(cat.id)}
                      style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
                    >
                      <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextActive]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.inputLabel}>Due Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted}
                value={newDueDate}
                onChangeText={setNewDueDate}
              />

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleCreateReminder}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Save Reminder</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <DueDatesCalendarModal
        visible={isCalendarModalVisible}
        selectedDate={selectedDate}
        dues={upcomingDues}
        onClose={() => setIsCalendarModalVisible(false)}
        onSelectDate={handleCalendarDateSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: {
    backgroundColor: '#FFFFFF',
    paddingTop: HEADER_EXPANDED_H,
    paddingBottom: 48,
    minHeight: SCREEN_HEIGHT + HEADER_SCROLL_RANGE,
  },

  // ---------- Header ----------
  headerBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_EXPANDED_H,
    backgroundColor: '#3F7F77',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
    zIndex: 10,
  },
  headerGradient: { position: 'absolute', bottom: 0, left: 0 },
  headerExpandedRow: {
    position: 'absolute',
    top: H_INSET,
    left: 20,
    right: 20,
    height: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerCompactRow: {
    position: 'absolute',
    top: H_INSET - 8,
    left: 20,
    right: 20,
    height: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactProfile: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 12 },
  compactAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: '#FFFFFF' },
  compactAvatarFallback: { backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  compactAvatarInitial: { color: COLORS.primary, fontSize: 15, fontWeight: '800' },
  compactName: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', flexShrink: 1 },
  userProfileGroup: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1, marginRight: 12 },
  avatarImage: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: '#FFFFFF' },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { color: COLORS.primary, fontSize: 22, fontWeight: '800' },
  greetingGroup: { flexShrink: 1 },
  helloText: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  userNameText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginTop: 1 },

  roleBadgeContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleBadgeText: {
    color: COLORS.deepTeal,
    fontSize: 12,
    fontWeight: '700',
  },

  balanceLabel: {
    position: 'absolute',
    top: H_INSET + 80,
    left: 0,
    right: 0,
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
  pillTrack: {
    position: 'absolute',
    top: H_INSET + 106,
    left: 20,
    right: 20,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.balanceTrack,
    overflow: 'hidden',
  },
  pillTrackThin: {
    position: 'absolute',
    top: H_INSET + 40,
    left: 20,
    right: 20,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.balanceTrack,
    overflow: 'hidden',
  },
  pillFill: { height: '100%', borderRadius: 17, backgroundColor: COLORS.cyan },
  balanceAmountRow: {
    position: 'absolute',
    top: H_INSET + 158,
    left: 0,
    right: 0,
    height: 44,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  pillAmountText: { fontSize: 34, fontWeight: '800', color: '#FFFFFF' },
  pillAmountSlash: { fontSize: 30, fontWeight: '600', color: '#FFFFFF', marginHorizontal: 10 },
  pillAmountTotal: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // ---------- Sections ----------
  sectionBlock: { paddingHorizontal: 20, marginTop: 26 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: COLORS.darkOlive },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  calendarIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.cyanLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cyanLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 15,
    gap: 4,
  },
  reminderText: {
    fontSize: 11,
    color: COLORS.deepTeal,
    fontWeight: '700',
  },

  dropdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cyanLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 15,
    gap: 6,
  },
  dropdownText: {
    fontSize: 11,
    color: COLORS.deepTeal,
    fontWeight: '700',
  },

  // ---------- Upcoming due cards ----------
  dueCardsScroll: { marginHorizontal: -20 },
  dueCardsRow: { paddingHorizontal: 20, gap: 12 },
  dueCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dueCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dueDateTile: {
    width: 46,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dueDateDay: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', lineHeight: 22 },
  dueDateMonth: { fontSize: 10, fontWeight: '700', color: '#FFFFFF', opacity: 0.9 },
  dueCardInfo: { flex: 1 },
  dueTitle: { fontSize: 12, fontWeight: '700', color: COLORS.deepTeal },
  dueAmount: { fontSize: 16, fontWeight: '800', color: COLORS.darkOlive, marginTop: 1 },
  dueCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  dueMeta: { fontSize: 10, fontWeight: '500', color: COLORS.textMuted, flex: 1, marginRight: 4 },
  dueMetaUrgent: { color: '#D9534F', fontWeight: '600' },

  dueEmptyCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 4,
  },
  dueEmptyTitle: { fontSize: 14, fontWeight: '700', color: COLORS.darkOlive, marginTop: 2 },
  dueEmptyText: { fontSize: 12, color: COLORS.textMuted },

  // ---------- Donut + legend ----------
  donutArea: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutLabel: {
    position: 'absolute',
    width: 56,
    height: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  donutLabelText: { fontSize: 11, fontWeight: '700' },
  innerCircle: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 36,
  },
  statsAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.darkOlive,
  },
  statsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  legendContainer: {
    marginTop: 8,
    gap: 16,
    paddingHorizontal: 6,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    marginRight: 12,
  },
  legendColorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  legendTextGroup: { flex: 1 },
  legendCategoryName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.darkOlive,
  },
  legendSubText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginTop: 1,
  },
  legendAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.expenseRed,
  },
  emptyLegendText: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textMuted,
    paddingVertical: 10,
  },

  // ---------- Trend card ----------
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lineGraphSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  graphWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },

  // ---------- Modals ----------
  periodSection: { zIndex: 10 },
  periodBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  periodMenu: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 196,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 4,
    zIndex: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
  periodMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  periodMenuItemDivider: { borderBottomWidth: 1, borderBottomColor: '#F1F4F2' },
  periodMenuItemActive: { backgroundColor: '#F2F8F3' },
  periodMenuText: { flex: 1 },
  periodMenuLabel: { fontSize: 14, fontWeight: '700', color: COLORS.darkOlive },
  periodMenuLabelActive: { color: COLORS.primary },
  periodMenuHint: { fontSize: 11, fontWeight: '500', color: COLORS.textMuted, marginTop: 1 },

  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalOverlayCentered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    maxHeight: SCREEN_HEIGHT * 0.75,
    shadowColor: COLORS.modalShadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D9E2DD',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.darkOlive,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    gap: 10,
    paddingBottom: 20,
  },

  reminderCardHome: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardContentHome: {
    flex: 1,
    marginRight: 8,
  },
  reminderTitleHome: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F2A2C',
  },
  reminderSubHome: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginTop: 2,
  },
  reminderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  calendarBadgeHome: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(76, 167, 113, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  paidBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(76, 167, 113, 0.15)',
    borderRadius: 10,
  },
  paidBadgeText: {
    color: COLORS.olive,
    fontWeight: '700',
    fontSize: 12,
  },
  settleButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(76, 167, 113, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonHome: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Delete confirmation
  deleteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 24,
    width: '85%',
    maxWidth: 340,
    alignItems: 'center',
    alignSelf: 'center',
    shadowColor: COLORS.modalShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  deleteIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 8,
    borderColor: '#FEE2E2',
  },
  deleteTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  deleteMessage: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  deleteActions: { flexDirection: 'row', gap: 12, width: '100%' },
  deleteCancelBtn: { flex: 1, backgroundColor: '#F3F4F6', paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  deleteCancelText: { color: '#374151', fontWeight: '700', fontSize: 15 },
  deleteConfirmBtn: { flex: 1, backgroundColor: '#DC2626', paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  deleteConfirmText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  // Add reminder form
  formContainer: {
    gap: 12,
    paddingBottom: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.darkOlive,
  },
  textInput: {
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: '#E4EAE6',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 14,
    color: COLORS.black,
  },
  categoryScroll: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E4EAE6',
    backgroundColor: COLORS.surfaceSoft,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.darkOlive,
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // Feedback + empty states
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.darkOlive,
    marginTop: 4,
  },
  emptyStateText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  inlineErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  inlineErrorText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  inlineSuccessContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 167, 113, 0.1)',
    borderColor: 'rgba(76, 167, 113, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  inlineSuccessText: {
    color: COLORS.olive,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },

  // Calendar modal
  calendarCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  calendarLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  calendarLegendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.olive,
  },
  calendarLegendText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
});
