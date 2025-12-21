"use client"

import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'


interface Product {
  productId: number
  productName: string
  currentProductPrice: string
  lastProductPrice: string
  imageUrl: string
  description: string
  storeId: string
  inventory: {
    inventoryId: number
    date: string
  }
}

const MorningStockScreen = () => {
  const params = useLocalSearchParams()
  const router = useRouter()
  const workerId = params.workerId as string

  const API_BASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL ?? 'https://theinfranova.com/api';

  const [products, setProducts] = useState<Product[]>([])
  const [quantities, setQuantities] = useState<{ [key: number]: string }>({})
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [workerName, setWorkerName] = useState('')
  const [focusedInput, setFocusedInput] = useState<number | null>(null)

  // Get current date formatted
  const currentDate = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric'
  });

  const fetchData = useCallback(async (isRefresh = false) => {
    console.log('Fetching products for workerId:', workerId)
    if (!isRefresh) setLoading(true)
    else setRefreshing(true)

    try {
      const name = await AsyncStorage.getItem('workerName')
      setWorkerName(name || `Worker ${workerId}`)
      const token = await AsyncStorage.getItem('authToken')
      const response = await fetch(`${API_BASE_URL}/products/products-with-latest-inventory`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      })
      const result = await response.json()
      if (result.success && Array.isArray(result.data)) {
        const validProducts = result.data.filter((p: Product) => p && p.inventory && p.inventory.inventoryId)
        setProducts(validProducts)

        if (!isRefresh) {
          const initial: { [key: number]: string } = {}
          validProducts.forEach((p: Product) => {
            initial[p.inventory.inventoryId] = ''
          })
          setQuantities(initial)
        }
      } else {
        Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load products' })
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Network error' })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [workerId, API_BASE_URL])

  useEffect(() => {
    fetchData(false)
  }, [fetchData])

  const handleInputChange = (inventoryId: number, text: string) => {
    let cleaned = text.replace(/[^0-9]/g, '').slice(0, 3)
    setQuantities(prev => ({ ...prev, [inventoryId]: cleaned }))
  }

  const handleSubmit = async () => {
    const currentTotal = Object.values(quantities)
      .map(q => parseInt(q) || 0)
      .reduce((acc, val) => acc + val, 0)

    if (currentTotal === 0) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Please enter quantity.' })
      return
    }
    setSubmitting(true)
    try {
      const token = await AsyncStorage.getItem('authToken')
      const pickItems = Object.entries(quantities)
        .filter(([_, qty]) => (parseInt(qty) || 0) > 0)
        .map(([inventoryId, qty]) => ({
          inventoryId: parseInt(inventoryId),
          totalPickedQuantity: parseInt(qty)
        }))

      const response = await fetch(`${API_BASE_URL}/daily-activity-wi/pick-quantities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({ workerId: parseInt(workerId), pickItems })
      })

      const result = await response.json()
      if (result.success) {
        Toast.show({ type: 'success', text1: 'Success', text2: 'Stock submitted!' })
        setTimeout(() => {
          router.push({ pathname: '/CustomerDeliveryScreen', params: { workerId, workerName } })
        }, 1200)
      } else {
        Toast.show({ type: 'error', text1: 'Error', text2: result.message || 'Failed' })
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Network error' })
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3880FF" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >

        {/* Header */}
        <View style={styles.headerContainer}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.workerNameText}>{workerName}</Text>
            <Text style={styles.headerTitleText}>Morning Stock</Text>
            <Text style={styles.dateText}>{currentDate}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor="#3880FF" />
          }
        >
          {products.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No products available</Text>
            </View>
          ) : (
            products.map((product) => (
              <View key={product.inventory.inventoryId} style={styles.card}>
                <View style={styles.imageWrapper}>
                  {product.imageUrl ? (
                    <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="contain" />
                  ) : (
                    <View style={[styles.productImage, styles.placeholderImage]}>
                      <Ionicons name="image-outline" size={24} color="#ccc" />
                    </View>
                  )}
                </View>

                <View style={styles.textWrapper}>
                  <Text style={styles.productName}>{product.productName}</Text>
                </View>

                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[
                      styles.input,
                      (focusedInput === product.inventory.inventoryId || (parseInt(quantities[product.inventory.inventoryId] || '0') > 0)) && styles.inputActive
                    ]}
                    placeholder="0"
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                    maxLength={3}
                    value={quantities[product.inventory.inventoryId] ?? ''}
                    onFocus={() => setFocusedInput(product.inventory.inventoryId)}
                    onBlur={() => setFocusedInput(null)}
                    onChangeText={(text) => handleInputChange(product.inventory.inventoryId, text)}
                    editable={!submitting}
                  />
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Start Delivery</Text>}
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F7'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F7F7'
  },

  // Header Styles
  headerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
    zIndex: 10,
  },
  headerTextContainer: {
    alignItems: 'center',
  },
  workerNameText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3880FF',
    marginBottom: 4,
  },
  headerTitleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 2,
  },
  dateText: {
    fontSize: 12,
    color: '#999',
  },

  // List Styles
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    height: 80,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
    borderWidth: 0.5,
    borderColor: '#E0E0E0',
  },

  imageWrapper: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  productImage: {
    width: 50,
    height: 50,
  },
  placeholderImage: {
    backgroundColor: '#F5F5F5',
    borderRadius: 4,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },

  textWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },

  inputWrapper: {
    justifyContent: 'center',
  },
  input: {
    width: 90,
    height: 42,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    backgroundColor: '#FFFFFF',
  },
  inputActive: {
    borderColor: '#3880FF',
    backgroundColor: '#F5F9FF',
    borderWidth: 1.5,
  },
  footer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  button: {
    backgroundColor: '#3880FF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#94A3B8',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700'
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
  }
})

export default MorningStockScreen