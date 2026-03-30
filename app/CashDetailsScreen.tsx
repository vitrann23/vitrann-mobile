"use client"

import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useLocalSearchParams, useRouter } from "expo-router"
import { useMemo, useState } from "react"
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
  StatusBar,
} from "react-native"
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import Toast from 'react-native-toast-message'
import apiClient from '../services/apiClient'

const notes = [
  { label: "500", value: 500 },
  { label: "200", value: 200 },
  { label: "100", value: 100 },
  { label: "50", value: 50 },
  { label: "20", value: 20 },
  { label: "10", value: 10 },
]

const coins = [
  { label: "Coin", value: 1 }
]



// API function to submit total amount
const submitTotalAmount = async (amount: number) => {
  try {
    const response = await apiClient.post('/deliveries/total-amount', {
      amount: amount
    }) as any
    return response
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
  const [submitting, setSubmitting] = useState(false) // Loading state

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
            pathname: "/DailySummaryScreen",
            params: {
              ...params,
              cashDetails: JSON.stringify(cashDetails),
              submittedAmount: totalAmount.toString()
            },
          })
        }, 1200)

      } else {
        if (response.message === "Cash in hand entry already exists for today" && response.data) {
          router.push({
            pathname: "/EntriesSubmitted" as any,
            params: { amount: response.data.amount }
          })
          return;
        }
        throw new Error(response.message || 'Failed to submit amount')
      }

    } catch (error: any) {
      console.error('Error submitting total amount:', error)

      // In case it comes back as an HTTP error rather than a 201 with success: false
      const errorData = error?.response?.data
      if (errorData?.message === "Cash in hand entry already exists for today" && errorData?.data) {
        router.push({
          pathname: "/EntriesSubmitted" as any,
          params: { amount: errorData.data.amount }
        })
        return;
      }

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

  const renderCard = (item: { label: string; value: number }, type: "note" | "coin") => (
    <View key={item.label} style={styles.card}>
      <View style={styles.labelContainer}>
        <Text style={styles.currencySymbol}>₹</Text>
        <Text style={styles.label}>{item.label}</Text>
      </View>
      <View style={styles.inputWrapper}>
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
    </View>
  )

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Standardized Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cash Details</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.introContainer}>
            <Text style={styles.introTitle}>Enter Cash Details</Text>
          </View>

          <View style={styles.mainCard}>
            {notes.map((note) => renderCard(note, "note"))}
            {coins.map((coin) => renderCard(coin, "coin"))}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabelText}>Total</Text>
              <View style={styles.totalValueBox}>
                <Text style={styles.totalValueText}>
                  {totalAmount.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.nextButton,
              submitting && styles.nextButtonDisabled,
            ]}
            onPress={onNext}
            activeOpacity={0.85}
            disabled={submitting || totalAmount <= 0}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.nextButtonText}>Enter</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F7F7"
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  content: {
    paddingHorizontal: 17,
    paddingTop: 10,
  },
  introContainer: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 15,
  },
  introTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#007AFF",
    textAlign: "center",
  },
  mainCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 15,
    paddingTop: 20,
    marginTop: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#999", // Outline color from image
    backgroundColor: "#fff",
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontSize: 22,
    fontWeight: "700",
    color: "#000",
    marginRight: 10,
  },
  label: {
    fontSize: 24,
    fontWeight: "700",
    color: "#000",
  },
  inputWrapper: {
    backgroundColor: "#D9E8FC", // Light blue background for input
    borderRadius: 6,
    width: 80,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    width: '100%',
    height: '100%',
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 25,
    marginBottom: 10,
    paddingHorizontal: 5,
  },
  totalLabelText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#000',
  },
  totalValueBox: {
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 5,
    paddingHorizontal: 15,
    height: 40,
    minWidth: 140,
    justifyContent: 'center',
    alignItems: 'flex-end',
    backgroundColor: '#fff',
  },
  totalValueText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000',
  },
  nextButton: {
    marginTop: 25,
    height: 56,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#3C81F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 4,
  },
  nextButtonDisabled: {
    backgroundColor: "#94A3B8",
  },
  nextButtonText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
  },
})
