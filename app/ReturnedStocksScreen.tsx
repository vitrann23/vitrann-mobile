"use client"

import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import Toast from 'react-native-toast-message'

// Types
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

type ProductItem = {
  inventoryId: number
  productName: string
  pickedQuantity: number
  remainingQuantity: number
  isEdited: boolean
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

export default function ReturnedStocksScreen() {
  const params = useLocalSearchParams()
  const router = useRouter()

  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([])
  const [products, setProducts] = useState<ProductItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch inventory data on component mount
  useEffect(() => {
    fetchInventoryData()
  }, [])

  const fetchInventoryData = async () => {
    try {
      setLoading(true)
      setError(null)

      const inventoryResponse = await makeAuthenticatedRequest('/daily-activity-ci/my-inventory')

      console.log('Inventory response:', inventoryResponse)

      if (inventoryResponse.success && inventoryResponse.data) {
        setInventoryData(inventoryResponse.data)
        
        // Transform inventory data to products with remaining quantities defaulting to 0
        const transformedProducts: ProductItem[] = inventoryResponse.data
          .filter((item: InventoryItem) => item.totalPickedQuantity && item.totalPickedQuantity > 0)
          .map((item: InventoryItem) => ({
            inventoryId: item.inventoryId,
            productName: item.inventory.product.productName,
            pickedQuantity: item.totalPickedQuantity || 0,
            remainingQuantity: 0, // ✅ Default to 0
            isEdited: false
          }))

        setProducts(transformedProducts)

        Toast.show({
          type: 'success',
          text1: 'Inventory Loaded',
          text2: `${transformedProducts.length} products loaded`,
          visibilityTime: 2000,
        })

      } else {
        throw new Error(inventoryResponse.message || 'Failed to fetch inventory data')
      }
    } catch (error: any) {
      console.error('Error fetching inventory:', error)
      const errorMessage = error.message || 'Failed to load inventory data'
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

  // Handle remaining quantity change
  const handleRemainingQuantityChange = (inventoryId: number, newQuantity: string) => {
    const numQuantity = parseInt(newQuantity) || 0
    const product = products.find(p => p.inventoryId === inventoryId)
    
    if (product && numQuantity > product.pickedQuantity) {
      Toast.show({
        type: 'error',
        text1: 'Invalid Quantity',
        text2: `Cannot exceed picked quantity of ${product.pickedQuantity}`,
        visibilityTime: 2000,
      })
      return
    }

    setProducts(prevProducts =>
      prevProducts.map(product =>
        product.inventoryId === inventoryId
          ? { 
              ...product, 
              remainingQuantity: numQuantity,
              isEdited: true
            }
          : product
      )
    )
  }

  // Calculate total remaining
  const totalRemaining = products.reduce((sum, product) => sum + product.remainingQuantity, 0)

  // Submit remaining quantities to API
  const handleSubmitRemaining = async () => {
    setSubmitting(true)

    try {
      // Send all products, not just edited ones, since 0 is a valid remaining quantity
      const remainingItems = products.map(product => ({
        inventoryId: product.inventoryId,
        remainingQuantity: product.remainingQuantity
      }))

      const response = await makeAuthenticatedRequest('/daily-activity-wi/remaining-quantities', {
        method: 'PUT',
        body: JSON.stringify({
          remainingItems
        })
      })

      if (response.success) {
        Toast.show({
          type: 'success',
          text1: 'Quantities Updated',
          text2: `${remainingItems.length} products updated successfully`,
          visibilityTime: 2000,
        })

        // Navigate to summary after successful submission
        setTimeout(() => {
          handleNavigateToSummary()
        }, 1200)

      } else {
        throw new Error(response.message || 'Failed to update quantities')
      }

    } catch (error) {
      console.error('Error updating remaining quantities:', error)
      
      Toast.show({
        type: 'error',
        text1: 'Update Failed',
        text2: 'Unable to update remaining quantities',
        visibilityTime: 3000,
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Navigate to summary screen
  const handleNavigateToSummary = () => {
    const remainingData = Object.fromEntries(
      products.map(product => [product.productName, product.remainingQuantity.toString()])
    )

    router.push({
      pathname: "/DailySummaryScreen",
      params: {
        ...params,
        remaining: JSON.stringify(remainingData),
        totalRemaining: totalRemaining.toString()
      },
    })
  }

  // Render product item with responsive layout
  const renderProductItem = ({ item }: { item: ProductItem }) => (
    <View style={styles.productBox}>
      {/* ✅ RESPONSIVE: Product info section takes most of the space */}
      <View style={styles.productInfo}>
        <Text style={styles.productLabel} numberOfLines={2}>{item.productName}</Text>
        <Text style={styles.pickedText}>Picked: {item.pickedQuantity}</Text>
      </View>
      
      {/* ✅ RESPONSIVE: Input section with fixed, smaller width */}
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>Remaining:</Text>
        <TextInput
          style={[
            styles.input,
            item.isEdited && styles.inputEdited
          ]}
          value={item.remainingQuantity.toString()}
          placeholder="0" // ✅ Always show "0" as placeholder
          placeholderTextColor="#9CA3AF"
          onChangeText={(text) => handleRemainingQuantityChange(item.inventoryId, text)}
          keyboardType="numeric"
          maxLength={2}
          editable={!submitting}
        />
      </View>
    </View>
  )

  // Loading screen
  if (loading) {
    return (
      <SafeAreaView style={styles.wrapper}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#297BF6" />
          <Text style={styles.loadingText}>Loading inventory...</Text>
        </View>
      </SafeAreaView>
    )
  }

  // Error screen
  if (error) {
    return (
      <SafeAreaView style={styles.wrapper}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchInventoryData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.wrapper}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Success message */}
        <View style={styles.cheerBox}>
          <Text style={styles.cheerIcon}>🎉</Text>
          <Text style={styles.cheerText}>Deliveries completed! Great job 👍</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Remaining Stock</Text>
          <Text style={styles.subheading}>Enter quantities left after deliveries (default is 0)</Text>
          
          <View style={styles.divider} />

          <FlatList
            data={products}
            keyExtractor={(item) => item.inventoryId.toString()}
            renderItem={renderProductItem}
            ListEmptyComponent={
              <Text style={styles.empty}>No products found.</Text>
            }
            contentContainerStyle={{ paddingTop: 12 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />

          <View style={styles.totalContainer}>
            <Text style={styles.totalText}>
              Total: {totalRemaining} packet{totalRemaining !== 1 ? "s" : ""} remaining
            </Text>
          </View>

          <TouchableOpacity 
            style={[
              styles.submitButton, 
              submitting && styles.submitButtonDisabled
            ]} 
            onPress={handleSubmitRemaining}
            disabled={submitting}
          >
            {submitting ? (
              <View style={styles.loadingButtonContainer}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.submitButtonText}>Updating...</Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText}>📊 Complete & Go to Summary</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#F5F6F9",
    paddingTop: 60,
    paddingHorizontal: 20,
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

  cheerBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBE8",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    marginBottom: 20,
    alignSelf: "center",
    shadowColor: "#FFD700",
    shadowOpacity: 0.09,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  cheerIcon: {
    fontSize: 24,
    marginRight: 8,
  },

  cheerText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#BA7E25",
  },

  card: {
    minWidth: 320,
    width: 360,
    backgroundColor: "#F9FAFB",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 36,
    alignItems: "stretch",
    alignSelf: "center",
    flex: 1,
    maxHeight: "80%",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
  },

  heading: {
    fontSize: 24,
    fontWeight: "800",
    color: "#232B3A",
    paddingLeft: 6,
    textAlign: "center",
  },

  subheading: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 6,
  },

  divider: {
    height: 1,
    backgroundColor: "#E4E7EB",
    marginVertical: 16,
  },

  // ✅ FIXED: Responsive product box layout
  productBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#E6E8EF",
    marginBottom: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    shadowColor: "#90A4AE",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    // ✅ Ensure proper space distribution
    minHeight: 70,
  },

  // ✅ RESPONSIVE: Product info takes 70% of available space
  productInfo: {
    flex: 7, // Takes 70% of the row
    marginRight: 12, // Space between sections
  },

  productLabel: {
    fontSize: 16, // ✅ Slightly smaller to prevent wrapping
    color: "#1C2833",
    fontWeight: "600",
    marginBottom: 4,
    lineHeight: 20, // ✅ Better line spacing
  },

  pickedText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
  },

  // ✅ RESPONSIVE: Input section takes 30% with fixed width
  inputSection: {
    flex: 3, // Takes 30% of the row
    alignItems: "center",
    minWidth: 80, // ✅ Minimum width to prevent compression
    maxWidth: 90, // ✅ Maximum width to prevent expansion
  },

  inputLabel: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 6,
    fontWeight: "500",
    textAlign: "center",
  },

  // ✅ FIXED: Compact input with proper sizing
  input: {
    width: 50, // ✅ Fixed smaller width
    height: 40, // ✅ Proper height
    backgroundColor: "#fff",
    borderRadius: 8, // ✅ Smaller border radius
    borderWidth: 2,
    borderColor: "#D1D5DB",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#1C2833",
    paddingHorizontal: 4, // ✅ Minimal padding
  },

  inputEdited: {
    borderColor: "#10B981",
    backgroundColor: "#ECFDF5",
  },

  totalContainer: {
    marginTop: 10,
    marginBottom: 18,
    paddingHorizontal: 8,
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingVertical: 12,
    borderRadius: 8,
  },

  totalText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E40AF",
  },

  empty: {
    color: "#8B9BB7",
    textAlign: "center",
    marginVertical: 28,
    fontSize: 16,
  },

  submitButton: {
    backgroundColor: "#297BF6",
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: "center",
    alignSelf: "center",
    elevation: 8,
    shadowColor: "#4D90FE",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
  },

  submitButtonDisabled: {
    backgroundColor: "#F59E0B",
  },

  submitButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  loadingButtonContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
})
