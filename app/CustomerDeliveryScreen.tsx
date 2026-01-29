"use client"

import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import Toast from 'react-native-toast-message'
import { ProductDeliveryModal } from "./CDS/ProductDeliveryModal"

type DeliveredItem = {
  name: string;
  qty: number;
  productId: number;
  price: number;
  originalPrice: number;
  isEdited: boolean;
}

type Customer = {
  id: number
  workerId: number
  customerId: number
  fromDate: string
  sequenceNumber: number
  thruDate: string | null
  customer: {
    customerId: number
    firstName: string
    lastName: string | null
    address1: string
    address2: string | null
    phoneNumber: string | null
    city: string | null
    pincode: string | null
    classification: string
  }
}

type WorkerInventory = {
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

type CustomerForDelivery = {
  id: string
  name: string
  type: string
  address: string
  deliveredItems: DeliveredItem[]
  paymentReceived: number
  customerId: number
  deliveryConfirmed: boolean
  sequenceNumber: number
  associatedProductIds?: number[]
}

type CustomerProductRelation = {
  id: number
  customerId: number
  productId: number | null
  quantityAssociated: number
  fromDate: string
  thruDate: string | null
  product: {
    productId: number
    productName: string
    currentProductPrice: number
    storeId: string
    imageUrl: string | null
  } | null
}

const API_BASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL ?? 'https://theinfranova.com/api';

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

const processDeliveryRequest = async (deliveryData: any) => {
  console.log(API_BASE_URL)
  try {
    const response = await makeAuthenticatedRequest('/deliveries/process', {
      method: 'POST',
      body: JSON.stringify(deliveryData),
    })
    return response
  } catch (error) {
    console.error('Delivery processing failed:', error)
    throw error
  }
}

export default function CustomerDeliveryScreen() {
  const params = useLocalSearchParams() as Record<string, string>
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const tabScrollViewRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<Record<number, { x: number, width: number }>>({});
  const { width: screenWidth } = Dimensions.get('window');

  const [customers, setCustomers] = useState<CustomerForDelivery[]>([])
  const [workerInventory, setWorkerInventory] = useState<WorkerInventory[]>([])
  const [customerProductRelations, setCustomerProductRelations] = useState<CustomerProductRelation[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [productDeliveryModal, setProductDeliveryModal] = useState(false)
  const [processingDelivery, setProcessingDelivery] = useState(false)
  const [associatedProductQuantities, setAssociatedProductQuantities] = useState<Record<string, string>>({})
  const [manualPaymentAmounts, setManualPaymentAmounts] = useState<Record<string, string>>({})

  // Save customers data to AsyncStorage whenever it changes
  useEffect(() => {
    if (customers.length > 0) {
      const saveData = async () => {
        try {
          const today = new Date().toISOString().split('T')[0]
          await AsyncStorage.setItem(`delivery-data-${today}`, JSON.stringify({
            customers,
            selectedIdx,
            associatedProductQuantities,
            manualPaymentAmounts,
            timestamp: Date.now()
          }))
        } catch (error) {
          console.error('Failed to save delivery data:', error)
        }
      }
      saveData()
    }
  }, [customers, associatedProductQuantities, manualPaymentAmounts])

  useEffect(() => {
    fetchDataFromAPI()
  }, [])

  useEffect(() => {
    if (customers.length === 0 || !tabScrollViewRef.current) {
      return;
    }

    const layout = tabLayouts.current[selectedIdx];
    if (!layout) {
      return;
    }

    const scrollToX = layout.x + (layout.width / 2) - (screenWidth / 2);
    const clampedScrollToX = Math.max(0, scrollToX);

    tabScrollViewRef.current.scrollTo({ x: clampedScrollToX, animated: true });

  }, [selectedIdx, customers, screenWidth]);

  const fetchDataFromAPI = async () => {
    try {
      setLoading(true)
      setError(null)

      if (!API_BASE_URL) {
        setError('API configuration missing.')
        return
      }

      const customersResponse = await makeAuthenticatedRequest('/daily-activity-ci/my-customers')
      const inventoryResponse = await makeAuthenticatedRequest('/daily-activity-ci/my-inventory')
      const relationsResponse = await makeAuthenticatedRequest('/relations/customer-products')

      if (customersResponse.success && inventoryResponse.success && relationsResponse.success) {
        const sortedCustomers = customersResponse.data.sort((a: Customer, b: Customer) => 
          a.sequenceNumber - b.sequenceNumber
        )

        const relations = relationsResponse.data as CustomerProductRelation[]
        setCustomerProductRelations(relations)

        const activeRelations = relations.filter(rel => rel.thruDate === null && rel.productId !== null)

        const transformedCustomers: CustomerForDelivery[] = sortedCustomers.map((item: Customer) => {
          const associatedProducts = activeRelations
            .filter(rel => rel.customerId === item.customer.customerId)
            .map(rel => rel.productId!)
            .filter(id => id !== null)

          return {
            id: item.customer.customerId.toString(),
            name: `${item.customer.firstName} ${item.customer.lastName || ''}`.trim(),
            type: item.customer.classification === 'B2B' ? 'B2B' : 'B2C',
            address: `${item.customer.address1}${item.customer.address2 ? ', ' + item.customer.address2 : ''}, ${item.customer.city || ''} ${item.customer.pincode || ''}`.trim(),
            deliveredItems: [],
            paymentReceived: 0,
            customerId: item.customer.customerId,
            deliveryConfirmed: false,
            sequenceNumber: item.sequenceNumber,
            associatedProductIds: associatedProducts
          }
        })

        setCustomers(transformedCustomers)
        setWorkerInventory(inventoryResponse.data)

        // Try to restore saved data for today
        const today = new Date().toISOString().split('T')[0]
        const savedData = await AsyncStorage.getItem(`delivery-data-${today}`)
        
        if (savedData) {
          const parsed = JSON.parse(savedData)
          // Only restore if data was saved recently (within last 24 hours)
          const hoursSinceLastSave = (Date.now() - parsed.timestamp) / (1000 * 60 * 60)
          
          if (hoursSinceLastSave < 24 && parsed.customers) {
            // Merge saved delivery data with fresh customer list
            const mergedCustomers = transformedCustomers.map(freshCustomer => {
              const savedCustomer = parsed.customers.find(
                (c: CustomerForDelivery) => c.customerId === freshCustomer.customerId
              )
              
              if (savedCustomer) {
                return {
                  ...freshCustomer,
                  deliveredItems: savedCustomer.deliveredItems || [],
                  paymentReceived: savedCustomer.paymentReceived || 0,
                  deliveryConfirmed: savedCustomer.deliveryConfirmed || false
                }
              }
              return freshCustomer
            })
            
            setCustomers(mergedCustomers)
            setSelectedIdx(parsed.selectedIdx || 0)
            setAssociatedProductQuantities(parsed.associatedProductQuantities || {})
            setManualPaymentAmounts(parsed.manualPaymentAmounts || {})
            
            Toast.show({
              type: 'info',
              text1: 'Data Restored',
              text2: 'Previous delivery progress restored',
              visibilityTime: 2000,
            })
          }
        }

        Toast.show({
          type: 'success',
          text1: 'Ready for Delivery',
          text2: `${transformedCustomers.length} customers loaded`,
          visibilityTime: 2000,
        })
      } else {
        throw new Error('Failed to fetch data from API')
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      setError('Failed to load data from server.')

      Toast.show({
        type: 'error',
        text1: 'Data Load Failed',
        text2: 'Unable to load customers and inventory',
        visibilityTime: 3000,
      })

      setCustomers([])
      setWorkerInventory([])
    } finally {
      setLoading(false)
    }
  }

  const customer = customers[selectedIdx]

  const handleTabPress = (idx: number) => {
    setSelectedIdx(idx)
  }

  const getAssociatedProducts = (): WorkerInventory[] => {
    if (!customer?.associatedProductIds || customer.associatedProductIds.length === 0) {
      return []
    }

    return workerInventory.filter(item => {
      const productId = item.inventory?.product.productId
      return productId && 
             customer.associatedProductIds!.includes(productId) &&
             (item.totalPickedQuantity || 0) > 0
    })
  }

  const getUnassociatedProducts = (): WorkerInventory[] => {
    if (!customer?.associatedProductIds || customer.associatedProductIds.length === 0) {
      return workerInventory.filter(item => (item.totalPickedQuantity || 0) > 0)
    }

    return workerInventory.filter(item => {
      const productId = item.inventory?.product.productId
      return productId && 
             !customer.associatedProductIds!.includes(productId) &&
             (item.totalPickedQuantity || 0) > 0
    })
  }

  const hasUnassociatedProducts = (): boolean => {
    const unassociated = getUnassociatedProducts()
    return unassociated.length > 0
  }

  const handleAddAssociatedProduct = (inventoryItem: WorkerInventory, quantity?: number) => {
    if (!inventoryItem.inventory?.product) return

    const product = inventoryItem.inventory.product
    const availableQty = inventoryItem.totalPickedQuantity || 0
    
    const totalDelivered = customers.reduce(
      (sum, cust) =>
        sum +
        cust.deliveredItems
          .filter(item => item.productId === product.productId)
          .reduce((subSum, item) => subSum + item.qty, 0),
      0
    )

    const availableForThisProduct = availableQty - totalDelivered

    if (availableForThisProduct <= 0) {
      Toast.show({
        type: 'error',
        text1: 'No Stock Available',
        text2: `${product.productName} is out of stock`,
        visibilityTime: 2000,
      })
      return
    }

    const quantityToUse = quantity || Math.min(
      customerProductRelations.find(
        rel => rel.customerId === customer.customerId && 
               rel.productId === product.productId &&
               rel.thruDate === null
      )?.quantityAssociated || 1,
      availableForThisProduct
    )

    if (quantityToUse <= 0 || quantityToUse > availableForThisProduct) {
      Toast.show({
        type: 'error',
        text1: 'Invalid Quantity',
        text2: `Please enter a quantity between 1 and ${availableForThisProduct}`,
        visibilityTime: 2000,
      })
      return
    }

    const newDeliveredItem: DeliveredItem = {
      name: product.productName,
      qty: quantityToUse,
      productId: product.productId,
      price: Number(product.currentProductPrice) * quantityToUse,
      originalPrice: Number(product.currentProductPrice),
      isEdited: false
    }

    const alreadyAdded = customer.deliveredItems.some(
      item => item.productId === product.productId
    )

    if (alreadyAdded) {
      Toast.show({
        type: 'info',
        text1: 'Already Added',
        text2: `${product.productName} is already in the delivery list`,
        visibilityTime: 2000,
      })
      return
    }

    const updatedDeliveredItems = [...customer.deliveredItems, newDeliveredItem]
    const updatedCustomers = [...customers]
    updatedCustomers[selectedIdx] = {
      ...updatedCustomers[selectedIdx],
      deliveredItems: updatedDeliveredItems
    }

    setCustomers(updatedCustomers)

    const quantityKey = `${customer.customerId}-${product.productId}`
    setAssociatedProductQuantities(prev => {
      const newState = { ...prev }
      delete newState[quantityKey]
      return newState
    })

    Toast.show({
      type: 'success',
      text1: 'Product Added',
      text2: `${product.productName} (${quantityToUse} packets) added`,
      visibilityTime: 1500,
    })
  }

  const handleItemTotalChange = (itemIndex: number, newTotal: string) => {
    const totalAmount = Number(newTotal) || 0
    
    const updatedCustomers = [...customers]
    const updatedItems = [...customer.deliveredItems]
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      price: totalAmount,
      isEdited: true
    }
    
    updatedCustomers[selectedIdx] = {
      ...updatedCustomers[selectedIdx],
      deliveredItems: updatedItems
    }
    
    setCustomers(updatedCustomers)
  }

  const handleItemQuantityChange = (itemIndex: number, newQty: string) => {
    const newQuantity = parseInt(newQty) || 0;

    const updatedCustomers = [...customers];
    const currentCustomer = updatedCustomers[selectedIdx];
    const updatedItems = [...currentCustomer.deliveredItems];
    const itemToUpdate = updatedItems[itemIndex];

    if (!itemToUpdate) return;

    const inventoryItem = workerInventory.find(
      (inv) => inv.inventory?.product.productId === itemToUpdate.productId
    );
    const totalPicked = inventoryItem?.totalPickedQuantity || 0;

    const totalDeliveredByAll = customers.reduce(
      (sum, cust) =>
        sum +
        cust.deliveredItems
          .filter((i) => i.productId === itemToUpdate.productId)
          .reduce((s, i) => s + i.qty, 0),
      0
    );
    
    const deliveredElsewhere = totalDeliveredByAll - itemToUpdate.qty;
    const maxAvailable = totalPicked - deliveredElsewhere;

    if (newQuantity > maxAvailable) {
      Toast.show({
        type: 'error',
        text1: 'Not Enough Stock',
        text2: `You only have ${maxAvailable} available.`,
        visibilityTime: 3000,
      });
      return;
    }

    updatedItems[itemIndex] = {
      ...itemToUpdate,
      qty: newQuantity,
      price: itemToUpdate.isEdited
        ? itemToUpdate.price
        : itemToUpdate.originalPrice * newQuantity,
    };

    updatedCustomers[selectedIdx] = {
      ...currentCustomer,
      deliveredItems: updatedItems,
    };

    setCustomers(updatedCustomers);
  };

  const handleRemoveItem = (itemIndex: number) => {
    const updatedCustomers = [...customers];
    const currentCustomer = updatedCustomers[selectedIdx];
    
    const itemRemoved = currentCustomer.deliveredItems[itemIndex];

    const updatedItems = currentCustomer.deliveredItems.filter(
      (_, idx) => idx !== itemIndex
    );

    updatedCustomers[selectedIdx] = {
      ...currentCustomer,
      deliveredItems: updatedItems,
    };

    setCustomers(updatedCustomers);
    
    // Update manual payment amount to reflect new total after removal
    const newTotal = calculateTotalPayment(updatedItems);
    setManualPaymentAmounts(prev => ({
      ...prev,
      [currentCustomer.customerId]: newTotal.toFixed(2)
    }));
    
    Toast.show({
      type: 'info',
      text1: 'Item Removed',
      text2: `${itemRemoved.name} removed from list.`,
      visibilityTime: 2000,
    });
  };

  const calculateTotalPayment = (deliveredItems: DeliveredItem[]) => {
    return deliveredItems.reduce((total, item) => total + item.price, 0)
  }

  const calculateAssociatedProductsTotal = () => {
    return getAssociatedProducts().reduce((total, inventoryItem) => {
      const product = inventoryItem.inventory?.product
      if (!product) return total
      
      const quantityKey = `${customer.customerId}-${product.productId}`
      const qty = parseInt(associatedProductQuantities[quantityKey]) || 0
      const price = product.currentProductPrice * qty
      
      return total + price
    }, 0)
  }

  const calculateBillAmount = (item: DeliveredItem) => {
    if (item.isEdited) {
      return item.price
    } else {
      return item.originalPrice * item.qty
    }
  }

  const confirmDelivery = async () => {
    const hasDeliveredItems = customer.deliveredItems.length > 0
    
    if (selectedIdx === customers.length - 1) {
      if (hasDeliveredItems) {
        await processCurrentDelivery()
      }
      
      const deliveryData = customers.map(customer => ({
        customerId: customer.customerId,
        deliveredItems: customer.deliveredItems,
        paymentReceived: customer.paymentReceived,
        deliveryConfirmed: customer.deliveryConfirmed
      }))

      router.push({
        pathname: "/CashDetailsScreen",
        params: {
          deliveryData: JSON.stringify(deliveryData),
          totalPayments: customers.reduce((sum, cust) => sum + cust.paymentReceived, 0).toString(),
        },
      })
      return
    }

    if (hasDeliveredItems) {
      await processCurrentDelivery()
    } else {
      Toast.show({
        type: 'info',
        text1: 'No Items',
        text2: 'Moving to next customer',
        visibilityTime: 1500,
      })
    }

    setSelectedIdx(selectedIdx + 1)
  }

  const processCurrentDelivery = async () => {
    if (customer.deliveryConfirmed) return

    setProcessingDelivery(true)

    try {
      Toast.show({
        type: 'info',
        text1: 'Processing...',
        text2: `Confirming delivery for ${customer.name}`,
        visibilityTime: 2000,
      })

      for (const item of customer.deliveredItems) {
        const inventoryItem = workerInventory.find(inv => 
          inv.inventory?.product.productId === item.productId
        )
        
        if (inventoryItem) {
          const deliveryDto = {
            customerId: customer.customerId,
            inventoryId: inventoryItem.inventoryId,
            deliveredQuantity: item.qty,
            billAmount: calculateBillAmount(item),
            isPriceCustomized: item.isEdited
          }

          const response = await processDeliveryRequest(deliveryDto)
          
          if (!response.success && !response.isDuplicate) {
            throw new Error(`Failed to process ${item.name}: ${response.message}`)
          }
        }
      }

      const updatedCustomers = [...customers]
      updatedCustomers[selectedIdx] = { 
        ...updatedCustomers[selectedIdx], 
        deliveryConfirmed: true,
        paymentReceived: calculateTotalPayment(customer.deliveredItems)
      }
      setCustomers(updatedCustomers)

      Toast.show({
        type: 'success',
        text1: 'Delivery Confirmed',
        text2: `${customer.name}'s delivery processed`,
        visibilityTime: 2000,
      })

    } catch (error) {
      console.error('Delivery processing error:', error)
      
      Toast.show({
        type: 'error',
        text1: 'Processing Failed',
        text2: 'Server error occurred',
        visibilityTime: 3000,
      })
    } finally {
      setProcessingDelivery(false)
    }
  }

  const getDeliveryProgress = () => {
    const completed = selectedIdx
    const total = customers.length
    return { completed, total }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading delivery route...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (error || customers.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {!API_BASE_URL ? 'API Configuration Missing' : error || 'No customers assigned'}
          </Text>
          
          {!API_BASE_URL ? (
            <Text style={styles.configInstructions}>
              Create a .env file with EXPO_PUBLIC_API_BASE_URL
            </Text>
          ) : (
            <TouchableOpacity style={styles.retryButton} onPress={fetchDataFromAPI}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    )
  }

  const progress = getDeliveryProgress()
  const totalPayment = calculateTotalPayment(customer.deliveredItems)

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FA" />

      <View style={styles.storeNameContainer}>
        <Text style={styles.storeName}>{customer.name}</Text>
      </View>
      
      <View style={styles.tabsContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.tabs}
          ref={tabScrollViewRef}
        >
          {customers.map((c, idx) => (
            <TouchableOpacity
              key={c.id}
              style={[
                styles.tab, 
                selectedIdx === idx && styles.activeTab,
                c.deliveryConfirmed && styles.confirmedTab
              ]}
              onPress={() => handleTabPress(idx)}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout;
                tabLayouts.current[idx] = { x, width };
              }}
            >
              <Text style={[
                styles.tabText, 
                selectedIdx === idx && styles.activeTabText,
                c.deliveryConfirmed && styles.confirmedTabText
              ]}>
                {c.deliveryConfirmed ? '✓ ' : ''}{c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.skipButtonContainer}>
        <TouchableOpacity 
          style={styles.skipButton}
          onPress={() => {
            if (selectedIdx < customers.length - 1) {
              setSelectedIdx(selectedIdx + 1)
            } else {
              router.push({
                pathname: "/CashDetailsScreen",
                params: {
                  deliveryData: JSON.stringify(customers.map(c => ({
                    customerId: c.customerId,
                    deliveredItems: c.deliveredItems,
                    paymentReceived: c.paymentReceived,
                    deliveryConfirmed: c.deliveryConfirmed
                  }))),
                  totalPayments: customers.reduce((sum, cust) => sum + cust.paymentReceived, 0).toString(),
                },
              })
            }
          }}
        >
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent}>
          <View style={styles.card}>
            
            <View style={styles.customerCard}>
              <View style={styles.customerHeader}>
                <Text style={styles.customerName}>{customer.name}</Text>
                {customer.deliveryConfirmed && (
                  <View style={styles.confirmedBadgeContainer}>
                    <View style={styles.confirmedBadge}>
                      <Text style={styles.confirmedBadgeText}>✓</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.editButton}
                      onPress={() => {
                        const updatedCustomers = [...customers]
                        updatedCustomers[selectedIdx] = {
                          ...updatedCustomers[selectedIdx],
                          deliveryConfirmed: false
                        }
                        setCustomers(updatedCustomers)
                        Toast.show({
                          type: 'info',
                          text1: 'Delivery Reopened',
                          text2: 'You can now edit this delivery',
                          visibilityTime: 2000,
                        })
                      }}
                    >
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <Text style={styles.customerAddress}>{customer.address}</Text>
            </View>

            {getAssociatedProducts().length > 0 && (
              <View style={styles.subsection}>
                <Text style={styles.sectionTitle}>Associated Products</Text>
                <View style={styles.listContainer}>
                  {getAssociatedProducts().map((inventoryItem, idx) => {
                    const product = inventoryItem.inventory?.product
                    if (!product) return null

                    const isAlreadyAdded = customer.deliveredItems.some(
                      item => item.productId === product.productId
                    )

                    const totalDelivered = customers.reduce(
                      (sum, cust) =>
                        sum +
                        cust.deliveredItems
                          .filter(item => item.productId === product.productId)
                          .reduce((subSum, item) => subSum + item.qty, 0),
                      0
                    )
                    const availableQty = (inventoryItem.totalPickedQuantity || 0) - totalDelivered

                    const associatedQty = customerProductRelations.find(
                      rel => rel.customerId === customer.customerId && 
                             rel.productId === product.productId &&
                             rel.thruDate === null
                    )?.quantityAssociated || 0

                    const quantityKey = `${customer.customerId}-${product.productId}`
                    const currentQuantity = quantityKey in associatedProductQuantities 
                      ? associatedProductQuantities[quantityKey] 
                      : (associatedQty > 0 ? associatedQty.toString() : '')

                    return (
                      <View
                        key={`associated-${product.productId}`}
                        style={[
                          styles.productCard,
                          isAlreadyAdded && styles.productCardAdded,
                          (availableQty <= 0 || customer.deliveryConfirmed) && styles.productCardDisabled
                        ]}
                      >
                        <View style={styles.productIcon}>
                          <Text style={styles.productIconText}>📦</Text>
                        </View>
                        <View style={styles.productInfo}>
                          <Text style={styles.productName}>{product.productName}</Text>
                          <Text style={styles.productAvailable}>
                            Available: {isAlreadyAdded ? '✓ Added' : availableQty}
                          </Text>
                          <Text style={styles.productPrice}>
                            ₹ {Number(product.currentProductPrice)}/packet
                          </Text>
                        </View>
                        
                        {!isAlreadyAdded && availableQty > 0 && !customer.deliveryConfirmed && (
                          <View style={styles.productQuantityInput}>
                            <TextInput
                              style={styles.quantityInput}
                              value={currentQuantity}
                              placeholder="0"
                              onChangeText={(text) => {
                                let numText = text.replace(/[^0-9]/g, '');

                                if (numText === '' || numText === '0') {
                                  setAssociatedProductQuantities(prev => ({
                                    ...prev,
                                    [quantityKey]: ''
                                  }));
                                  return;
                                }

                                if (numText.length > 1 && numText.startsWith('0')) {
                                  numText = numText.substring(1);
                                }

                                const numValue = parseInt(numText);

                                if (!isNaN(numValue)) {
                                  setAssociatedProductQuantities(prev => ({ 
                                    ...prev,
                                    [quantityKey]: numValue.toString() 
                                  }));
                                }
                              }}
                              keyboardType="numeric"
                              maxLength={3}
                            />
                            {parseInt(currentQuantity) > 0 && (
                              <Text style={styles.calculatedPrice}>
                                ₹{(Number(product.currentProductPrice) * parseInt(currentQuantity)).toFixed(2)}
                              </Text>
                            )}
                          </View>
                        )}
                        
                        {isAlreadyAdded && (
                          <View style={styles.productQuantityInput}>
                            <View style={styles.addedCheckmark}>
                              <Text style={styles.addedCheckmarkText}>✓</Text>
                            </View>
                          </View>
                        )}
                      </View>
                    )
                  })}
                </View>
              </View>
            )}

            {customer.deliveredItems.length > 0 && (
              <View style={styles.subsection}>
                <Text style={styles.sectionTitle}>Items ({customer.deliveredItems.length})</Text>
                <View style={styles.listContainer}>
                  {customer.deliveredItems.map((item, idx) => (
                    <View key={idx} style={[styles.listCard, styles.itemCard]}>
                      
                      <View style={styles.listCardInfo}>
                        <Text style={styles.listCardName}>{item.name}</Text>
                      </View>
                      
                      <View style={styles.listCardActions}>
                        <View style={styles.priceInputContainer}>
                          <TextInput
                            style={[
                              styles.priceInput,
                              {textAlign: 'center', width: 50},
                              customer.deliveryConfirmed && styles.textInputDisabled
                            ]}
                            value={item.qty.toString()}
                            onChangeText={(newQty) => handleItemQuantityChange(idx, newQty)}
                            keyboardType="numeric"
                            editable={!customer.deliveryConfirmed}
                            maxLength={3}
                          />
                        </View>
                          
                        <View style={styles.priceInputContainer}>
                          <Text style={styles.rupeeSymbol}>₹</Text>
                          <TextInput
                            style={[
                              styles.priceInput,
                              customer.deliveryConfirmed && styles.textInputDisabled
                            ]}
                            value={item.price.toString()}
                            placeholder={`${item.originalPrice * item.qty}`}
                            onChangeText={(newTotal) => handleItemTotalChange(idx, newTotal)}
                            keyboardType="numeric"
                            editable={!customer.deliveryConfirmed}
                          />
                        </View>

                        {!customer.deliveryConfirmed && (
                          <TouchableOpacity
                            onPress={() => handleRemoveItem(idx)}
                            style={styles.removeButton}
                          >
                            <Text style={styles.removeButtonText}>✕</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
                <Text style={styles.grandTotalText}>
                  Grand Total: ₹{manualPaymentAmounts[customer.customerId] ?? totalPayment.toFixed(2)}
                </Text>
              </View>
            )}

            {!customer.deliveryConfirmed && (
              <TouchableOpacity
                style={[
                  styles.addProductsButton,
                  customer.deliveredItems.length > 0 && styles.addProductsButtonSecondary
                ]}
                onPress={() => setProductDeliveryModal(true)}
              >
                <Text style={[
                  styles.addProductsButtonText,
                  customer.deliveredItems.length > 0 && styles.addProductsButtonSecondaryText
                ]}>
                  {customer.associatedProductIds && customer.associatedProductIds.length > 0 
                    ? '📦 Add Other Products' 
                    : '📦 Add Products'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ProductDeliveryModal
        visible={productDeliveryModal}
        customer={customer}
        customers={customers}
        setCustomers={setCustomers}
        selectedIdx={selectedIdx}
        workerInventory={getUnassociatedProducts()}
        onClose={() => setProductDeliveryModal(false)}
      />

      <View style={[styles.fixedBottomContainer, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.paymentRow}>
          <View style={styles.paymentAmountContainer}>
            <Text style={styles.rupeeSymbolLarge}>₹</Text>
            <TextInput
              style={styles.paymentAmount}
              value={manualPaymentAmounts[customer.customerId] ?? (totalPayment + calculateAssociatedProductsTotal()).toFixed(2)}
              onChangeText={(text) => {
                setManualPaymentAmounts(prev => ({
                  ...prev,
                  [customer.customerId]: text
                }))
              }}
              keyboardType="numeric"
              placeholder="0.00"
            />
          </View>
          <TouchableOpacity 
            style={styles.collectButton}
            onPress={() => {
              // Collect all products with quantities > 0
              const newDeliveredItems: DeliveredItem[] = []
              const quantityKeysToRemove: string[] = []
              
              getAssociatedProducts().forEach(inventoryItem => {
                const product = inventoryItem.inventory?.product
                if (!product) return
                
                const quantityKey = `${customer.customerId}-${product.productId}`
                const qtyString = associatedProductQuantities[quantityKey] || ''
                const qty = qtyString === '' ? 0 : parseInt(qtyString)
                
                if (!qtyString || qty <= 0) return
                
                // Check if already added
                const isAlreadyAdded = customer.deliveredItems.some(
                  item => item.productId === product.productId
                )
                if (isAlreadyAdded) return
                
                // Check available stock
                const availableQty = inventoryItem.totalPickedQuantity || 0
                const totalDelivered = customers.reduce(
                  (sum, cust) =>
                    sum +
                    cust.deliveredItems
                      .filter(item => item.productId === product.productId)
                      .reduce((subSum, item) => subSum + item.qty, 0),
                  0
                )
                const availableForThisProduct = availableQty - totalDelivered
                
                if (qty > availableForThisProduct) {
                  Toast.show({
                    type: 'error',
                    text1: 'Insufficient Stock',
                    text2: `Only ${availableForThisProduct} available for ${product.productName}`,
                    visibilityTime: 2000,
                  })
                  return
                }
                
                // Add to the list
                newDeliveredItems.push({
                  name: product.productName,
                  qty: qty,
                  productId: product.productId,
                  price: Number(product.currentProductPrice) * qty,
                  originalPrice: Number(product.currentProductPrice),
                  isEdited: false
                })
                
                quantityKeysToRemove.push(quantityKey)
              })
              
              if (newDeliveredItems.length === 0) {
                // Check if there are already items in the cart
                if (customer.deliveredItems.length > 0) {
                  Toast.show({
                    type: 'info',
                    text1: 'No New Items',
                    text2: 'No quantities entered for associated products',
                    visibilityTime: 2000,
                  })
                } else {
                  Toast.show({
                    type: 'info',
                    text1: 'No Items',
                    text2: 'Please enter quantities first',
                    visibilityTime: 2000,
                  })
                }
                return
              }
              
              // Update state once with all items
              const updatedDeliveredItems = [...customer.deliveredItems, ...newDeliveredItems]
              const updatedCustomers = [...customers]
              updatedCustomers[selectedIdx] = {
                ...updatedCustomers[selectedIdx],
                deliveredItems: updatedDeliveredItems
              }
              setCustomers(updatedCustomers)
              
              // Clear quantities
              setAssociatedProductQuantities(prev => {
                const newState = { ...prev }
                quantityKeysToRemove.forEach(key => delete newState[key])
                return newState
              })
              
              Toast.show({
                type: 'success',
                text1: 'Products Added',
                text2: `${newDeliveredItems.length} product(s) added successfully`,
                visibilityTime: 2000,
              })
            }}
          >
            <Text style={styles.collectButtonText}>Collect</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity 
          style={[
            styles.confirmButtonNew,
            processingDelivery && styles.confirmButtonProcessing
          ]} 
          onPress={confirmDelivery}
          disabled={processingDelivery}
        >
          <Text style={styles.confirmButtonTextNew}>
            {processingDelivery 
              ? 'Processing...' 
              : 'Confirm'
            }
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const theme = {
  colors: {
    primary: '#2563EB',
    primaryLight: '#EFF6FF',
    primaryLighter: '#F0F9FF',
    primaryDark: '#1E40AF',
    primaryBorder: '#DBEAFE',
    
    success: '#10B981',
    successLight: '#ECFDF5',
    successDark: '#059669',
    
    warning: '#F59E0B',
    
    error: '#EF4444',
    errorLight: '#FEF2F2',
    errorBorder: '#FCA5A5',
    errorDark: '#DC2626',
    
    background: '#F8F9FA',
    surface: '#FFFFFF',
    
    textPrimary: '#1E293B',
    textSecondary: '#64748B',
    textOnPrimary: '#FFFFFF',
    
    border: '#E2E8F0',
    borderLight: '#EEE',
    
    inputBackground: '#FFFFFF',
    inputBorder: '#3B82F6',
    inputDisabled: '#9CA3AF',
    inputDisabledBg: '#F3F4F6',

    tabInactive: '#F1F5F9',
    tabInactiveText: '#333',

    disabled: '#D1D5DB',
  },
  font: {
    size: {
      xl: 22,
      lg: 18,
      md: 16,
      sm: 14,
      xs: 12,
    },
    weight: {
      bold: '700',
      semibold: '600',
      medium: '500',
      regular: '400',
    }
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 20,
    xl: 24,
  },
  borderRadius: {
    sm: 6,
    md: 8,
    lg: 12,
  },
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F5F7FA'
  },
  keyboardAvoidingView: { 
    flex: 1 
  },
  scrollView: { 
    flex: 1 
  },
  scrollViewContent: { 
    paddingBottom: 180 
  },
  skipButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  skipButton: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  skipButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  storeNameContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  storeName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2563EB',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.font.size.md,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.font.size.lg,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
    fontWeight: theme.font.weight.semibold,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.borderRadius.lg,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    color: theme.colors.textOnPrimary,
    fontWeight: theme.font.weight.semibold,
    fontSize: theme.font.size.md,
  },
  configInstructions: {
    color: theme.colors.textSecondary,
    fontSize: theme.font.size.sm,
    textAlign: "center",
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontFamily: "monospace",
    lineHeight: 20,
  },
  
  progressHeader: {
    backgroundColor: theme.colors.primaryLight,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.primaryBorder,
  },
  progressText: {
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.bold,
    color: theme.colors.primaryDark,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  progressBar: {
    height: 4,
    backgroundColor: theme.colors.primaryBorder,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
  },

  tabsContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tabs: {
    paddingLeft: 8,
  },
  tab: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#E5E7EB',
    alignItems: "center",
    minWidth: 48,
  },
  activeTab: { 
    backgroundColor: '#2563EB'
  },
  confirmedTab: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
    borderWidth: 1,
  },
  tabText: { 
    color: '#6B7280', 
    fontWeight: '600',
    fontSize: 16,
    textAlign: "center",
  },
  activeTabText: { 
    color: '#FFFFFF', 
    fontWeight: '700'
  },
  confirmedTabText: {
    color: '#059669',
    fontWeight: '700',
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2563EB',
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  productCardAdded: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  productCardDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
    opacity: 0.6,
  },
  productIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  productIconText: {
    fontSize: 24,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  productAvailable: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '500',
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 13,
    color: '#6B7280',
  },
  productQuantityInput: {
    width: 80,
    alignItems: 'center',
  },
  quantityInput: {
    width: 70,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  calculatedPrice: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  addedCheckmark: {
    width: 70,
    height: 48,
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addedCheckmarkText: {
    fontSize: 24,
    color: '#10B981',
  },
  fixedBottomContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  paymentAmountContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginRight: 12,
  },
  rupeeSymbolLarge: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginRight: 8,
  },
  paymentAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  collectButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  collectButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  confirmButtonNew: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonProcessing: {
    backgroundColor: '#93C5FD',
  },
  confirmButtonTextNew: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    margin: theme.spacing.md,
    padding: 18,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  customerCard: {
    marginBottom: theme.spacing.lg,
  },
  customerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.xs,
  },
  customerName: { 
    fontSize: theme.font.size.xl, 
    fontWeight: theme.font.weight.bold, 
    color: theme.colors.textPrimary,
    flex: 1,
  },
  confirmedBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmedBadge: {
    backgroundColor: theme.colors.successLight,
    borderColor: theme.colors.success,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.lg,
  },
  confirmedBadgeText: {
    color: theme.colors.successDark,
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.bold,
  },
  editButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  customerAddress: { 
    color: theme.colors.textSecondary, 
    fontSize: theme.font.size.sm, 
    lineHeight: 20
  },
  
  subsection: { 
    marginTop: theme.spacing.xl 
  },
  sectionTitle: { 
    fontSize: theme.font.size.md, 
    fontWeight: theme.font.weight.bold, 
    marginBottom: theme.spacing.sm, 
    color: theme.colors.textPrimary 
  },

  listContainer: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  listCard: {
    borderRadius: theme.borderRadius.md,
    padding: 10,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  catalogCard: {
    backgroundColor: theme.colors.primaryLighter,
    borderColor: theme.colors.primary,
  },
  catalogCardAdded: {
    backgroundColor: theme.colors.successLight,
    borderColor: theme.colors.success,
  },
  catalogCardDisabled: {
    backgroundColor: theme.colors.inputDisabledBg,
    borderColor: theme.colors.border,
    opacity: 0.6,
  },
  itemCard: {
    backgroundColor: theme.colors.successLight,
    borderColor: theme.colors.success,
  },
  listCardInfo: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  listCardName: {
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.bold,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  listCardDetails: {
    fontSize: theme.font.size.xs,
    color: theme.colors.textSecondary,
    fontWeight: theme.font.weight.medium,
    marginBottom: 2,
  },
  listCardPrice: {
    fontSize: theme.font.size.xs,
    color: theme.colors.textSecondary,
    fontWeight: theme.font.weight.semibold,
  },
  listCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  
  textInputDisabled: {
    color: theme.colors.inputDisabled,
    backgroundColor: theme.colors.inputDisabledBg,
    borderColor: theme.colors.border,
  },
  
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.inputBorder,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    backgroundColor: theme.colors.inputBackground,
  },
  rupeeSymbol: {
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.textPrimary,
    marginRight: theme.spacing.xs,
  },
  priceInput: {
    padding: 0,
    width: 50,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.inputBackground,
  },

  addButton: {
    backgroundColor: theme.colors.success,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    backgroundColor: theme.colors.disabled,
  },
  addButtonText: {
    color: theme.colors.textOnPrimary,
    fontWeight: theme.font.weight.bold,
    fontSize: theme.font.size.xs,
  },
  addedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addedBadgeText: {
    color: theme.colors.successDark,
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.bold,
  },

  removeButton: {
    backgroundColor: theme.colors.errorLight,
    borderColor: theme.colors.errorBorder,
    borderWidth: 1.5,
    borderRadius: theme.borderRadius.sm,
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
  },
  removeButtonText: {
    color: theme.colors.errorDark,
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  
  grandTotalText: {
    fontSize: theme.font.size.lg,
    fontWeight: theme.font.weight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'right',
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },

  addProductsButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: 18,
    alignItems: "center",
    marginTop: theme.spacing.lg,
  },
  addProductsButtonSecondary: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.primary,
    borderWidth: 2,
    padding: 16,
  },
  addProductsButtonText: {
    color: theme.colors.textOnPrimary,
    fontWeight: theme.font.weight.bold,
    fontSize: theme.font.size.lg,
  },
  addProductsButtonSecondaryText: {
    color: theme.colors.primary,
  },

  fixedButtonContainer: {
    position: "absolute",
    left: 18,
    right: 18,
    zIndex: 100,
  },
  confirmButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: 18,
    alignItems: "center",
    elevation: 8,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  confirmButtonProcessing: {
    backgroundColor: theme.colors.warning,
  },
  confirmButtonText: {
    color: theme.colors.textOnPrimary,
    fontWeight: theme.font.weight.bold,
    fontSize: theme.font.size.lg,
  },
})