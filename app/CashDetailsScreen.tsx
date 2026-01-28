"use client"

import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import Toast from 'react-native-toast-message'

const notes = [
  { label: "₹500", value: 500, color: "#87CEEB" },
  { label: "₹200", value: 200, color: "#87CEEB" },
  { label: "₹100", value: 100, color: "#87CEEB" },
  { label: "₹50", value: 50, color: "#87CEEB" },
  { label: "₹20", value: 20, color: "#87CEEB" },
  { label: "₹10", value: 10, color: "#87CEEB" },
]

const coins = [
  { label: "₹10 (Coin)", value: 10, color: "#87CEEB" },
  { label: "₹5", value: 5, color: "#87CEEB" },
  { label: "₹2", value: 2, color: "#87CEEB" },
  { label: "₹1", value: 1, color: "#87CEEB" },
]

const API_BASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL ?? 'https://theinfranova.com/api';

// API function to check for existing cash entry
const checkExistingEntry = async () => {
  try {
    const token = await AsyncStorage.getItem('authToken')
    if (!token) {
      return { exists: false, data: null }
    }

    if (!API_BASE_URL) {
      return { exists: false, data: null }
    }

    const response = await fetch(`${API_BASE_URL}/deliveries/total-amount`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })

    if (response.status === 404) {
      return { exists: false, data: null }
    }

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data) {
        return { exists: true, data: data.data }
      }
    }
    
    return { exists: false, data: null }
  } catch (error) {
    console.error('Error checking existing entry:', error)
    return { exists: false, data: null }
  }
}

// API function to submit total amount
const submitTotalAmount = async (amount: number) => {
  try {
    const token = await AsyncStorage.getItem('authToken')
    if (!token) {
      throw new Error('No authentication token found')
    }

    if (!API_BASE_URL) {
      throw new Error('API base URL is not configured.')
    }

    const response = await fetch(`${API_BASE_URL}/deliveries/total-amount`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: amount
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      const errorMessage = data.message || data.error || `HTTP error! status: ${response.status}`
      throw new Error(errorMessage)
    }

    return data
  } catch (error) {
    console.error('API request failed:', error)
    throw error
  }
}

