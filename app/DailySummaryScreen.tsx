"use client"

import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'

// Types
type ProductSummary = { [name: string]: number }

type InventoryItem = {
  id: number
  workerId: number
  inventoryId: number
  totalPickedQuantity: number | null
  remainingQuantity: number | null
  date: string
  inventory: {
    inventoryId: number
    totalOrderedQuantity: number
    receivedQuantity: number | null
    remainingQuantity: number | null
    date: string
    product: {
      productId: number
      productName: string
      currentProductPrice: number
      storeId: string
      imageUrl: string | null
      description: string | null
    }
  }
}

// ✅ UPDATED: Single cash record structure based on backend response
type CashRecord = {
  id: number
  workerId: number
  date: string
  amount: number
}

type DeliveryData = {
  pickedQuantity: number
  remainingQuantity: number
  deliveredQuantity: number
  productName: string 
}

const API_BASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL ?? 'https://theinfranova.com/api';

// API helper function
const makeAuthenticatedRequest = async (url: string, options: RequestInit = {}) => {
  try {
    const token = await AsyncStorage.getItem('authToken')
    if (!token) {
      throw new Error('No authentication token found')
    }

    if (!API_BASE_URL) {
      throw new Error('API base URL is not configured.')
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('API request failed:', error)
    throw error
  }
}

// Helper functions
function formatSummaryRows(data: ProductSummary) {
  const rows = Object.entries(data)
    .filter(([_, qty]) => qty !== undefined && qty !== null && Number(qty) > 0)
    .map(([name, qty]) => (
      <View key={name} style={styles.summaryRow}>
        <Text style={styles.productName}>{name}:</Text>
        <Text style={styles.productQty}>{qty} packets</Text>
      </View>
    ))

  if (rows.length === 0) {
    return <Text style={styles.noProducts}>No products</Text>
  }

  return rows
}

function totalPackets(data: ProductSummary) {
  return Object.values(data).reduce((sum, val) => sum + Number(val), 0)
}

export default function DailySummaryScreen() {
  const params = useLocalSearchParams()
  const router = useRouter()

  // State management
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([])
  const [deliveryData, setDeliveryData] = useState<DeliveryData[]>([])
  const [cashRecord, setCashRecord] = useState<CashRecord | null>(null) // ✅ UPDATED: Single cash record
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Parse remaining quantities from params
  const remainingFromParams: ProductSummary = params.remaining ? JSON.parse(params.remaining as string) : {}

  useEffect(() => {
    fetchAllData()
  }, [])

  const fetchAllData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch both inventory and cash data simultaneously
      const [inventoryResponse, cashResponse] = await Promise.all([
        makeAuthenticatedRequest('/daily-activity-ci/my-inventory'),
        makeAuthenticatedRequest('/deliveries/total-amount')
      ])

      console.log('Inventory response:', inventoryResponse)
      console.log('Cash response:', cashResponse)

      // Process inventory data
      if (inventoryResponse.success && inventoryResponse.data) {
        setInventoryData(inventoryResponse.data)
        
        // Calculate delivery data: Picked - Remaining = Delivered
        const calculatedDeliveryData: DeliveryData[] = inventoryResponse.data
          .filter((item: InventoryItem) => item.totalPickedQuantity && item.totalPickedQuantity > 0)
          .map((item: InventoryItem) => {
            const pickedQuantity = item.totalPickedQuantity || 0
            const remainingQuantity = remainingFromParams[item.inventory.product.productName] || 0
            const deliveredQuantity = pickedQuantity - remainingQuantity

            return {
              pickedQuantity,
              remainingQuantity,
              deliveredQuantity,
              productName: item.inventory.product.productName
            }
          })

        setDeliveryData(calculatedDeliveryData)
      }

      // ✅ UPDATED: Process single cash record from backend
      if (cashResponse.success && cashResponse.data) {
        setCashRecord(cashResponse.data)
      } else {
        // Handle case where no cash record exists
        setCashRecord(null)
      }

      Toast.show({
        type: 'success',
        text1: 'Data Loaded',
        text2: 'Summary data loaded successfully',
        visibilityTime: 2000,
      })

    } catch (error: any) {
      console.error('Error fetching summary data:', error)
      const errorMessage = error.message || 'Failed to load summary data'
      setError(errorMessage)
      
      Toast.show({
        type: 'error',
        text1: 'Loading Failed',
        text2: errorMessage,
        visibilityTime: 3000,
      })
    } finally {
      setLoading(false)
    }
  }

  const submitDailySummary = async () => {
    setSubmitting(true)

    try {
      // Prepare summary data
      const summaryData = {
        deliveryData,
        cashRecord,
        totalPicked: deliveryData.reduce((sum, item) => sum + item.pickedQuantity, 0),
        totalDelivered: deliveryData.reduce((sum, item) => sum + item.deliveredQuantity, 0),
        totalRemaining: deliveryData.reduce((sum, item) => sum + item.remainingQuantity, 0),
        date: new Date().toISOString().split('T')[0]
      }

      console.log('Submitting daily summary:', summaryData)

      // You can add API call here to submit final summary
      // await makeAuthenticatedRequest('/daily-summary/submit', {
      //   method: 'POST',
      //   body: JSON.stringify(summaryData)
      // })

      Toast.show({
        type: 'success',
        text1: 'Summary Submitted',
        text2: 'Daily summary completed successfully',
        visibilityTime: 3000,
      })

      // Navigate to home or login screen
      setTimeout(() => {
        router.replace('/')
      }, 2000)

    } catch (error) {
      console.error('Error submitting summary:', error)

      Toast.show({
        type: 'error',
        text1: 'Submission Failed',
        text2: 'Unable to submit daily summary',
        visibilityTime: 3000,
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Convert delivery data to ProductSummary format for display
  const pickedSummary: ProductSummary = Object.fromEntries(
    deliveryData.map(item => [item.productName, item.pickedQuantity])
  )

  const deliveredSummary: ProductSummary = Object.fromEntries(
    deliveryData.map(item => [item.productName, item.deliveredQuantity])
  )

  const remainingSummary: ProductSummary = Object.fromEntries(
    deliveryData.map(item => [item.productName, item.remainingQuantity])
  )

  // Loading screen
  if (loading) {
    return (
      <SafeAreaView style={styles.pageBackground}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#297BF6" />
          <Text style={styles.loadingText}>Loading daily summary...</Text>
        </View>
      </SafeAreaView>
    )
  }

  // Error screen
  if (error) {
    return (
      <SafeAreaView style={styles.pageBackground}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchAllData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.pageBackground}>
      <ScrollView contentContainerStyle={styles.wrapper}>
        <Text style={styles.heading}>📊 Daily Summary</Text>

        {/* Picked/Sent Section */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionLabel}>📦 Picked/Sent:</Text>
          {formatSummaryRows(pickedSummary)}
          <Text style={styles.totalText}>Total: {totalPackets(pickedSummary)} packets</Text>
        </View>

        {/* Delivered Section */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionLabel}>🚚 Delivered:</Text>
          {formatSummaryRows(deliveredSummary)}
          <Text style={styles.totalText}>Total: {totalPackets(deliveredSummary)} packets</Text>
        </View>

        {/* Remaining Section */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionLabel}>📋 Remaining:</Text>
          {formatSummaryRows(remainingSummary)}
          <Text style={styles.totalText}>Total: {totalPackets(remainingSummary)} packets</Text>
        </View>

        {/* ✅ UPDATED: Enhanced Cash Collection Section */}
        <View style={[styles.sectionBox, styles.paymentsBox]}>
          <View style={styles.cashHeader}>
            <Text style={styles.paymentsLabel}>💰 Cash Collection Summary</Text>
          </View>

          {cashRecord ? (
            <View style={styles.cashDetails}>
              <View style={styles.cashRow}>
                <Text style={styles.cashRowLabel}>Submitted Amount:</Text>
                <Text style={styles.cashRowValue}>₹{cashRecord.amount}</Text>
              </View>


              <View style={styles.cashDateRow}>
                <Text style={styles.cashDateText}>
                  Recorded on: {new Date(cashRecord.date).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.noCashContainer}>
              <Text style={styles.noCashText}>No cash record found for today</Text>
              <Text style={styles.noCashSubtext}>Cash amount will be recorded when submitted</Text>
            </View>
          )}
        </View>



        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            submitting && styles.submitBtnDisabled
          ]}
          onPress={submitDailySummary}
          disabled={submitting}
        >
          {submitting ? (
            <View style={styles.loadingButtonContainer}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.submitBtnText}>Submitting...</Text>
            </View>
          ) : (
            <Text style={styles.submitBtnText}>✅ Final Submit for Day</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  pageBackground: {
    flex: 1,
    backgroundColor: '#F5F6F9',
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#64748B",
    textAlign: "center",
  },

  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  errorText: {
    color: "#EF4444",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },

  retryButton: {
    backgroundColor: "#297BF6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },

  retryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },

  wrapper: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 18,
    minHeight: '100%',
  },

  heading: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1D223B',
    marginBottom: 20,
    textAlign: 'center',
  },

  sectionBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },

  sectionLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222831',
    marginBottom: 8,
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },

  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2B2F43',
    flex: 1,
  },

  productQty: {
    fontSize: 16,
    fontWeight: '600',
    color: '#297BF6',
  },

  noProducts: {
    fontSize: 15,
    fontStyle: 'italic',
    color: '#8B9BB7',
    marginVertical: 6,
    textAlign: 'center',
  },

  totalText: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#16A34A',
    textAlign: 'right',
  },

  // ✅ UPDATED: Enhanced cash section styles
  paymentsBox: {
    backgroundColor: '#F0FDF4',
    borderColor: '#16A34A',
    borderWidth: 1,
  },

  cashHeader: {
    marginBottom: 12,
  },

  paymentsLabel: {
    fontWeight: 'bold',
    fontSize: 18,
    color: '#119E49',
    textAlign: 'center',
  },

  cashDetails: {
    gap: 8,
  },

  cashRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },

  cashRowLabel: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },

  cashRowValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#16A34A',
  },

  discrepancyRow: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 4,
  },

  discrepancyLabel: {
    fontSize: 16,
    color: '#92400E',
    fontWeight: '600',
  },

  discrepancyValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400E',
  },

  discrepancyText: {
    color: '#D97706',
  },

  cashDateRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#D1FAE5',
  },

  cashDateText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },

  noCashContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },

  noCashText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 4,
  },

  noCashSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },

  // ✅ UPDATED: Enhanced statistics section
  statisticsBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 16,
    elevation: 2,
    borderColor: '#2563EB',
    borderWidth: 1,
  },

  statisticsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E40AF',
    marginBottom: 12,
    textAlign: 'center',
  },

  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  statLabel: {
    fontSize: 16,
    color: '#475569',
    fontWeight: '500',
  },

  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E40AF',
  },

  cashCollectedText: {
    color: '#16A34A',
  },

  cashPendingText: {
    color: '#F59E0B',
  },

  submitBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    elevation: 6,
    shadowColor: '#16A34A',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },

  submitBtnDisabled: {
    backgroundColor: '#F59E0B',
  },

  submitBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 0.15,
  },

  loadingButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
})
