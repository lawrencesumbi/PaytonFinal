import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname, useRouter } from "expo-router";
import type { ComponentProps } from "react";
import { useEffect } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View
} from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type TabIconName = ComponentProps<typeof Ionicons>["name"];

type TabIconProps = {
  focused: boolean;
  color: string;
  activeIcon: TabIconName;
  inactiveIcon: TabIconName;
};

function TabIcon({
  focused,
  color,
  activeIcon,
  inactiveIcon,
}: TabIconProps) {
  return (
    <View style={styles.iconContainer}>
      <Ionicons
        name={focused ? activeIcon : inactiveIcon}
        size={21}
        color={focused ? "#013237" : color}
      />
    </View>
  );
}

export default function SponsorTabsLayout() {
  const router = useRouter();
  const pathname = usePathname();

  const isMonitoringScreen = pathname === "/monitoring" || pathname.includes("monitoring");
  const isInsightScreen = pathname === "/insight" || pathname.includes("insight");
  const isAllowanceScreen = pathname === "/allowance" || pathname.includes("allowance");
  const isProfileScreen = pathname === "/profile" || pathname.includes("profile");
  
  const shouldHideAiButton = isInsightScreen; 
  
  // Hide the tab bar if it's insight, allowance, monitoring, or profile
  const shouldHideTabBar = isInsightScreen || isAllowanceScreen || isMonitoringScreen || isProfileScreen;

  // Animation values for the bubble & button
  const bubbleScale = useSharedValue(0);
  const bubbleOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(1);

  // Check if current route is home
  const isHome = pathname === "/home" || pathname === "/" || pathname.endsWith("/home");

  useEffect(() => {
    if (isHome && !shouldHideAiButton) {
      // Trigger pop up animation when navigating to home
      bubbleScale.value = withSequence(
        withSpring(1.1, { damping: 10, stiffness: 120 }),
        withSpring(1, { damping: 12 })
      );
      bubbleOpacity.value = withTiming(1, { duration: 200 });

      // Subtle pulse on the AI button itself
      buttonScale.value = withSequence(
        withSpring(1.2),
        withSpring(1)
      );

      // Auto-hide the bubble after 4 seconds
      const timer = setTimeout(() => {
        bubbleScale.value = withTiming(0, { duration: 250 });
        bubbleOpacity.value = withTiming(0, { duration: 200 });
      }, 4000);

      return () => clearTimeout(timer);
    } else {
      // Hide bubble immediately when leaving home
      bubbleScale.value = 0;
      bubbleOpacity.value = 0;
    }
  }, [isHome, shouldHideAiButton]);

  const animatedBubbleStyle = useAnimatedStyle(() => ({
    opacity: bubbleOpacity.value,
    transform: [{ scale: bubbleScale.value }, { translateY: 0 }],
  }));

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#013237",
          tabBarInactiveTintColor: "#4CA771",
          tabBarItemStyle: styles.tabBarItem,

          tabBarButton: (props: any) => {
            const { children, style, ...rest } = props;

            return (
              <Pressable
                {...rest}
                style={style as any}
                android_ripple={{ color: "transparent" }}
              >
                {children}
              </Pressable>
            );
          },

          tabBarStyle: [
            styles.tabBar,
            shouldHideTabBar ? { display: "none" as const } : null,
          ],
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }: any) => (
              <TabIcon
                color={color}
                focused={focused}
                activeIcon="home"
                inactiveIcon="home-outline"
              />
            ),
          }}
        />

        <Tabs.Screen
          name="allowances"
          options={{
            title: "Monitoring",
            tabBarLabelStyle: styles.monitoringLabel,
            tabBarIcon: ({ focused }: any) => (
              <View
                style={[
                  styles.floatingButton,
                  focused && styles.floatingButtonActive,
                ]}
              >
                <Ionicons
                  name={focused ? "pulse" : "pulse-outline"}
                  size={30}
                  color="#EAF9E7"
                />
              </View>
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, focused }: any) => (
              <TabIcon
                color={color}
                focused={focused}
                activeIcon="person"
                inactiveIcon="person-outline"
              />
            ),
          }}
        />

        <Tabs.Screen name="monitoring" options={{ href: null }} />

      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: Platform.OS === "ios" ? 28 : 20,
    height: Platform.OS === "ios" ? 70 : 66,
    paddingTop: 7,
    paddingBottom: Platform.OS === "ios" ? 7 : 6,
    paddingHorizontal: 8,
    marginHorizontal: 60,
    borderRadius: 35,
    backgroundColor: "#EAF9E7", // Lightest pale green background
    borderWidth: 1.5,
    borderColor: "#C0E6BA", // Light soft green border
    overflow: "visible",
    shadowColor: "#013237",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },

  tabBarItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },

  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },

  monitoringLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    marginTop: -1,
    marginBottom: Platform.OS === "ios" ? -2 : 0,
    color: "#013237",
  },

  floatingButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#4CA771", // Vibrant mid-green floating button
    justifyContent: "center",
    alignItems: "center",
    top: -25,
    borderWidth: 5,
    borderColor: "#EAF9E7", // Blends with floating tab bar
    shadowColor: "#013237",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  floatingButtonActive: {
    backgroundColor: "#013237", // Dark teal highlight when focused
    borderColor: "#C0E6BA",
  },
});