// app/(sponsorTabs)/home.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
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

interface ConnectedSpender {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

interface WalletTransaction {
  id: string;
  amount: number;
  type: 'add' | 'deduct';
  description: string | null;
  created_at: string;
}

interface SpenderMember {
  id: string;
  spender_id: string;
  name: string;
  email: string;
  status: string;
  avatarUrl?: string | null;
}

interface SelectedSpender {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

/* ---------- Design Tokens ---------- */
const COLORS = {
  bg: '#F5F7FA',
  card: '#FFFFFF',
  white: '#FFFFFF',
  cardGradientStart: '#75C093', // Lighter soft sage green at top
  cardGradientEnd: '#013237',
  cardGreenTop: '#1E6244',
  cardGreenBottom: '#103826',
  accentGreen: '#C1F038',
  textPrimary: '#111827',
  textMuted: '#8E9BAE',
  textSubtle: '#6B7280',
  danger: '#E53E3E',
  borderLight: '#F0F2F5',
  success: '#2E7D32',
  pendingSoft: '#FEF9C3',
  pendingText: '#A16207',
  pillBg: '#F1F5F9',
};

const CARD_THEMES = [
  { bg: '#F8FAFC', text: '#1E293B' },
  { bg: '#F1F5F9', text: '#334155' },
  { bg: '#F3F4F6', text: '#111827' },
];

const getLocalDateString = (year: number, monthIndex: number, day: number) => {
  const d = new Date(year, monthIndex, day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${date}`;
};

const formatDisplayDate = (dateStr: string) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  });
};

const formatDisplayDateRange = (startStr: string, endStr: string) => {
  if (!startStr) return '';
  if (startStr === endStr) return formatDisplayDate(startStr);

  const [startYear, startMonth, startDay] = startStr.split('-').map(Number);
  const [endYear, endMonth, endDay] = endStr.split('-').map(Number);

  const startDate = new Date(startYear, startMonth - 1, startDay);
  const endDate = new Date(endYear, endMonth - 1, endDay);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return `${startStr} - ${endStr}`;
  }

  if (startYear === endYear && startMonth === endMonth) {
    const monthName = startDate.toLocaleDateString('en-US', { month: 'long' });
    const formattedStartDay = String(startDay).padStart(2, '0');
    const formattedEndDay = String(endDay).padStart(2, '0');
    return `${monthName} ${formattedStartDay} - ${formattedEndDay}, ${startYear}`;
  }

  return `${formatDisplayDate(startStr)} - ${formatDisplayDate(endStr)}`;
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

  const startOfNextMonth = getLocalDateString(year, month + 1, 1);
  const endOfNextMonth = getLocalDateString(year, month + 2, 0);
  return { start: startOfNextMonth, end: endOfNextMonth };
};

export default function HomeScreen() {
  const router = useRouter();
  const [connectedSpenders, setConnectedSpenders] = useState<ConnectedSpender[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sponsorWalletBalance, setSponsorWalletBalance] = useState(0);
  const [sponsorProfile, setSponsorProfile] = useState<{ full_name: string; avatar_url: string | null; role: string | null } | null>(null);

  // Modal States for Adding Spender
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [spenderEmail, setSpenderEmail] = useState('');
  const [submittingSpender, setSubmittingSpender] = useState(false);
  const [addModalMessage, setAddModalMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Modal States for Adding Wallet Balance
  const [isWalletModalVisible, setIsWalletModalVisible] = useState(false);
  const [walletAmountInput, setWalletAmountInput] = useState('');
  const [submittingWallet, setSubmittingWallet] = useState(false);
  const [walletModalMessage, setWalletModalMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Modal States for Deleting Spender Connection
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [spenderToDelete, setSpenderToDelete] = useState<ConnectedSpender | null>(null);
  const [deletingSpender, setDeletingSpender] = useState(false);
  const [deleteModalMessage, setDeleteModalMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Modal States for Sending Allowance
  const [isAllowanceModalVisible, setIsAllowanceModalVisible] = useState(false);
  const [selectedAllowanceSpender, setSelectedAllowanceSpender] = useState<SelectedSpender | null>(null);
  const [allowanceName, setAllowanceName] = useState('');
  const [allowanceAmount, setAllowanceAmount] = useState('');
  const [submittingAllowance, setSubmittingAllowance] = useState(false);
  const [allowanceModalMessage, setAllowanceModalMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Member Picker Sub-Modal State
  const [memberPickerVisible, setMemberPickerVisible] = useState(false);
  const [connectedMembersList, setConnectedMembersList] = useState<SpenderMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Coverage Period States
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'nextWeek' | 'month' | 'nextMonth' | 'custom'>('today');
  const defaultPeriodDates = getPeriodDates('today');
  const [startDate, setStartDate] = useState(defaultPeriodDates.start);
  const [endDate, setEndDate] = useState(defaultPeriodDates.end);

  // Custom Calendar Picker States
  const [customCalendarVisible, setCustomCalendarVisible] = useState(false);
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());
  const [tempStartDate, setTempStartDate] = useState<string | null>(null);
  const [tempEndDate, setTempEndDate] = useState<string | null>(null);

  const fetchDashboardData = async (isRefreshing = false) => {
    try {
      if (!isRefreshing) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, role')
        .eq('id', user.id)
        .single();
      setSponsorProfile(profile);

      // Fetch Sponsor Wallet Balance
      const { data: walletData, error: walletError } = await supabase
        .from('sponsor_wallets')
        .select('balance')
        .eq('sponsor_id', user.id)
        .maybeSingle();

      if (walletError && walletError.code !== 'PGRST116') {
        console.error('Wallet error:', walletError.message);
      }
      setSponsorWalletBalance(walletData ? Number(walletData.balance) : 0);

      // Fetch Wallet Transactions History
      const { data: txData, error: txError } = await supabase
        .from('sponsor_wallet_transactions')
        .select('*')
        .eq('sponsor_id', user.id)
        .order('created_at', { ascending: false });

      if (txError) {
        console.error('Transactions error:', txError.message);
      } else {
        setWalletTransactions(txData || []);
      }

      // Fetch connected spenders from sponsor_spenders table
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

      setConnectedSpenders(Array.from(spendersMap.values()));
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

  const handleCloseAddModal = () => {
    setSpenderEmail('');
    setAddModalMessage(null);
    setIsAddModalVisible(false);
  };

  const handleWalletSubmit = async () => {
    setWalletModalMessage(null);
    const amountNum = parseFloat(walletAmountInput);
    if (isNaN(amountNum) || amountNum <= 0) {
      setWalletModalMessage({ type: 'error', text: 'Please enter a valid amount.' });
      return;
    }

    try {
      setSubmittingWallet(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newBalance = sponsorWalletBalance + amountNum;

      const { error: upsertError } = await supabase
        .from('sponsor_wallets')
        .upsert({
          sponsor_id: user.id,
          balance: newBalance,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'sponsor_id' });

      if (upsertError) throw upsertError;

      const { error: txError } = await supabase
        .from('sponsor_wallet_transactions')
        .insert({
          sponsor_id: user.id,
          amount: amountNum,
          type: 'add',
          description: 'Added money to wallet',
        });

      if (txError) throw txError;

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `increased the wallet balance by ₱${amountNum.toLocaleString()}.`,
      });

      setWalletModalMessage({ type: 'success', text: 'Successfully added to wallet balance!' });
      setTimeout(() => {
        setWalletAmountInput('');
        setWalletModalMessage(null);
        setIsWalletModalVisible(false);
        fetchDashboardData(true);
      }, 1200);

    } catch (e: any) {
      setWalletModalMessage({ type: 'error', text: e.message || 'Failed to update wallet.' });
    } finally {
      setSubmittingWallet(false);
    }
  };

  const handleAddSpenderSubmit = async () => {
    setAddModalMessage(null);

    if (!spenderEmail.trim()) {
      setAddModalMessage({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }

    try {
      setSubmittingSpender(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: targetProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('email', spenderEmail.trim().toLowerCase())
        .single();

      if (profileError || !targetProfile) {
        setAddModalMessage({ type: 'error', text: 'No user account found with this email address.' });
        return;
      }

      if (targetProfile.id === user.id) {
        setAddModalMessage({ type: 'error', text: 'You cannot connect your own account as a spender.' });
        return;
      }

      if (targetProfile.role !== 'Spender') {
        setAddModalMessage({ type: 'error', text: 'This account is not registered as a spender.' });
        return;
      }

      const { data: existingConnection, error: checkError } = await supabase
        .from('sponsor_spenders')
        .select('sponsor_id, status')
        .eq('spender_id', targetProfile.id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingConnection) {
        if (existingConnection.sponsor_id === user.id) {
          setAddModalMessage({ type: 'error', text: 'This spender is already connected to your account.' });
        } else {
          setAddModalMessage({ type: 'error', text: 'This spender is already connected to another sponsor.' });
        }
        return;
      }

      const { error: insertError } = await supabase
        .from('sponsor_spenders')
        .insert({
          sponsor_id: user.id,
          spender_id: targetProfile.id,
          status: 'accepted',
        });

      if (insertError) throw insertError;

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `connected spender "${targetProfile.full_name || spenderEmail}".`,
      });

      setAddModalMessage({ type: 'success', text: 'Spender connected successfully!' });
      setTimeout(() => {
        setSpenderEmail('');
        setAddModalMessage(null);
        setIsAddModalVisible(false);
        fetchDashboardData(true);
      }, 1200);

    } catch (e: any) {
      setAddModalMessage({ type: 'error', text: e.message || 'Failed to connect spender.' });
    } finally {
      setSubmittingSpender(false);
    }
  };

  const handleDeleteSpenderConfirm = async () => {
    if (!spenderToDelete) return;
    setDeleteModalMessage(null);

    try {
      setDeletingSpender(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('sponsor_spenders')
        .delete()
        .eq('sponsor_id', user.id)
        .eq('spender_id', spenderToDelete.id);

      if (error) throw error;

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `disconnected spender "${spenderToDelete.full_name}".`,
      });

      setDeleteModalMessage({ type: 'success', text: `${spenderToDelete.full_name} has been disconnected.` });
      setTimeout(() => {
        setIsDeleteModalVisible(false);
        setSpenderToDelete(null);
        setDeleteModalMessage(null);
        fetchDashboardData(true);
      }, 1200);

    } catch (e: any) {
      setDeleteModalMessage({ type: 'error', text: e.message || 'Failed to remove spender.' });
    } finally {
      setDeletingSpender(false);
    }
  };

  const fetchConnectedMembersForAllowance = async () => {
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

      setConnectedMembersList(formattedMembers);
    } catch (error: any) {
      setAllowanceModalMessage({ type: 'error', text: error.message || 'Failed to fetch members.' });
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleOpenAllowanceModal = () => {
    setSelectedAllowanceSpender(null);
    setAllowanceName('');
    setAllowanceAmount('');
    setSelectedPeriod('today');
    const defaultDates = getPeriodDates('today');
    setStartDate(defaultDates.start);
    setEndDate(defaultDates.end);
    setAllowanceModalMessage(null);
    setIsAllowanceModalVisible(true);
  };

  const handleSaveAllowanceSubmit = async () => {
    setAllowanceModalMessage(null);

    if (!selectedAllowanceSpender) {
      setAllowanceModalMessage({ type: 'error', text: 'Please select a member to allocate allowance.' });
      return;
    }

    const parsedAmount = parseFloat(allowanceAmount);
    if (!allowanceName.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      setAllowanceModalMessage({ type: 'error', text: 'Please provide a valid name and a positive amount.' });
      return;
    }

    if (!startDate.trim() || !endDate.trim()) {
      setAllowanceModalMessage({ type: 'error', text: 'Please specify both coverage start and end dates.' });
      return;
    }

    try {
      setSubmittingAllowance(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: walletData, error: walletError } = await supabase
        .from('sponsor_wallets')
        .select('balance')
        .eq('sponsor_id', user.id)
        .maybeSingle();

      if (walletError && walletError.code !== 'PGRST116') {
        throw walletError;
      }

      const currentBalance = walletData ? Number(walletData.balance) : 0;

      if (parsedAmount > currentBalance) {
        setAllowanceModalMessage({
          type: 'error',
          text: `Exceeds wallet balance (₱${currentBalance.toLocaleString()}).`
        });
        setSubmittingAllowance(false);
        return;
      }

      const newBalance = currentBalance - parsedAmount;

      const { error: updateWalletError } = await supabase
        .from('sponsor_wallets')
        .update({
          balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('sponsor_id', user.id);

      if (updateWalletError) throw updateWalletError;

      const { error: txError } = await supabase
        .from('sponsor_wallet_transactions')
        .insert({
          sponsor_id: user.id,
          amount: parsedAmount,
          type: 'deduct',
          description: `Deducted for allowance`,
        });

      if (txError) throw txError;

      const payload = {
        sponsor_id: user.id,
        spender_id: selectedAllowanceSpender.id,
        allowance_name: allowanceName.trim(),
        amount: parsedAmount,
        start_date: startDate,
        end_date: endDate
      };

      const { error: allowanceError } = await supabase
        .from('allowances')
        .insert([payload]);

      if (allowanceError) throw allowanceError;

      await supabase.from('logs').insert({
        user_id: user.id,
        details: `allocated allowance "${allowanceName.trim()}" (${parsedAmount}) for spender "${selectedAllowanceSpender.name}".`,
      });

      setAllowanceModalMessage({ type: 'success', text: 'Allowance allocated successfully!' });
      setTimeout(() => {
        setIsAllowanceModalVisible(false);
        fetchDashboardData(true);
      }, 1200);

    } catch (e: any) {
      setAllowanceModalMessage({ type: 'error', text: e.message || 'Something went wrong.' });
    } finally {
      setSubmittingAllowance(false);
    }
  };

  const initials = (sponsorProfile?.full_name || 'S')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const getFirstName = (fullName: string) => {
    return fullName.trim().split(' ')[0] || fullName;
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* HEADER SECTION */}
      <View style={styles.topBar}>
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

          <View style={styles.headerTextGroup}>
            <Text style={styles.welcomeText}>Hello,</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {sponsorProfile?.full_name || 'User'}
            </Text>
          </View>
        </View>

        {/* SPONSOR BADGE */}
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>
            {sponsorProfile?.role || 'Sponsor'}
          </Text>
        </View>
      </View>

      {/* BODY CONTENT */}
      <View style={styles.bodyContent}>
        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={COLORS.textPrimary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listScrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.textPrimary]} tintColor={COLORS.textPrimary} />
            }
          >
            {/* SPONSOR WALLET CARD */}
            <View style={styles.cardWrapper}>
              <LinearGradient
                colors={[COLORS.cardGradientStart, COLORS.cardGradientEnd]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.cardContainer}
              >
                <View style={styles.cardContent}>
                  <View>
                    <Text style={styles.heroLabel}>Your Wallet Balance</Text>
                    <Text style={styles.heroRemainingAmount}>
                      ₱{sponsorWalletBalance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            {/* QUICK ACTIONS SECTION */}
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                style={styles.quickActionTile}
                activeOpacity={0.8}
                onPress={() => setIsWalletModalVisible(true)}
              >
                <View style={styles.quickActionIconCircle}>
                  <Ionicons name="add-outline" size={20} color={COLORS.textPrimary} />
                </View>
                <Text style={styles.quickActionLabel}>Add Money</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickActionTile}
                activeOpacity={0.8}
                onPress={() => setIsAddModalVisible(true)}
              >
                <View style={styles.quickActionIconCircle}>
                  <Ionicons name="person-add-outline" size={18} color={COLORS.textPrimary} />
                </View>
                <Text style={styles.quickActionLabel}>Link Spender</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.quickActionTile]}
                activeOpacity={0.8}
                onPress={handleOpenAllowanceModal}
              >
                <View style={styles.quickActionIconCircle}>
                  <Ionicons name="arrow-up-outline" size={18} color={COLORS.textPrimary} />
                </View>
                <Text style={styles.quickActionLabel}>Send Allowance</Text>
              </TouchableOpacity>

              
            </View>

            {/* CONNECTED SPENDERS SECTION */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Spenders</Text>
              <Text style={styles.seeAllText}>{connectedSpenders.length} members</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalSpendersContainer}
            >
              {connectedSpenders.map((spender) => {
                const firstName = getFirstName(spender.full_name);
                const spenderInitials = spender.full_name
                  .split(' ')
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();

                return (
                  <TouchableOpacity
                    key={spender.id}
                    style={styles.spenderHorizontalItem}
                    activeOpacity={0.7}
                    onLongPress={() => {
                      setSpenderToDelete(spender);
                      setIsDeleteModalVisible(true);
                    }}
                  >
                    <View style={styles.avatarWrapper}>
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
                  </TouchableOpacity>
                );
              })}

              
            </ScrollView>

            {/* WALLET TRANSACTIONS SECTION */}
            <View style={[styles.sectionHeader, { marginTop: 22 }]}>
              <Text style={styles.sectionTitle}>Wallet Transactions</Text>
              <TouchableOpacity activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.seeAllText}>Today</Text>
                <Ionicons name="chevron-down" size={14} color={COLORS.textMuted} style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            </View>

            <View style={styles.transactionsListContainer}>
              {walletTransactions.length === 0 ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
                    No transaction records yet.
                  </Text>
                </View>
              ) : (
                walletTransactions.map((item) => {
                  const isAdd = item.type === 'add';
                  const formattedDate = new Date(item.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  });

                  return (
                    <View key={item.id} style={styles.txCardItem}>
                      <View style={styles.txLeftGroup}>
                        <View style={styles.txIconBox}>
                          <Ionicons
                            name={isAdd ? 'wallet-outline' : 'remove-circle-outline'}
                            size={18}
                            color={COLORS.textPrimary}
                          />
                        </View>
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text style={styles.txDescText} numberOfLines={1}>
                            {item.description || (isAdd ? 'Added Balance' : 'Deducted')}
                          </Text>
                          <Text style={styles.txDateText}>{formattedDate}</Text>
                        </View>
                      </View>
                      <Text style={[styles.txAmountText, { color: isAdd ? COLORS.success : COLORS.danger }]}>
                        {isAdd ? '+' : '-'}₱{Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* ADD WALLET BALANCE MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isWalletModalVisible}
        onRequestClose={() => setIsWalletModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Wallet Balance</Text>
              <TouchableOpacity onPress={() => setIsWalletModalVisible(false)}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Enter the amount you wish to add to your wallet balance.
            </Text>

            {walletModalMessage && (
              <View style={[
                styles.inlineBanner, 
                walletModalMessage.type === 'success' ? styles.bannerSuccess : styles.bannerError
              ]}>
                <Ionicons 
                  name={walletModalMessage.type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} 
                  size={16} 
                  color={walletModalMessage.type === 'success' ? COLORS.success : COLORS.danger} 
                />
                <Text style={[
                  styles.bannerText, 
                  { color: walletModalMessage.type === 'success' ? COLORS.success : COLORS.danger }
                ]}>
                  {walletModalMessage.text}
                </Text>
              </View>
            )}

            <TextInput
              style={styles.modalInput}
              placeholder="0.00"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              value={walletAmountInput}
              onChangeText={setWalletAmountInput}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsWalletModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleWalletSubmit}
                disabled={submittingWallet}
              >
                {submittingWallet ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.modalSubmitText}>Add Balance</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ADD SPENDER MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isAddModalVisible}
        onRequestClose={handleCloseAddModal}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Connect New Spender</Text>
              <TouchableOpacity onPress={handleCloseAddModal}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Enter your spender's registered account email address to connect them.
            </Text>

            {addModalMessage && (
              <View style={[
                styles.inlineBanner, 
                addModalMessage.type === 'success' ? styles.bannerSuccess : styles.bannerError
              ]}>
                <Ionicons 
                  name={addModalMessage.type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} 
                  size={16} 
                  color={addModalMessage.type === 'success' ? COLORS.success : COLORS.danger} 
                />
                <Text style={[
                  styles.bannerText, 
                  { color: addModalMessage.type === 'success' ? COLORS.success : COLORS.danger }
                ]}>
                  {addModalMessage.text}
                </Text>
              </View>
            )}

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
                onPress={handleCloseAddModal}
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
        </KeyboardAvoidingView>
      </Modal>

      {/* DELETE SPENDER CONFIRMATION MODAL */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isDeleteModalVisible}
        onRequestClose={() => setIsDeleteModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Disconnect Spender</Text>
              <TouchableOpacity onPress={() => setIsDeleteModalVisible(false)}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Are you sure you want to remove <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{spenderToDelete?.full_name}</Text>? This will disconnect them from your account.
            </Text>

            {deleteModalMessage && (
              <View style={[
                styles.inlineBanner, 
                deleteModalMessage.type === 'success' ? styles.bannerSuccess : styles.bannerError
              ]}>
                <Ionicons 
                  name={deleteModalMessage.type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} 
                  size={16} 
                  color={deleteModalMessage.type === 'success' ? COLORS.success : COLORS.danger} 
                />
                <Text style={[
                  styles.bannerText, 
                  { color: deleteModalMessage.type === 'success' ? COLORS.success : COLORS.danger }
                ]}>
                  {deleteModalMessage.text}
                </Text>
              </View>
            )}

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsDeleteModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: COLORS.danger }]}
                onPress={handleDeleteSpenderConfirm}
                disabled={deletingSpender}
              >
                {deletingSpender ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.modalSubmitText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* SEND ALLOWANCE MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isAllowanceModalVisible}
        onRequestClose={() => setIsAllowanceModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Allowance</Text>
              <TouchableOpacity onPress={() => setIsAllowanceModalVisible(false)}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={styles.modalSubtitle}>
                Select a member and specify the allowance parameters.
              </Text>

              {allowanceModalMessage && (
                <View style={[
                  styles.inlineBanner, 
                  allowanceModalMessage.type === 'success' ? styles.bannerSuccess : styles.bannerError
                ]}>
                  <Ionicons 
                    name={allowanceModalMessage.type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} 
                    size={16} 
                    color={allowanceModalMessage.type === 'success' ? COLORS.success : COLORS.danger} 
                  />
                  <Text style={[
                    styles.bannerText, 
                    { color: allowanceModalMessage.type === 'success' ? COLORS.success : COLORS.danger }
                  ]}>
                    {allowanceModalMessage.text}
                  </Text>
                </View>
              )}

              <Text style={styles.allowanceSectionLabel}>Target Member</Text>
              {selectedAllowanceSpender ? (
                <View style={styles.selectedSpenderCard}>
                  <View style={styles.avatarContainer}>
                    {selectedAllowanceSpender.avatarUrl ? (
                      <Image source={{ uri: selectedAllowanceSpender.avatarUrl }} style={styles.avatarImage} />
                    ) : (
                      <Ionicons name="person" size={16} color={COLORS.textPrimary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.spenderName}>{selectedAllowanceSpender.name}</Text>
                    <Text style={styles.spenderEmail}>{selectedAllowanceSpender.email || 'Beneficiary'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedAllowanceSpender(null)} style={styles.removeButton}>
                    <Ionicons name="close" size={16} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.selectMemberButton} 
                  activeOpacity={0.7} 
                  onPress={() => {
                    fetchConnectedMembersForAllowance();
                    setMemberPickerVisible(true);
                  }}
                >
                  <View style={styles.addCircleOutline}>
                    <Ionicons name="add" size={18} color={COLORS.textPrimary} />
                  </View>
                  <Text style={styles.selectMemberText}>Select a Member to Allocate</Text>
                </TouchableOpacity>
              )}

              <Text style={[styles.allowanceSectionLabel, { marginTop: 16 }]}>Allowance Details</Text>

              <View style={styles.allowanceInputGroup}>
                <Text style={styles.allowanceLabel}>Allowance Name</Text>
                <TextInput 
                  style={styles.modalInput} 
                  value={allowanceName} 
                  onChangeText={setAllowanceName} 
                  placeholder="e.g. Weekly Allowance" 
                  placeholderTextColor={COLORS.textMuted} 
                />
              </View>

              <View style={styles.allowanceInputGroup}>
                <Text style={styles.allowanceLabel}>Amount (PHP)</Text>
                <View style={styles.amountWrapper}>
                  <Text style={styles.currencyPrefix}>₱</Text>
                  <TextInput 
                    style={[styles.modalInput, styles.amountInput]} 
                    keyboardType="decimal-pad"
                    value={allowanceAmount} 
                    onChangeText={setAllowanceAmount} 
                    placeholder="0.00" 
                    placeholderTextColor={COLORS.textMuted} 
                  />
                </View>
              </View>

              <View style={styles.allowanceInputGroup}>
                <Text style={styles.allowanceLabel}>Coverage Period</Text>
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

                  <TouchableOpacity
                    style={[styles.periodPill, selectedPeriod === 'custom' && styles.periodPillActive]}
                    activeOpacity={0.8}
                    onPress={() => {
                      setTempStartDate(null);
                      setTempEndDate(null);
                      setCurrentCalendarDate(new Date());
                      setCustomCalendarVisible(true);
                    }}
                  >
                    <Text style={[styles.periodPillText, selectedPeriod === 'custom' && styles.periodPillTextActive]}>
                      Custom
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.dateRangeIndicator}>
                  <Ionicons name="calendar-outline" size={14} color={COLORS.textMuted} />
                  <Text style={styles.dateRangeIndicatorText}>
                    {formatDisplayDateRange(startDate, endDate)}
                  </Text>
                </View>
              </View>

              <View style={[styles.modalButtonsRow, { marginTop: 24 }]}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setIsAllowanceModalVisible(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalSubmitBtn}
                  onPress={handleSaveAllowanceSubmit}
                  disabled={submittingAllowance}
                >
                  {submittingAllowance ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.modalSubmitText}>Confirm Allocation</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MEMBER SELECTION SUB-MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={memberPickerVisible}
        onRequestClose={() => setMemberPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '75%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Member</Text>
              <TouchableOpacity onPress={() => setMemberPickerVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {loadingMembers ? (
              <ActivityIndicator size="large" color={COLORS.textPrimary} style={{ marginVertical: 40 }} />
            ) : (
              <FlatList
                data={connectedMembersList}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyTitle}>No connected members</Text>
                    <Text style={styles.emptySubtitle}>Connect a spender first using the Connect action.</Text>
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
                          setAllowanceModalMessage({ type: 'error', text: "Spender hasn't accepted your link request yet." });
                          setMemberPickerVisible(false);
                          return;
                        }
                        setSelectedAllowanceSpender({
                          id: item.spender_id,
                          name: item.name,
                          email: item.email,
                          avatarUrl: item.avatarUrl
                        });
                        setMemberPickerVisible(false);
                      }}
                    >
                      <View style={styles.gridAvatarCircle}>
                        {item.avatarUrl ? (
                          <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
                        ) : (
                          <Text style={[styles.avatarText, { color: theme.text }]}>
                            {item.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
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

      {/* CUSTOM RANGE CALENDAR PICKER MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={customCalendarVisible}
        onRequestClose={() => setCustomCalendarVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Date Range</Text>
              <TouchableOpacity onPress={() => setCustomCalendarVisible(false)}>
                <Ionicons name="close" size={20} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.calendarNavRow}>
              <Text style={styles.calendarMonthTitle}>
                {currentCalendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </Text>
              <View style={styles.calendarArrowsContainer}>
                <TouchableOpacity 
                  style={styles.calendarArrowBtn}
                  onPress={() => {
                    const prev = new Date(currentCalendarDate);
                    prev.setMonth(prev.getMonth() - 1);
                    setCurrentCalendarDate(prev);
                  }}
                >
                  <Ionicons name="chevron-back" size={18} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.calendarArrowBtn}
                  onPress={() => {
                    const next = new Date(currentCalendarDate);
                    next.setMonth(next.getMonth() + 1);
                    setCurrentCalendarDate(next);
                  }}
                >
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.weekDaysRow}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                <Text key={i} style={styles.weekDayText}>{d}</Text>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.daysGrid}>
                {(() => {
                  const year = currentCalendarDate.getFullYear();
                  const month = currentCalendarDate.getMonth();
                  const firstDayIndex = new Date(year, month, 1).getDay();
                  const totalDays = new Date(year, month + 1, 0).getDate();
                  const todayStr = getLocalDateString(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

                  const cells = [];
                  for (let i = 0; i < firstDayIndex; i++) {
                    cells.push(<View key={`empty-${i}`} style={styles.dayCellEmpty} />);
                  }

                  for (let day = 1; day <= totalDays; day++) {
                    const dateStr = getLocalDateString(year, month, day);
                    const isPast = dateStr < todayStr;

                    const isStart = tempStartDate === dateStr;
                    const isEnd = tempEndDate === dateStr;
                    const isInRange = tempStartDate && tempEndDate && dateStr > tempStartDate && dateStr < tempEndDate;

                    cells.push(
                      <TouchableOpacity
                        key={dateStr}
                        disabled={isPast}
                        style={[
                          styles.dayCell,
                          isPast && styles.dayCellDisabled,
                          (isStart || isEnd) && styles.dayCellSelected,
                          isInRange && styles.dayCellInRange,
                        ]}
                        onPress={() => {
                          if (!tempStartDate || (tempStartDate && tempEndDate)) {
                            setTempStartDate(dateStr);
                            setTempEndDate(null);
                          } else if (tempStartDate && !tempEndDate) {
                            if (dateStr < tempStartDate) {
                              setTempStartDate(dateStr);
                            } else {
                              setTempEndDate(dateStr);
                            }
                          }
                        }}
                      >
                        <Text style={[
                          styles.dayCellText,
                          isPast && styles.dayCellTextDisabled,
                          (isStart || isEnd) && styles.dayCellTextSelected,
                        ]}>
                          {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                  return cells;
                })()}
              </View>
            </ScrollView>

            <View style={[styles.modalButtonsRow, { marginTop: 16 }]}>
              <TouchableOpacity 
                style={[styles.modalCancelBtn, !tempStartDate && { opacity: 0.5 }]} 
                disabled={!tempStartDate}
                onPress={() => {
                  if (tempStartDate) {
                    setTempStartDate(null);
                    setTempEndDate(null);
                  }
                }}
              >
                <Text style={styles.modalCancelText}>Reset</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalSubmitBtn, (!tempStartDate || !tempEndDate) && { opacity: 0.5 }]} 
                disabled={!tempStartDate || !tempEndDate}
                onPress={() => {
                  if (tempStartDate && tempEndDate) {
                    setStartDate(tempStartDate);
                    setEndDate(tempEndDate);
                    setSelectedPeriod('custom');
                    setCustomCalendarVisible(false);
                  }
                }}
              >
                <Text style={styles.modalSubmitText}>Apply Range</Text>
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
    backgroundColor: COLORS.bg,
  },
  topBar: {
    paddingTop: (Platform.OS === 'android' ? NativeStatusBar.currentHeight || 24 : 44) + 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: { 
    fontSize: 18, 
    fontWeight: '800', 
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  welcomeText: { 
    fontSize: 12, 
    color: COLORS.textSubtle, 
    fontWeight: '400',
    marginTop: 1,
  },
  avatar: { 
    width: 42, 
    height: 42, 
    borderRadius: 21, 
  },
  avatarPlaceholder: {
    width: 42, 
    height: 42, 
    borderRadius: 21,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center', 
    alignItems: 'center',
  },
  avatarInitials: { 
    color: COLORS.textPrimary, 
    fontWeight: '700', 
    fontSize: 13,
  },

  /* WALLET CARD */
  cardWrapper: {
    marginBottom: 20,
  },
  cardContainer: {
    borderRadius: 24,
    padding: 22,
    height: 180,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#3d5c4d',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'space-between',
    zIndex: 2,
  },
  heroRemainingAmount: {
    color: COLORS.white,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 4,
  },

  /* BODY */
  bodyContent: {
    flex: 1,
  },
  listScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  /* QUICK ACTIONS */
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    marginTop: 12,
  },
  quickActionTile: {
    width: '31%',
    backgroundColor: COLORS.white,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EAECEF',
  },
  quickActionTileActive: {
    backgroundColor: COLORS.accentGreen,
    borderColor: COLORS.accentGreen,
  },
  quickActionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickActionIconCircleActive: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSubtle,
  },
  quickActionLabelActive: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  /* SECTION HEADERS */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
  },
  seeAllText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },

  /* SPENDERS HORIZONTAL LIST */
  horizontalSpendersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 4,
  },
  spenderHorizontalItem: {
    alignItems: 'center',
    width: 54,
  },
  avatarWrapper: {
    position: 'relative',
  },
  spenderGridAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  spenderGridAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spenderGridInitials: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  activeDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: COLORS.bg,
  },
  spenderGridFirstName: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.textSubtle,
    marginTop: 4,
    textAlign: 'center',
  },
  moreSpendersBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAECEF',
  },

  /* TRANSACTIONS */
  transactionsListContainer: {
    gap: 10,
  },
  txCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EAECEF',
  },
  txLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  txIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#F5F7FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  txDescText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  txDateText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  txAmountText: {
    fontSize: 14,
    fontWeight: '700',
  },

  /* MODAL STYLES */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
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
    color: COLORS.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 16,
    lineHeight: 16,
  },
  inlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  bannerError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  bannerSuccess: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  bannerText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.bg,
    marginBottom: 16,
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
    backgroundColor: COLORS.textPrimary,
  },
  modalSubmitText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.white,
  },
  allowanceSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  selectMemberButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 8,
  },
  addCircleOutline: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: COLORS.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectMemberText: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 12,
  },
  selectedSpenderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 10,
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  spenderName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  spenderEmail: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  removeButton: {
    padding: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
  },
  allowanceInputGroup: {
    marginBottom: 4,
  },
  allowanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  amountWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  currencyPrefix: {
    position: 'absolute',
    left: 14,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    zIndex: 1,
    top: 12,
  },
  amountInput: {
    paddingLeft: 30,
  },
  periodSelectorContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  periodPill: {
    flexBasis: '31%',
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: 4,
  },
  periodPillActive: {
    backgroundColor: COLORS.textPrimary,
    borderColor: COLORS.textPrimary,
  },
  periodPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  periodPillTextActive: {
    color: COLORS.white,
  },
  dateRangeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  dateRangeIndicatorText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  modalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  gridAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontWeight: '700',
    fontSize: 12,
  },
  gridMemberName: {
    fontSize: 14,
    fontWeight: '700',
  },
  gridMemberEmail: {
    fontSize: 11,
    color: COLORS.textMuted,
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
    paddingVertical: 30,
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
  },
  calendarNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calendarMonthTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  calendarArrowsContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 2,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  calendarArrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  weekDayText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    width: '14%',
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCellEmpty: {
    width: '14.28%',
    height: 36,
  },
  dayCell: {
    width: '14.28%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  dayCellDisabled: {
    opacity: 0.3,
  },
  dayCellSelected: {
    backgroundColor: COLORS.textPrimary,
    borderRadius: 18,
  },
  dayCellInRange: {
    backgroundColor: '#E2E8F0',
  },
  dayCellText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  dayCellTextDisabled: {
    color: COLORS.textMuted,
  },
  dayCellTextSelected: {
    color: COLORS.white,
  },
  modalDivider: {
    height: 1,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    width: '100%',
    marginBottom: 10,
  },
  headerTextGroup: {
    marginLeft: 12,
    justifyContent: 'center',
  },
  roleBadge: {
    backgroundColor: '#C8E6C9',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#103826',
  },
});