// app/scan.tsx
import { Ionicons } from '@expo/vector-icons';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { decode } from 'base64-arraybuffer';
import { CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
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
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

export default function ScanReceiptScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { allowanceId: paramAllowanceId } = useLocalSearchParams<{ allowanceId?: string }>();

  const isFocused = pathname === '/scan' || pathname.includes('scan');

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const cameraRef = useRef<any>(null);

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
        
        const options = { quality: 0.5, base64: true, skipProcessing: false };
        const photo = await cameraRef.current.takePictureAsync(options);

        if (!photo.base64) {
          throw new Error("Unable to read valid image binary base64 data stream.");
        }

        const model = genAI.getGenerativeModel({ 
          model: "gemini-2.5-flash",
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
                  // 1. Get current logged-in user
                  const { data: { user }, error: userError } = await supabase.auth.getUser();
                  if (userError || !user) throw new Error("You must be logged in to log expenses.");

                  // 2. Kuhaon ang allowance ID (Gamiton ang gikan sa params kung naa, kung wala, pangitaon ang pinakabag-o)
                  let targetAllowanceId = paramAllowanceId;
                  if (!targetAllowanceId) {
                    const { data: latestAllowance } = await supabase
                      .from('allowances')
                      .select('id')
                      .eq('spender_id', user.id)
                      .order('received_at', { ascending: false })
                      .limit(1)
                      .single();

                    if (latestAllowance) {
                      targetAllowanceId = latestAllowance.id;
                    }
                  }

                  // 3. Fetch matching category ID from categories table
                  const { data: categoryData } = await supabase
                    .from('categories')
                    .select('id')
                    .eq('name', matchedCategory)
                    .single();

                  const categoryId = categoryData ? categoryData.id : null;

                  // 4. Upload photo directly via base64 arraybuffer
                  const fileName = `${user.id}/${Date.now()}.jpg`;
                  const { error: uploadError } = await supabase.storage
                    .from('receipts')
                    .upload(fileName, decode(photo.base64), {
                      contentType: 'image/jpeg',
                      upsert: false
                    });

                  if (uploadError) throw uploadError;

                  // 5. Get Public URL for the uploaded photo
                  const { data: urlData } = supabase.storage
                    .from('receipts')
                    .getPublicUrl(fileName);

                  const photoUrl = urlData.publicUrl;

                  // 6. Insert record into expenses table using targetAllowanceId
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
                }
              }
            },
            { text: "Try Again", style: "cancel" }
          ]
        );

      } catch (error: any) {
        console.error("Gemini Scan Error:", error);
        Alert.alert(
          "Scan Failed ❌", 
          "Gemini could not read or structuralize the text nodes accurately. Make sure the receipt matches the green framing borders."
        );
      } finally {
        setScanning(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      
      {isFocused ? (
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

      <View style={styles.overlayContainer}>
        <View style={styles.topUtilityRow}>
          <TouchableOpacity 
            style={styles.utilityRoundButton} 
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <Text style={styles.instructionText}>Align receipt within frame</Text>

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

        <View style={styles.scanTargetBox} />

        <View style={styles.safeBottomHeaderSpacer}>
          <Text style={styles.subInstructionText}>Ensure text is bright, legible, and clear</Text>
        </View>
      </View>

      <View style={styles.actionControlContainer}>
        {scanning ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.loadingText}>Analyzing receipt nodes...</Text>
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
    paddingTop: Platform.OS === 'android' ? 50 : 0,
  },
  utilityRoundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30, 41, 59, 0.7)', 
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)'
  },
  utilityButtonActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#10B981'
  },
  overlayContainer: { 
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between', 
    alignItems: 'center', 
    backgroundColor: 'rgba(15, 23, 42, 0.45)', 
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  instructionText: { 
    color: '#FFFFFF', 
    fontSize: 15, 
    fontWeight: '600', 
    textAlign: 'center',
    letterSpacing: -0.3,
    flex: 1,
    marginHorizontal: 10
  },
  scanTargetBox: { 
    width: width * 0.78, 
    height: width * 1.15, 
    borderWidth: 2, 
    borderColor: '#10B981', 
    borderRadius: 24, 
    backgroundColor: 'transparent' 
  },
  safeBottomHeaderSpacer: { marginBottom: 50 },
  subInstructionText: { 
    color: '#94A3B8', 
    fontSize: 13, 
    textAlign: 'center', 
    fontWeight: '500' 
  },
  actionControlContainer: { 
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.85)', 
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  outerCaptureRing: { 
    width: 76, 
    height: 76, 
    borderRadius: 38, 
    borderWidth: 4, 
    borderColor: '#FFFFFF', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  innerCaptureSolid: { 
    width: 56, 
    height: 56, 
    borderRadius: 28, 
    backgroundColor: '#10B981' 
  },
  loadingBlock: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  loadingText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500', letterSpacing: -0.1 },
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