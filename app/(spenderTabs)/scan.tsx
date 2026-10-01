// app/scan.tsx
import { Ionicons } from '@expo/vector-icons';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { decode } from 'base64-arraybuffer';
import { CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';

const { width, height } = Dimensions.get('window');

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

export default function ScanReceiptScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { allowanceId: paramAllowanceId } = useLocalSearchParams<{ allowanceId?: string }>();

  const isFocused = pathname === '/scan' || pathname.includes('scan');

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [frozenPhoto, setFrozenPhoto] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const cameraRef = useRef<any>(null);

  // Laser animation value for scanning effect
  const scanAnim = useSharedValue(0);

  useEffect(() => {
    if (scanning) {
      scanAnim.value = withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      scanAnim.value = 0;
    }
  }, [scanning]);

  const laserStyle = useAnimatedStyle(() => {
    const targetHeight = width * 1.15;
    return {
      transform: [
        {
          translateY: scanAnim.value * targetHeight,
        },
      ],
    };
  });

  if (!permission) {
    return (
      <View style={[styles.fallbackContainer, styles.centerAlign]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="small" color="#0E2417" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.fallbackContainer, styles.centerAlign, { paddingHorizontal: 32 }]}>
        <StatusBar style="dark" />
        <View style={styles.permissionIconCircle}>
          <Ionicons name="camera-outline" size={32} color="#475569" />
        </View>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionDescription}>
          To automatically scan and process transaction receipts with Payton, please grant camera permissions in your system choices.
        </Text>
        <TouchableOpacity style={styles.grantPermissionBtn} onPress={requestPermission}>
          <Text style={styles.grantPermissionBtnText}>Allow Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const toggleFlash = () => {
    setTorchOn((prev) => !prev);
    setFlash((current) => (current === 'off' ? 'on' : 'off'));
  };

  const handleTakePicture = async () => {
    if (cameraRef.current && !scanning) {
      try {
        setScanning(true);
        
        const options = { quality: 0.7, base64: true, skipProcessing: false };
        const photo = await cameraRef.current.takePictureAsync(options);

        if (!photo.base64) {
          throw new Error("Unable to read valid image binary base64 data stream.");
        }

        // Freeze frame with captured URI for smooth UX transition
        setFrozenPhoto(photo.uri);

        const model = genAI.getGenerativeModel({ 
          model: "gemini-3.5-flash-lite",
          generationConfig: {
            responseMimeType: "application/json",
          }
        });

        const prompt = `
          Analyze this receipt image. Extract structural merchant properties, total amount, and classify the expense.

          ALLOWED CATEGORIES (Pick EXACTLY ONE from this list):
          - "Food" (7-Eleven, Fast food, Restaurants, Cafes, Bakeries, Convenience stores)
          - "Transportation" (Gas stations, Fare, Taxi, Grab, Parking)
          - "Utilities" (Water, Electricity, Internet, Phone bills)
          - "Shopping" (Clothing, Electronics, Malls, Retail)
          - "Entertainment" (Movies, Games, Recreation, Hobbies)
          - "Healthcare" (Pharmacy, Medicines, Clinic, Hospital)
          - "Education" (Tuition, Books, School supplies)

          Return a strict raw JSON matching this format:
          {
            "name": "string (Name of the merchant / store, max 25 characters)",
            "amount": number (Total amount/balance due as a numeric float value without currency symbol),
            "category": "string (Exact match from the ALLOWED CATEGORIES list above)"
          }
        `;

        const imagePart = {
          inlineData: {
            data: photo.base64,
            mimeType: "image/jpeg"
          },
        };

        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();
        
        const cleanJsonText = responseText.replace(/```json|```/g, '').trim();
        const extractedInfo = JSON.parse(cleanJsonText);

        const merchantName = extractedInfo.name || 'Scanned Receipt';
        const totalAmount = extractedInfo.amount || 0;
        const matchedCategory = extractedInfo.category || 'Food';

        Alert.alert(
          "Scan Complete 🎉",
          `Merchant: ${merchantName}\nAmount: ₱${Number(totalAmount).toFixed(2)}\nCategory: ${matchedCategory}`,
          [
            {
              text: "Log Expense",
              onPress: async () => {
                try {
                  const { data: { user }, error: userError } = await supabase.auth.getUser();
                  if (userError || !user) throw new Error("You must be logged in to log expenses.");

                  let targetAllowanceId = paramAllowanceId;

                  // 1. Check if allowance exists for the user if not provided in params
                  if (!targetAllowanceId) {
                    const { data: latestAllowance } = await supabase
                      .from('allowances')
                      .select('id')
                      .eq('spender_id', user.id)
                      .order('received_at', { ascending: false })
                      .limit(1)
                      .single();

                    if (!latestAllowance) {
                      Alert.alert("No Allowance Found ❌", "No active allowance was detected for your account. Please set up an allowance before logging expenses.");
                      setFrozenPhoto(null);
                      return;
                    }
                    targetAllowanceId = latestAllowance.id;
                  } else {
                    // Verify the provided paramAllowanceId actually exists
                    const { data: specificAllowance } = await supabase
                      .from('allowances')
                      .select('id')
                      .eq('id', targetAllowanceId)
                      .single();

                    if (!specificAllowance) {
                      Alert.alert("No Allowance Found ❌", "No allowance was detected for this transaction.");
                      setFrozenPhoto(null);
                      return;
                    }
                  }

                  // 2. Calculate remaining allowance amount
                  const { data: allowanceDetails, error: allowanceError } = await supabase
                    .from('allowances')
                    .select('amount')
                    .eq('id', targetAllowanceId)
                    .single();

                  if (allowanceError || !allowanceDetails) {
                    throw new Error("Could not retrieve allowance details.");
                  }

                  const { data: spentData, error: spentError } = await supabase
                    .from('expenses')
                    .select('amount')
                    .eq('allowance_id', targetAllowanceId);

                  if (spentError) throw spentError;

                  const totalSpent = (spentData || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
                  const remainingAllowance = Number(allowanceDetails.amount) - totalSpent;

                  // Check if expense amount is greater than remaining allowance
                  if (Number(totalAmount) > remainingAllowance) {
                    Alert.alert(
                      "Budget Exceeded ⚠️",
                      `The scanned amount (₱${Number(totalAmount).toFixed(2)}) is greater than your remaining allowance balance (₱${remainingAllowance.toFixed(2)}).`
                    );
                    setFrozenPhoto(null);
                    return;
                  }

                  const { data: categoryData } = await supabase
                    .from('categories')
                    .select('id')
                    .eq('name', matchedCategory)
                    .single();

                  const categoryId = categoryData ? categoryData.id : null;

                  const fileName = `${user.id}/${Date.now()}.jpg`;
                  const { error: uploadError } = await supabase.storage
                    .from('receipts')
                    .upload(fileName, decode(photo.base64), {
                      contentType: 'image/jpeg',
                      upsert: false
                    });

                  if (uploadError) throw uploadError;

                  const { data: urlData } = supabase.storage
                    .from('receipts')
                    .getPublicUrl(fileName);

                  const photoUrl = urlData.publicUrl;

                  const { error: insertError } = await supabase.from('expenses').insert([
                    { 
                      description: merchantName, 
                      amount: Number(totalAmount), 
                      allowance_id: targetAllowanceId || null, 
                      spent_at: new Date().toISOString(),
                      user_id: user.id,
                      category_id: categoryId,
                      photo_url: photoUrl
                    }
                  ]);
                  
                  if (insertError) throw insertError;

                  Alert.alert("Success", "Expense and receipt logged successfully!");
                  router.replace('/transaction');
                } catch (dbError: any) {
                  console.error("Database/Storage Log Error:", dbError);
                  Alert.alert("Error", dbError.message || "Could not save the expense or upload the receipt.");
                } finally {
                  setFrozenPhoto(null);
                }
              }
            },
            { 
              text: "Try Again", 
              style: "cancel",
              onPress: () => setFrozenPhoto(null)
            }
          ]
        );

      } catch (error: any) {
        console.error("Gemini Scan Error:", error);
        Alert.alert(
          "Scan Failed ❌", 
          "Gemini could not read or structuralize the text nodes accurately. Make sure the receipt matches the green framing borders."
        );
        setFrozenPhoto(null);
      } finally {
        setScanning(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      
      {/* Live camera view or Frozen Image Preview */}
      {frozenPhoto ? (
        <Animated.Image source={{ uri: frozenPhoto }} style={StyleSheet.absoluteFill} />
      ) : isFocused ? (
        <CameraView 
          style={StyleSheet.absoluteFill} 
          ref={cameraRef} 
          facing="back"
          enableTorch={torchOn}
          active={isFocused}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }]} />
      )}

      {/* Modern Overlay & Scanning Target Box */}
      <View style={styles.overlayContainer}>
        <View style={styles.topUtilityRow}>
          <TouchableOpacity 
            style={styles.utilityRoundButton} 
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.badgeContainer}>
            <View style={styles.pulseDot} />
            <Text style={styles.instructionText}>AI Auto-Detect</Text>
          </View>

          <TouchableOpacity 
            style={[styles.utilityRoundButton, torchOn && styles.utilityButtonActive]} 
            onPress={toggleFlash}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={torchOn ? "flash" : "flash-off-outline"} 
              size={20} 
              color={torchOn ? "#10B981" : "#FFFFFF"} 
            />
          </TouchableOpacity>
        </View>

        {/* Dynamic Edge Framing Target with Corner Highlights */}
        <View style={styles.scanTargetBox}>
          <View style={[styles.cornerMarker, styles.topLeftMarker]} />
          <View style={[styles.cornerMarker, styles.topRightMarker]} />
          <View style={[styles.cornerMarker, styles.bottomLeftMarker]} />
          <View style={[styles.cornerMarker, styles.bottomRightMarker]} />

          {/* Animated Laser Scanning Line */}
          {scanning && (
            <Animated.View style={[styles.laserLineContainer, laserStyle]}>
              <View style={styles.laserGlow} />
              <View style={styles.laserCore} />
            </Animated.View>
          )}
        </View>

        <View style={styles.safeBottomHeaderSpacer} />
      </View>

      {/* Bottom Shutter Controls */}
      <View style={styles.actionControlContainer}>
        {scanning ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="small" color="#10B981" />
            <Text style={styles.loadingText}>Extracting receipt data via Gemini...</Text>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.outerCaptureRing} 
            onPress={handleTakePicture}
            activeOpacity={0.8}
          >
            <View style={styles.innerCaptureSolid} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  fallbackContainer: { flex: 1, backgroundColor: '#FAFBFD' },
  centerAlign: { justifyContent: 'center', alignItems: 'center' },
  topUtilityRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 50 : 10,
  },
  utilityRoundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.6)', 
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)'
  },
  utilityButtonActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#10B981'
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  instructionText: { 
    color: '#FFFFFF', 
    fontSize: 13, 
    fontWeight: '600', 
    letterSpacing: 0.2,
  },
  overlayContainer: { 
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between', 
    alignItems: 'center', 
    backgroundColor: 'rgba(3, 7, 18, 0.55)', 
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  scanTargetBox: { 
    width: width * 0.82, 
    height: width * 1.2, 
    borderWidth: 1.5, 
    borderColor: 'rgba(16, 185, 129, 0.4)', 
    borderRadius: 28, 
    backgroundColor: 'transparent',
    overflow: 'hidden',
    position: 'relative'
  },
  cornerMarker: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#10B981',
    borderWidth: 3,
  },
  topLeftMarker: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 18,
  },
  topRightMarker: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 18,
  },
  bottomLeftMarker: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 18,
  },
  bottomRightMarker: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 18,
  },
  laserLineContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laserCore: {
    width: '90%',
    height: 3,
    backgroundColor: '#34D399',
    borderRadius: 2,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  laserGlow: {
    position: 'absolute',
    width: '100%',
    height: 16,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
  },
  safeBottomHeaderSpacer: { marginBottom: 10 },
  subInstructionText: { 
    color: '#94A3B8', 
    fontSize: 13, 
    textAlign: 'center', 
    fontWeight: '500',
    letterSpacing: -0.2
  },
  actionControlContainer: { 
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(3, 7, 18, 0.9)', 
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)'
  },
  outerCaptureRing: { 
    width: 78, 
    height: 78, 
    borderRadius: 39, 
    borderWidth: 4, 
    borderColor: '#FFFFFF', 
    justifyContent: 'center', 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5
  },
  innerCaptureSolid: { 
    width: 60, 
    height: 60, 
    borderRadius: 30, 
    backgroundColor: '#10B981' 
  },
  loadingBlock: { 
    alignItems: 'center', 
    flexDirection: 'row', 
    gap: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  loadingText: { color: '#E2E8F0', fontSize: 13, fontWeight: '600', letterSpacing: -0.2 },
  permissionIconCircle: { 
    width: 64, 
    height: 64, 
    borderRadius: 20, 
    backgroundColor: '#F1F5F9', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: '#1E293B', textAlign: 'center', letterSpacing: -0.4 },
  permissionDescription: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 22, fontWeight: '400' },
  grantPermissionBtn: { backgroundColor: '#1E293B', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 16, marginTop: 28 },
  grantPermissionBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 }
});