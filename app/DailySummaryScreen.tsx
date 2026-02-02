"use client"

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
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
import apiClient from '../services/apiClient'

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

type StockDetail = {
  productName: string
  totalStock: number
  deliveredStock: number
  variance: number
}

type SummaryData = {
  totalProducts: number
  totalPickedQuantity: number
  totalRemainingQuantity: number
  completedProducts: number
  pendingProducts: number
  totalValue: number
  paymentFromCustomer: number
  stockDetails: StockDetail[]
}



// Helper functions removed as they are no longer used by the Table UI

export default function DailySummaryScreen() {
  const params = useLocalSearchParams()
  const router = useRouter()

  // State management
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([])
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)
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

      // Fetch both summary and cash data simultaneously
      const [summaryResponse, cashResponse] = await Promise.all([
        apiClient.get('/daily-activity-ci/my-inventory-summary'),
        apiClient.get('/deliveries/total-amount')
      ]) as any[]

      // Process summary data
      if (summaryResponse.success && summaryResponse.data) {
        setSummaryData(summaryResponse.data)
      }

      // Process cash record
      if (cashResponse.success && cashResponse.data) {
        setCashRecord(cashResponse.data)
      } else {
        setCashRecord(null)
      }

      Toast.show({
        type: 'success',
        text1: 'Data Loaded',
        text2: 'Summary data loaded successfully',
        visibilityTime: 2000,
      })

    } catch (error) {
      console.error('Error fetching summary data:', error)
      setError('Failed to load summary data')

      Toast.show({
        type: 'error',
        text1: 'Loading Failed',
        text2: 'Unable to load summary data',
        visibilityTime: 3000,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await SecureStore.deleteItemAsync('authToken');
      await AsyncStorage.multiRemove(['workerId', 'workerName', 'userType']);
      router.replace('/');
      Toast.show({
        type: 'success',
        text1: 'Logged Out',
        text2: 'Session cleared successfully',
      });
    } catch (e) {
      console.error('Logout failed', e);
      Toast.show({
        type: 'error',
        text1: 'Logout Failed',
        text2: 'Please try again',
      });
    }
  };

  const submitDailySummary = async () => {
    setSubmitting(true)

    try {
      // Logic: Tell backend to save the calculated variances
      const response = await apiClient.post('/daily-activity-ci/submit-summary', {}) as any

      if (response.success) {
        Toast.show({
          type: 'success',
          text1: 'Summary Submitted',
          text2: 'Stock remaining quantities saved successfully',
          visibilityTime: 3000,
        })

        // Navigate to home or login screen
        setTimeout(() => {
          router.replace('/')
        }, 2000)
      } else {
        throw new Error(response.message || 'Failed to submit summary')
      }

    } catch (error: any) {
      console.error('Error submitting summary:', error)

      Toast.show({
        type: 'error',
        text1: 'Submission Failed',
        text2: error.message || 'Unable to submit daily summary',
        visibilityTime: 3000,
      })
    } finally {
      setSubmitting(false)
    }
  }

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

        {/* Stock Details Table - 4 Columns */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Stock Details</Text>
          </View>
          <View style={styles.table}>
            <View style={[styles.tableHeader, styles.stockTableHeader]}>
              <Text style={[styles.columnHeader, { flex: 2 }]}>Product</Text>
              <Text style={[styles.columnHeader, { flex: 1, textAlign: 'center' }]}>Total</Text>
              <Text style={[styles.columnHeader, { flex: 1, textAlign: 'center' }]}>Deliv.</Text>
              <Text style={[styles.columnHeader, { flex: 1, textAlign: 'right' }]}>Var.</Text>
            </View>
            {summaryData?.stockDetails.map((item, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.cell, { flex: 2 }]}>{item.productName}</Text>
                <Text style={[styles.cell, { flex: 1, textAlign: 'center' }]}>{item.totalStock}</Text>
                <Text style={[styles.cell, { flex: 1, textAlign: 'center' }]}>{item.deliveredStock}</Text>
                <Text style={[styles.cell, { flex: 1, textAlign: 'right', fontWeight: '700', color: item.variance !== 0 ? '#EF4444' : '#16A34A' }]}>
                  {item.variance}
                </Text>
              </View>
            ))}
            {(!summaryData || summaryData.stockDetails.length === 0) && (
              <Text style={styles.noProducts}>No stock data available</Text>
            )}
          </View>
        </View>

        {/* Payment Details Table - 3 Columns */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Payment Details</Text>
          </View>
          <View style={styles.table}>
            <View style={[styles.tableHeader, styles.paymentTableHeader]}>
              <Text style={[styles.columnHeader, { flex: 2 }]}>Detail</Text>
              <Text style={[styles.columnHeader, { flex: 1.5, textAlign: 'right' }]}>Amount (₹)</Text>
              <Text style={[styles.columnHeader, { flex: 1, textAlign: 'right' }]}>Var.</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={[styles.cell, { flex: 2 }]}>From Customer</Text>
              <Text style={[styles.cell, { flex: 1.5, textAlign: 'right' }]}>
                {summaryData?.paymentFromCustomer.toLocaleString('en-IN') || '0'}
              </Text>
              <Text style={[styles.cell, { flex: 1, textAlign: 'right', color: '#94A3B8' }]}>-</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={[styles.cell, { flex: 2 }]}>In Hand (Submitted)</Text>
              <Text style={[styles.cell, { flex: 1.5, textAlign: 'right' }]}>
                {cashRecord?.amount.toLocaleString('en-IN') || '0'}
              </Text>
              <Text style={[styles.cell, { flex: 1, textAlign: 'right', color: '#94A3B8' }]}>-</Text>
            </View>

            <View style={[styles.tableRow, { backgroundColor: '#F8FAFC', borderTopWidth: 2, borderTopColor: '#E2E8F0' }]}>
              <Text style={[styles.cell, { flex: 2, fontWeight: '800', color: '#1E293B' }]}>Net Variance</Text>
              <Text style={[styles.cell, { flex: 1.5, textAlign: 'right', color: '#94A3B8' }]}>-</Text>
              <Text style={[styles.cell, { flex: 1, textAlign: 'right', fontWeight: '900', color: (summaryData?.paymentFromCustomer || 0) - (cashRecord?.amount || 0) !== 0 ? '#EF4444' : '#16A34A' }]}>
                {(summaryData?.paymentFromCustomer || 0) - (cashRecord?.amount || 0)}
              </Text>
            </View>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: '#297BF6', marginBottom: 12 }]}
          onPress={() => {
            Toast.show({
              type: 'info',
              text1: 'Preview Mode',
              text2: 'This screen is your final preview before submission.',
              visibilityTime: 3000,
            })
          }}
        >
          <Text style={styles.submitBtnText}>🔍 Preview Summary</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.submitBtn,
            submitting && styles.submitBtnDisabled
          ]}
          onPress={submitDailySummary}
          disabled={submitting}
        >
          {submitting ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.submitBtnText}>Submitting...</Text>
            </View>
          ) : (
            <Text style={styles.submitBtnText}>✅ Final Submit for Day</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
        >
          <Text style={styles.logoutBtnText}>🚪 Logout / Switch Worker</Text>
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

  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: -0.5,
  },
  table: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  stockTableHeader: {
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  paymentTableHeader: {
    backgroundColor: '#F0F9FF',
    borderBottomWidth: 1,
    borderBottomColor: '#BAE6FD',
  },
  columnHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
  },
  cell: {
    fontSize: 15,
    color: '#334155',
    fontWeight: '500',
  },
  totalBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  noProducts: {
    padding: 24,
    textAlign: 'center',
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  submitBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 12,
    elevation: 8,
    shadowColor: '#16A34A',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  logoutBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  logoutBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 15,
    textDecorationLine: 'underline',
  }
})
