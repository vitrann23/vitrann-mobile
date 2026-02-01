// app/_layout.tsx
import { Stack } from 'expo-router'
import Toast from 'react-native-toast-message'
import { QueryProvider } from '../providers/QueryProvider'

export default function RootLayout() {
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
  )
}
