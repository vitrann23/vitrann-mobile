// app/_layout.tsx
import { Stack } from 'expo-router'
import Toast from 'react-native-toast-message'

export default function RootLayout() {
  return (
    <>
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
        <Stack.Screen name="DayCompletedScreen" />
      </Stack>
      
      {/* Toast component - this makes it available globally */}
      <Toast />
    </>
  )
}
