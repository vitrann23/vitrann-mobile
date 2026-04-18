// app/_layout.tsx
import {
  LeagueSpartan_400Regular,
  LeagueSpartan_600SemiBold,
  LeagueSpartan_700Bold,
  LeagueSpartan_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/league-spartan";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import Toast from "react-native-toast-message";
import { QueryProvider } from "../providers/QueryProvider";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    LeagueSpartan_400Regular,
    LeagueSpartan_600SemiBold,
    LeagueSpartan_700Bold,
    LeagueSpartan_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <QueryProvider>
      <Stack
        screenOptions={{
          headerShown: false, // Hide headers globally
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="MorningStockScreen" />
        <Stack.Screen name="CustomerDeliveryScreen" />
        <Stack.Screen name="ReturnedStocksScreen" />
        <Stack.Screen name="CashDetailsScreen" />
        <Stack.Screen name="DailySummaryScreen" />
      </Stack>

      {/* Toast component - this makes it available globally */}
      <Toast />
    </QueryProvider>
  );
}
