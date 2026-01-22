"use client"

import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
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
import { SafeAreaView } from "react-native-safe-area-context"
import Toast from 'react-native-toast-message'

type Customer = {
  id: number
  name: string
  address: string
  customerId: number
}

type Product = {
  productId: number
  productName: string
  imageUrl: string | null
  price: number
  available: number
}

type DeliveredItem = {
  productId: number
  productName: string
  qty: number
  price: number
  pricePerPacket: number
}

const API_BASE_URL = 'http://192.168.1.7:3000/api'

export default function CustomerDeliveryScreen() {
  const router = useRouter()
  const params = useLocalSearchParams()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerIdx, setSelectedCustomerIdx] = useState(0)
  const [products, setProducts] = useState<Product[]>([])
  const [deliveredItems, setDeliveredItems] = useState<DeliveredItem[]>([])
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [manualTotal, setManualTotal] = useState<string>('')
  const [isTotalManuallyEdited, setIsTotalManuallyEdited] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showOtherProducts, setShowOtherProducts] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const token = await AsyncStorage.getItem('authToken')

      const [customersRes, inventoryRes] = await Promise.all([
        fetch(`${API_BASE_URL}/daily-activity-ci/my-customers`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }),
        fetch(`${API_BASE_URL}/daily-activity-ci/my-inventory`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }),
      ])

      const customersData = await customersRes.json()
      const inventoryData = await inventoryRes.json()

      if (customersData.success) {
        const transformedCustomers = customersData.data.map((item: any) => ({
          id: item.customer.customerId,
          name: `${item.customer.firstName} ${item.customer.lastName || ''}`.trim(),
          address: `${item.customer.address1}, ${item.customer.city || ''}`.trim(),
          customerId: item.customer.customerId,
        }))
        setCustomers(transformedCustomers)
      }

      if (inventoryData.success) {
        const transformedProducts = inventoryData.data.map((item: any) => ({
          productId: item.inventory.product.productId,
          productName: item.inventory.product.productName,
          imageUrl: item.inventory.product.imageUrl,
          price: item.inventory.product.currentProductPrice,
          available: item.totalPickedQuantity || 0,
        }))
        setProducts(transformedProducts)
      }

      setLoading(false)
    } catch (error) {
      console.error('Error fetching data:', error)
      setLoading(false)
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to load data',
      })
    }
  }

  const handleQuantityChange = (productId: number, value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '')
    setQuantities(prev => ({ ...prev, [productId]: cleaned }))
    
    // Reset manual total if user changes quantities
    if (!isTotalManuallyEdited) {
      setManualTotal('')
    }
  }

  const handleTotalChange = (value: string) => {
    let cleaned = value.replace(/[^0-9.]/g, '')
    
    // Prevent leading zeros (except for "0" or "0.")
    if (cleaned.length > 1 && cleaned.startsWith('0') && !cleaned.startsWith('0.')) {
      cleaned = cleaned.replace(/^0+/, '')
    }
    
    // Ensure only one decimal point
    const parts = cleaned.split('.')
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('')
    }
    
    setManualTotal(cleaned)
    setIsTotalManuallyEdited(true)
  }

  const calculateTotal = () => {
    if (isTotalManuallyEdited && manualTotal) {
      return parseFloat(manualTotal) || 0
    }
    
    let total = 0
    products.forEach(product => {
      const qty = parseInt(quantities[product.productId] || '0')
      if (qty > 0) {
        total += product.price * qty
      }
    })
    return total
  }

  const handleCollect = () => {
    // Add current quantities to delivered items
    const newItems: DeliveredItem[] = []
    
    products.forEach(product => {
      const qty = parseInt(quantities[product.productId] || '0')
      if (qty > 0 && qty <= product.available) {
        newItems.push({
          productId: product.productId,
          productName: product.productName,
          qty,
          price: product.price * qty,
          pricePerPacket: product.price,
        })
      }
    })

    if (newItems.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'No Items',
        text2: 'Please enter quantities',
      })
      return
    }

    setDeliveredItems(prev => [...prev, ...newItems])
    setQuantities({})
    
    Toast.show({
      type: 'success',
      text1: 'Items Added',
      text2: `${newItems.length} items added to delivery`,
    })
  }

  const handleConfirm = () => {
    if (deliveredItems.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'No Items',
        text2: 'Please add items to delivery',
      })
      return
    }

    const isLastCustomer = selectedCustomerIdx === customers.length - 1

    if (isLastCustomer) {
      // Navigate to cash details
      router.push({
        pathname: "/CashDetailsScreen",
        params: {
          totalAmount: calculateTotal().toString(),
        },
      })
    } else {
      // Move to next customer
      setSelectedCustomerIdx(prev => prev + 1)
      setDeliveredItems([])
      setQuantities({})
      setManualTotal('')
      setIsTotalManuallyEdited(false)
      setManualTotal('')
      setIsTotalManuallyEdited(false)
      
      Toast.show({
        type: 'success',
        text1: 'Delivery Confirmed',
        text2: 'Moving to next customer',
      })
    }
  }

  const handleSkip = () => {
    const isLastCustomer = selectedCustomerIdx === customers.length - 1

    if (isLastCustomer) {
      router.push({
        pathname: "/CashDetailsScreen",
        params: {
          totalAmount: '0',
        },
      })
    } else {
      setSelectedCustomerIdx(prev => prev + 1)
      setDeliveredItems([])
      setQuantities({})
      setManualTotal('')
      setIsTotalManuallyEdited(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    )
  }

  if (customers.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text>No customers found</Text>
        </View>
      </SafeAreaView>
    )
  }

  const currentCustomer = customers[selectedCustomerIdx]

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header with customer tabs */}
        <View style={styles.header}>
          <View style={styles.tabsRow}>
            {customers.map((customer, idx) => (
              <TouchableOpacity
                key={customer.id}
                style={[
                  styles.tabButton,
                  idx === selectedCustomerIdx ? styles.tabButtonActive : styles.tabButtonInactive,
                ]}
                onPress={() => setSelectedCustomerIdx(idx)}
              >
                <Text style={[
                  styles.tabButtonText,
                  idx === selectedCustomerIdx && styles.tabButtonTextActive
                ]}>
                  {String.fromCharCode(65 + idx)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.menuButton}>
            <Ionicons name="menu" size={28} color="#2563EB" />
          </TouchableOpacity>
        </View>

        {/* Skip Button */}
        <View style={styles.skipContainer}>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* Customer Name Card */}
          <View style={styles.customerCard}>
            <Text style={styles.customerName}>{currentCustomer.name}</Text>
          </View>

          {/* Products List */}
          <View style={styles.productsContainer}>
            {products.map((product) => (
              <View key={product.productId} style={styles.productCard}>
                <View style={styles.productImageContainer}>
                  {product.imageUrl ? (
                    <Image
                      source={{ uri: product.imageUrl }}
                      style={styles.productImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.productImagePlaceholder}>
                      <Ionicons name="cube-outline" size={40} color="#cbd5e1" />
                    </View>
                  )}
                </View>

                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{product.productName}</Text>
                  <Text style={styles.productAvailable}>
                    Available: {product.available}
                  </Text>
                  <Text style={styles.productPrice}>₹ {product.price}/packet</Text>
                </View>

                <TextInput
                  style={styles.quantityInput}
                  value={quantities[product.productId] || ''}
                  onChangeText={(text) => handleQuantityChange(product.productId, text)}
                  placeholder="0"
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                  maxLength={3}
                />
              </View>
            ))}
          </View>

          {/* Other Product Button */}
          <TouchableOpacity
            style={styles.otherProductButton}
            onPress={() => setShowOtherProducts(true)}
          >
            <Text style={styles.otherProductButtonText}>Other Product</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.totalRow}>
            <View style={styles.totalBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: '#1e293b', marginRight: 4 }}>₹</Text>
                <TextInput
                  style={[styles.totalAmount, { minWidth: 80, textAlign: 'center' }]}
                  value={isTotalManuallyEdited ? (manualTotal || '0') : calculateTotal().toFixed(2)}
                  onChangeText={handleTotalChange}
                  placeholder="0.00"
                  placeholderTextColor="#999"
                  keyboardType="decimal-pad"
                  editable={true}
                  selectTextOnFocus={true}
                />
              </View>
            </View>
            <TouchableOpacity style={styles.collectButton} onPress={handleCollect}>
              <Text style={styles.collectButtonText}>Collect</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
            <Text style={styles.confirmButtonText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tabButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#2563EB',
  },
  tabButtonInactive: {
    backgroundColor: '#cbd5e1',
  },
  tabButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  tabButtonTextActive: {
    color: '#fff',
  },
  menuButton: {
    padding: 8,
  },
  skipContainer: {
    padding: 16,
  },
  skipButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#ef4444',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 6,
  },
  skipButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  customerCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  customerName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2563EB',
    textAlign: 'center',
  },
  productsContainer: {
    marginBottom: 16,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2563EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  productImageContainer: {
    width: 60,
    height: 60,
    marginRight: 12,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  productAvailable: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '600',
    marginBottom: 2,
  },
  productPrice: {
    fontSize: 13,
    color: '#64748b',
  },
  quantityInput: {
    width: 80,
    height: 44,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    backgroundColor: '#f8fafc',
    color: '#1e293b',
  },
  otherProductButton: {
    backgroundColor: '#2563EB',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 80,
  },
  otherProductButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  footer: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  totalRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  totalBox: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#10b981',
    borderRadius: 12,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
  },
  collectButton: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingHorizontal: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  collectButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  confirmButton: {
    backgroundColor: '#2563EB',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
})