export default function CashDetailsScreen() {
  const router = useRouter()
  const params = useLocalSearchParams()
  const insets = useSafeAreaInsets()

  const maxCashAmount = params.maxCashAmount ? Number(params.maxCashAmount) : 0

  const [noteCounts, setNoteCounts] = useState<Record<string, string>>({})
  const [coinCounts, setCoinCounts] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [existingEntry, setExistingEntry] = useState<{ id: number; amount: number; date: string } | null>(null)

  useEffect(() => {
    const checkEntry = async () => {
      setLoading(true)
      const result = await checkExistingEntry()
      if (result.exists && result.data) {
        setExistingEntry(result.data)
      }
      setLoading(false)
    }
    checkEntry()
  }, [])

  const computeTotal = (notesObj: Record<string, string>, coinsObj: Record<string, string>) => {
    let total = 0
    Object.entries(notesObj).forEach(([label, val]) => {
      const note = notes.find((n) => n.label === label)
      if (note) total += note.value * (Number(val) || 0)
    })
    Object.entries(coinsObj).forEach(([label, val]) => {
      const coin = coins.find((c) => c.label === label)
      if (coin) total += coin.value * (Number(val) || 0)
    })
    return total
  }

  const totalAmount = useMemo(() => computeTotal(noteCounts, coinCounts), [noteCounts, coinCounts])

  const onChangeCount = (type: "note" | "coin", label: string, value: string) => {
    const filtered = value.replace(/[^0-9]/g, "")
    if (!filtered) {
      if (type === "note") setNoteCounts((prev) => ({ ...prev, [label]: "" }))
      else setCoinCounts((prev) => ({ ...prev, [label]: "" }))
      return
    }
    const valInt = Number(filtered)
    if (isNaN(valInt)) return

    const tempNotes = { ...noteCounts }
    const tempCoins = { ...coinCounts }
    if (type === "note") tempNotes[label] = filtered
    else tempCoins[label] = filtered

    if (type === "note") setNoteCounts(tempNotes)
    else setCoinCounts(tempCoins)
  }

  const onNext = async () => {
    // Validate that user has entered some amount
    if (totalAmount <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Enter Cash Details',
        text2: 'Please enter the cash amount collected',
        visibilityTime: 3000,
      })
      return
    }

    setSubmitting(true)

    try {
      // Submit total amount to API
      const response = await submitTotalAmount(totalAmount)

      if (response.success) {
        Toast.show({
          type: 'success',
          text1: 'Amount Submitted',
          text2: `₹${totalAmount} submitted successfully`,
          visibilityTime: 2000,
        })

        // Navigate to next screen with cash details
        const cashDetails = { noteCounts, coinCounts, totalAmount }
        
        // Small delay to show success message
        setTimeout(() => {
          router.push({
            pathname: "/ReturnedStocksScreen",
            params: { 
              ...params, 
              cashDetails: JSON.stringify(cashDetails),
              submittedAmount: totalAmount.toString()
            },
          })
        }, 1200)

      } else {
        throw new Error(response.message || 'Failed to submit amount')
      }

    } catch (error) {
      console.error('Error submitting total amount:', error)
      
      Toast.show({
        type: 'error',
        text1: 'Submission Failed',
        text2: 'Unable to submit amount. Please try again.',
        visibilityTime: 4000,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const renderCard = (item: { label: string; value: number; color: string }, type: "note" | "coin") => (
    <View key={item.label} style={[styles.card, { backgroundColor: item.color }]}>
      <Text style={styles.label}>{item.label}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        maxLength={3}
        value={type === "note" ? (noteCounts[item.label] ?? "") : (coinCounts[item.label] ?? "")}
        placeholder="0"
        placeholderTextColor="#999"
        onChangeText={(val) => onChangeCount(type, item.label, val)}
        editable={!submitting}
      />
    </View>
  )

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={styles.loadingText}>Checking existing entries...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (existingEntry) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.messageContainer}>
            <Text style={styles.messageIcon}>✅</Text>
            <Text style={styles.messageTitle}>Hi, you have already submitted today's entry</Text>
            <View style={styles.amountDisplay}>
              <Text style={styles.amountLabel}>Submitted Amount</Text>
              <Text style={styles.amountValue}>₹{existingEntry.amount}</Text>
            </View>
            <TouchableOpacity 
              style={styles.continueButton}
              onPress={() => {
                router.push({
                  pathname: "/ReturnedStocksScreen",
                  params: { 
                    ...params,
                    submittedAmount: existingEntry.amount.toString()
                  },
                })
              }}
            >
              <Text style={styles.continueButtonText}>Continue to Next Step →</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.backButtonAlt}
              onPress={() => router.back()}
            >
              <Text style={styles.backButtonText}>← Go Back</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Enter Cash Details</Text>
            <View style={styles.titleUnderline} />
          </View>

          <View style={styles.sectionHeader}>
            <Image source={require("../assets/images/Notes.png")} style={styles.sectionIcon} />
            <Text style={styles.sectionTitle}>Notes</Text>
          </View>
          {notes.map((note) => renderCard(note, "note"))}

          <View style={styles.sectionHeader}>
            <Image source={require("../assets/images/Coins.png")} style={styles.sectionIcon} />
            <Text style={styles.sectionTitle}>Coins</Text>
          </View>
          {coins.map((coin) => renderCard(coin, "coin"))}

          <View style={[styles.totalContainer, totalAmount > 0 && styles.totalContainerActive]}>
            <Text style={styles.totalLabel}>Total Entered</Text>
            <Text style={[styles.totalAmount, totalAmount > 0 && styles.totalAmountActive]}>
              ₹{totalAmount}
            </Text>
            {totalAmount > 0 && (
              <Text style={styles.totalSubtext}>This amount will be submitted</Text>
            )}
          </View>

          <TouchableOpacity 
            style={[
              styles.nextButton, 
              submitting && styles.nextButtonDisabled,
              totalAmount <= 0 && styles.nextButtonInactive
            ]} 
            onPress={onNext} 
            activeOpacity={0.85}
            disabled={submitting || totalAmount <= 0}
          >
            {submitting ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.nextButtonText}>Submitting...</Text>
              </View>
            ) : (
              <Text style={styles.nextButtonText}>
                {totalAmount > 0 ? `Submit ₹${totalAmount}` : 'Enter Amount First'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20 },
  titleContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#1A365D",
    textAlign: "center",
    letterSpacing: -0.8,
    textShadowColor: "rgba(30, 41, 59, 0.1)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    marginBottom: 8,
  },
  titleUnderline: {
    width: 60,
    height: 4,
    backgroundColor: "#1e40af",
    borderRadius: 2,
    shadowColor: "#1e40af",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 16,
  },
  sectionIcon: {
    marginRight: 8,
    width: 24,
    height: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#334155",
    letterSpacing: -0.3,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 14,
    backgroundColor: "#1E90FF",
    shadowColor: "#0000FF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  label: {
    fontSize: 19,
    fontWeight: "700",
    color: "#1e293b",
    letterSpacing: -0.2,
  },
  input: {
    width: 80,
    height: 48,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    backgroundColor: "#f8fafc",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  totalContainer: {
    marginTop: 32,
    padding: 24,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    alignItems: "center",
    shadowColor: "#1e40af",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: "#e0e7ff",
  },
  totalContainerActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#1e40af",
    borderWidth: 2,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: "600",
    color: "#475569",
    letterSpacing: -0.1,
  },
  totalAmount: {
    fontSize: 38,
    fontWeight: "900",
    color: "#1e40af",
    marginTop: 6,
    letterSpacing: -1,
  },
  totalAmountActive: {
    color: "#059669",
  },
  totalSubtext: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 8,
    fontStyle: "italic",
  },
  nextButton: {
    marginTop: 40,
    borderRadius: 16,
    paddingVertical: 18,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1e40af",
    shadowColor: "#1e40af",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  nextButtonInactive: {
    backgroundColor: "#94A3B8",
    shadowColor: "#94A3B8",
  },
  nextButtonDisabled: {
    backgroundColor: "#F59E0B",
  },
  nextButtonText: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "#64748b",
    fontWeight: "600",
  },
  messageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  messageIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  messageTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1e293b",
    textAlign: "center",
    marginBottom: 40,
    paddingHorizontal: 20,
    lineHeight: 32,
  },
  amountDisplay: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    marginBottom: 40,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 2,
    borderColor: "#d1fae5",
    minWidth: 280,
  },
  amountLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 12,
  },
  amountValue: {
    fontSize: 48,
    fontWeight: "900",
    color: "#10b981",
  },
  continueButton: {
    backgroundColor: "#10b981",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 40,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 16,
  },
  continueButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
  backButtonAlt: {
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  backButtonText: {
    color: "#64748b",
    fontSize: 16,
    fontWeight: "700",
  },
})
