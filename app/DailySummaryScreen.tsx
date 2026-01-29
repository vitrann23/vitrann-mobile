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
        <View style={styles.headerContainer}>
          <Text style={styles.heading}>Summary</Text>
          <TouchableOpacity style={styles.previewButton}>
            <Text style={styles.previewButtonText}>Preview</Text>
          </TouchableOpacity>
        </View>

        {/* Stock Details Section */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Stock Details</Text>
            <View style={styles.checkmarkBadge}>
              <Text style={styles.checkmarkText}>✓</Text>
            </View>
          </View>

          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.productColumn]}>Product</Text>
              <Text style={[styles.tableHeaderText, styles.stockColumn]}>Morning Stock/{'\n'}Delivered Stock</Text>
              <Text style={[styles.tableHeaderText, styles.varianceColumn]}>Variance</Text>
            </View>

            {deliveryData.map((item, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.productColumn]}>{item.productName}</Text>
                <Text style={[styles.tableCell, styles.stockColumn]}>{item.pickedQuantity}/{item.deliveredQuantity}</Text>
                <Text style={[styles.tableCell, styles.varianceColumn]}>{item.remainingQuantity}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Payment Details Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Payment Details</Text>

          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.paymentFormColumn]}>Payment{'\n'}From{'\n'}Customer</Text>
              <Text style={[styles.tableHeaderText, styles.paymentInHandColumn]}>Payment in{'\n'}Hand</Text>
              <Text style={[styles.tableHeaderText, styles.paymentVarianceColumn]}>Variance</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.paymentFormColumn]}>
                {params.totalPayments ? params.totalPayments : '0'}
              </Text>
              <Text style={[styles.tableCell, styles.paymentInHandColumn]}>
                {cashRecord ? cashRecord.amount : '0'}
              </Text>
              <View style={[styles.tableCell, styles.paymentVarianceColumn, styles.varianceCheckContainer]}>
                {(() => {
                  const expectedPayment = params.totalPayments ? Number(params.totalPayments) : 0
                  const actualPayment = cashRecord ? cashRecord.amount : 0
                  const variance = expectedPayment - actualPayment
                  
                  if (variance === 0) {
                    return (
                      <View style={styles.varianceCheckBadge}>
                        <Text style={styles.varianceCheckText}>✓</Text>
                      </View>
                    )
                  } else {
                    return (
                      <Text style={[styles.tableCell, variance > 0 ? styles.variancePositive : styles.varianceNegative]}>
                        {variance > 0 ? '+' : ''}{variance}
                      </Text>
                    )
                  }
                })()}
              </View>
            </View>
          </View>
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
            <Text style={styles.submitBtnText}>Submit Summary</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  pageBackground: {
    flex: 1,
    backgroundColor: '#F5F7FA',
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
    padding: 20,
  },

  headerContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },

  heading: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2563EB',
    marginBottom: 16,
  },

  previewButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 8,
  },

  previewButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  sectionContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2563EB',
  },

  checkmarkBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },

  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },

  tableContainer: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    overflow: 'hidden',
  },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  tableHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },

  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    alignItems: 'center',
  },

  tableCell: {
    fontSize: 14,
    color: '#1F2937',
    textAlign: 'center',
  },

  productColumn: {
    flex: 2,
    textAlign: 'left',
  },

  stockColumn: {
    flex: 2,
  },

  varianceColumn: {
    flex: 1,
  },

  paymentFormColumn: {
    flex: 1.5,
  },

  paymentInHandColumn: {
    flex: 1.5,
  },

  paymentVarianceColumn: {
    flex: 1,
  },

  varianceCheckContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  varianceCheckBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },

  varianceCheckText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },

  variancePositive: {
    color: '#EF4444',
    fontWeight: 'bold',
  },

  varianceNegative: {
    color: '#F59E0B',
    fontWeight: 'bold',
  },

  submitBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#16A34A',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  submitBtnDisabled: {
    backgroundColor: '#F59E0B',
  },

  submitBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },

  loadingButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
})
