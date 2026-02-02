"use client"

import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState, useRef, useMemo, useCallback } from "react"
import { useQueryClient } from '@tanstack/react-query'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
  Alert,
  FlatList,
  Image,
  RefreshControl
} from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import Toast from 'react-native-toast-message'
import NetInfo from '@react-native-community/netinfo'
import apiClient from '../services/apiClient'
import { ProductDeliveryModal } from "./CDS/ProductDeliveryModal"
import { Ionicons } from '@expo/vector-icons'
import * as SecureStore from 'expo-secure-store'

// New Hooks & Types
import { useCustomerDelivery } from '../hooks/useCustomerDelivery'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import { CustomerForDelivery, DeliveredItem, CustomerProductRelation, WorkerInventory } from '../types'
import { calculateTotalPayment, calculateTotalQuantity, hasEditedPrices } from '../utils/deliveryCalculations'

const { width } = Dimensions.get('window')
const TAB_WIDTH = width / 3;

export default function CustomerDeliveryScreen() {
  const router = useRouter()
  const { workerId: workerIdParam } = useLocalSearchParams()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  // Use new hooks
  const {
    customers,
    inventory,
    relations: customerProductRelations = [],
    loading: isLoading,
    error: apiError,
    refetchData,
    refreshing,
    setCustomers
  } = useCustomerDelivery()

  const {
    queueSize: offlineQueueCount,
    isSyncing,
    addToQueue: addToOfflineQueue,
    syncQueue: syncOfflineQueue
  } = useOfflineQueue()

  // Local state for UI
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState<number>(0)
  const [modalVisible, setModalVisible] = useState(false)
  const [processingDelivery, setProcessingDelivery] = useState(false)

  // Additional UI state
  const [associatedProductQuantities, setAssociatedProductQuantities] = useState<Record<string, string>>({})
  const [productDeliveryModal, setProductDeliveryModal] = useState(false) // For modal visibility
  const [menuVisible, setMenuVisible] = useState(false) // For hamburger menu
  const [paymentAmount, setPaymentAmount] = useState('') // For B2B payment input
  const [currentWorkerName, setCurrentWorkerName] = useState('') // Local worker name storage

  // Refs for tabs
  const tabListRef = useRef<FlatList>(null);
  const { width: screenWidth } = Dimensions.get('window');

  // Derived state
  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return customers;
    return customers.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.includes(searchQuery)
    );
  }, [customers, searchQuery]);

  const customer = filteredCustomers[selectedIdx]
  const isB2B = customer?.type === 'B2B'

  // Scroll to tab when selected
  useEffect(() => {
    if (customers.length === 0 || !tabListRef.current) return;
    try {
      // Small timeout to ensure layout is ready after selection change
      setTimeout(() => {
        tabListRef.current?.scrollToIndex({
          index: selectedIdx,
          animated: true,
          viewPosition: 0.5
        });
      }, 100);
    } catch (e) {
      // Ignore specific scroll errors
    }
  }, [selectedIdx, customers]);

  // Initial tab selection - Jump to first pending customer
  const hasInitialJumped = useRef(false);

  useEffect(() => {
    if (customers.length > 0 && !hasInitialJumped.current) {
      const firstPendingIdx = customers.findIndex(c => !c.deliveryConfirmed);
      if (firstPendingIdx !== -1) {
        setSelectedIdx(firstPendingIdx);
      }
      hasInitialJumped.current = true; // Mark as done so we don't jump while user is browsing
    }
  }, [customers]);

  useEffect(() => {
    const getWorkerName = async () => {
      const name = await AsyncStorage.getItem('workerName');
      if (name) setCurrentWorkerName(name);
    };
    getWorkerName();
  }, []);

  const handleTabPress = (index: number) => {
    setSelectedIdx(index);
  };

  const handleLogout = async () => {
    try {
      if (Platform.OS === 'web') {
        await AsyncStorage.removeItem('authToken');
        await AsyncStorage.removeItem('workerId');
      } else {
        await SecureStore.deleteItemAsync('authToken');
        await SecureStore.deleteItemAsync('workerId');
      }
      router.replace('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const getAssociatedProducts = useCallback(() => {
    if (!customer || !inventory) return [];

    // Get inventory items that match the customer's associated products
    const directAssociations = inventory.filter(inv =>
      customer.associatedProductIds?.includes(inv.inventory.product.productId)
    );

    return directAssociations;
  }, [customer, inventory]);

  const handleDeliveryConfirm = async (forcedItems?: DeliveredItem[]) => {
    if (!customer) return;

    const itemsToDeliver = forcedItems || customer.deliveredItems;

    if (itemsToDeliver.length === 0) {
      Alert.alert('No Items', 'Please add at least one item to confirm delivery.');
      return;
    }

    setProcessingDelivery(true);
    let allSuccessful = true;
    let anySuccessful = false;

    try {
      const totalAmount = calculateTotalPayment(itemsToDeliver);

      for (const item of itemsToDeliver) {
        // Find corresponding inventoryId from worker's inventory
        const inventoryItem = (inventory || []).find(inv => inv.inventory?.product?.productId === item.productId);

        if (!inventoryItem) {
          console.error(`Inventory ID not found for product ${item.productId}`);
          allSuccessful = false;
          continue;
        }

        const itemPayload = {
          customerId: customer.customerId,
          inventoryId: inventoryItem.inventoryId,
          deliveredQuantity: item.qty,
          billAmount: item.qty * item.price,
          isPriceCustomized: item.isEdited
        };

        try {
          // Always try direct API call first
          const response = await apiClient.post('/deliveries/process', itemPayload) as any;

          if (response.success) {
            anySuccessful = true;
          } else {
            throw new Error(response.message || 'Server rejected delivery');
          }
        } catch (error) {
          console.log(`Online submission failed for item ${item.productId}, falling back to offline queue:`, error);
          await addToOfflineQueue('delivery', itemPayload, `del_${customer.customerId}_${item.productId}_${Date.now()}`);
          allSuccessful = false;
        }
      }

      if (allSuccessful) {
        Toast.show({ type: 'success', text1: 'Delivery Confirmed', text2: 'All items submitted successfully' });
      } else if (anySuccessful) {
        Toast.show({ type: 'info', text1: 'Partial Success', text2: 'Some items saved offline' });
      } else {
        Toast.show({ type: 'info', text1: 'Saved Offline', text2: 'Delivery queued for sync' });
      }

      // Mark as confirmed locally regardless (Optimistic UI)
      const updatedCustomers = [...customers];
      updatedCustomers[selectedIdx] = {
        ...updatedCustomers[selectedIdx],
        deliveredItems: itemsToDeliver,
        deliveryConfirmed: true,
        paymentReceived: totalAmount
      };
      setCustomers(updatedCustomers);
      AsyncStorage.setItem('offline_customers', JSON.stringify(updatedCustomers));

      // Invalidate inventory cache to fetch latest availableQuantity
      queryClient.invalidateQueries({ queryKey: ['inventory'] });

    } catch (error) {
      console.error('Error confirming delivery:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to save delivery' });
    } finally {
      setProcessingDelivery(false);
    }
  };

  const handleAddProduct = (product: any, qty: number, price: number) => {
    if (!customer) return;

    // Check duplication
    if (customer.deliveredItems.some(item => item.productId === product.productId)) {
      Toast.show({ type: 'info', text1: 'Item already added' });
      return;
    }

    const newItem: DeliveredItem = {
      productId: product.productId,
      name: product.productName,
      qty,
      price: price,
      originalPrice: product.currentProductPrice,
      isEdited: price !== product.currentProductPrice
    };

    const updatedCustomers = [...customers];
    updatedCustomers[selectedIdx] = {
      ...updatedCustomers[selectedIdx],
      deliveredItems: [...updatedCustomers[selectedIdx].deliveredItems, newItem]
    };
    setCustomers(updatedCustomers);
  };

  const handleRemoveProduct = (productId: number) => {
    if (!customer) return;

    const updatedCustomers = [...customers];
    updatedCustomers[selectedIdx] = {
      ...updatedCustomers[selectedIdx],
      deliveredItems: updatedCustomers[selectedIdx].deliveredItems.filter(item => item.productId !== productId)
    };
    setCustomers(updatedCustomers);
  };

  const getDeliveryProgress = () => {
    const completed = customers.filter(c => c.deliveryConfirmed).length;
    const total = customers.length;
    return { completed, total };
  };


  const getUnassociatedProducts = useCallback(() => {
    if (!customer || !inventory) return [];

    // If no associations, return all available inventory
    if (!customer.associatedProductIds || customer.associatedProductIds.length === 0) {
      return inventory.filter(item => (item.totalPickedQuantity || 0) > 0);
    }

    // Otherwise filter out associated products
    return inventory.filter(item => {
      const productId = item.inventory?.product.productId;
      return productId &&
        !customer.associatedProductIds?.includes(productId) &&
        (item.totalPickedQuantity || 0) > 0;
    });
  }, [customer, inventory]);

  const hasUnassociatedProducts = () => getUnassociatedProducts().length > 0;

  const handleAddAssociatedProduct = (inventoryItem: WorkerInventory, quantity?: number) => {
    if (!inventoryItem.inventory?.product || !customer) return;
    const product = inventoryItem.inventory.product;

    // Check duplication
    if (customer.deliveredItems.some(item => item.productId === product.productId)) {
      Toast.show({ type: 'info', text1: 'Item already added' });
      return;
    }

    const availableQty = inventoryItem.totalPickedQuantity || 0;

    // Calculate availability (subtracting what others took)
    const totalDeliveredByAll = customers.reduce((sum, cust) => {
      if (cust.id === customer.id) return sum; // exclude current
      return sum + cust.deliveredItems
        .filter(item => item.productId === product.productId)
        .reduce((s, i) => s + i.qty, 0);
    }, 0);

    const availableForThisProduct = availableQty - totalDeliveredByAll;

    if (availableForThisProduct <= 0) {
      Toast.show({ type: 'error', text1: 'Out of Stock', text2: `${product.productName} is out of stock` });
      return;
    }

    const qtyToAdd = quantity || 1;
    if (qtyToAdd > availableForThisProduct) {
      Toast.show({ type: 'error', text1: 'Not Enough Stock', text2: `Only ${availableForThisProduct} available` });
      return;
    }

    handleAddProduct(product, qtyToAdd, Number(product.currentProductPrice) * qtyToAdd);
  };

  const handleItemTotalChange = (itemIndex: number, newTotal: string) => {
    const totalAmount = Number(newTotal) || 0;
    if (!customer) return;

    const updatedCustomers = [...customers];
    const updatedItems = [...customer.deliveredItems];
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      price: totalAmount,
      isEdited: true
    };

    updatedCustomers[selectedIdx] = {
      ...updatedCustomers[selectedIdx],
      deliveredItems: updatedItems
    };
    setCustomers(updatedCustomers);
  };

  const handleItemQuantityChange = (itemIndex: number, newQty: string) => {
    const newQuantity = parseInt(newQty) || 0;
    if (!customer) return;

    const updatedCustomers = [...customers];
    const updatedItems = [...customer.deliveredItems];
    const itemToUpdate = updatedItems[itemIndex];

    if (!itemToUpdate) return;

    const inventoryItem = inventory?.find(inv => inv.inventory?.product.productId === itemToUpdate.productId);
    // Use availableQuantity (Net) if present, fallback to TotalPicked (Gross)
    const baseQty = inventoryItem?.availableQuantity ?? inventoryItem?.totalPickedQuantity ?? 0;

    const totalDeliveredByAll = customers.reduce((sum, cust) => {
      // Only count UNCONFIRMED deliveries in this subtraction. 
      // Confirmed ones are already deducted from 'availableQuantity' by the backend.
      if (cust.deliveryConfirmed) return sum;

      if (cust.id === customer.id) {
        return sum + cust.deliveredItems.filter(i => i.productId === itemToUpdate.productId && i !== itemToUpdate).reduce((s, i) => s + i.qty, 0);
      }
      return sum + cust.deliveredItems.filter(i => i.productId === itemToUpdate.productId).reduce((s, i) => s + i.qty, 0);
    }, 0);

    const maxAvailable = baseQty - totalDeliveredByAll;

    if (newQuantity > maxAvailable) {
      Toast.show({
        type: 'error',
        text1: 'Not Enough Stock',
        text2: `Only ${maxAvailable} available`,
      });
      return;
    }

    updatedItems[itemIndex] = {
      ...itemToUpdate,
      qty: newQuantity,
      price: itemToUpdate.isEdited ? itemToUpdate.price : itemToUpdate.originalPrice * newQuantity
    };

    updatedCustomers[selectedIdx] = { ...updatedCustomers[selectedIdx], deliveredItems: updatedItems };
    setCustomers(updatedCustomers);
  };

  const handleRemoveItem = (itemIndex: number) => {
    if (!customer) return;
    const updatedCustomers = [...customers];
    const updatedItems = customer.deliveredItems.filter((_, idx) => idx !== itemIndex);

    updatedCustomers[selectedIdx] = {
      ...updatedCustomers[selectedIdx],
      deliveredItems: updatedItems
    };
    setCustomers(updatedCustomers);
    Toast.show({ type: 'info', text1: 'Item Removed' });
  };

  const confirmDelivery = async () => {
    if (!customer) return;

    // 1. Gather all items to deliver: 
    const finalItemsToDeliver: DeliveredItem[] = [...customer.deliveredItems];
    const associatedProducts = getAssociatedProducts();

    for (const invItem of associatedProducts) {
      const product = invItem.inventory?.product;
      if (!product) continue;

      const quantityKey = `${customer.customerId}-${product.productId}`;
      const enteredQty = associatedProductQuantities[quantityKey];

      const associatedQty = customerProductRelations.find(
        rel => rel.customerId === customer.customerId &&
          rel.productId === product.productId &&
          rel.thruDate === null
      )?.quantityAssociated || 0;

      let qty = 0;
      if (enteredQty !== undefined) {
        qty = parseInt(enteredQty) || 0;
      } else if (!isB2B) {
        qty = associatedQty;
      }

      if (qty > 0) {
        // Check availability precisely before including
        const totalDeliveredByAllPending = customers.reduce((sum, cust) => {
          if (cust.deliveryConfirmed) return sum;
          return sum + cust.deliveredItems
            .filter(item => item.productId === product.productId)
            .reduce((s, i) => s + i.qty, 0);
        }, 0);

        const baseQty = invItem.availableQuantity ?? invItem.totalPickedQuantity ?? 0;
        const availableNow = baseQty - totalDeliveredByAllPending;

        if (qty > availableNow) {
          Toast.show({
            type: 'error',
            text1: 'Insufficient Stock',
            text2: `${product.productName}: Needed ${qty}, Available ${availableNow}. Please Add or Purchase more stock.`,
            visibilityTime: 4000
          });
          return; // Stop the whole confirmation
        }

        const isAlreadyIncluded = finalItemsToDeliver.some(item => item.productId === product.productId);
        if (!isAlreadyIncluded) {
          finalItemsToDeliver.push({
            productId: product.productId,
            name: product.productName,
            qty: qty,
            price: Number(product.currentProductPrice) * qty,
            originalPrice: product.currentProductPrice,
            isEdited: false
          });
        }
      }
    }

    if (finalItemsToDeliver.length === 0) {
      if (selectedIdx < customers.length - 1) {
        Toast.show({ type: 'info', text1: 'Skipping' });
        setSelectedIdx(selectedIdx + 1);
      } else {
        // Last customer - navigate to cash details anyway?
        router.push({
          pathname: "/CashDetailsScreen",
          params: {
            deliveryData: JSON.stringify(customers.map(c => ({
              customerId: c.customerId,
              deliveredItems: c.deliveredItems,
              paymentReceived: c.paymentReceived,
              deliveryConfirmed: c.deliveryConfirmed
            }))),
            totalPayments: customers.reduce((sum, c) => sum + c.paymentReceived, 0).toString()
          }
        });
      }
      return;
    }

    // Call the actual delivery submission (passescalculated items directly)
    await handleDeliveryConfirm(finalItemsToDeliver);

    if (selectedIdx === customers.length - 1) {
      // Re-calculate updatedCustomers state locally to ensure we have the absolute latest for next screen
      const currentCustomers = [...customers];
      const totalAmount = calculateTotalPayment(finalItemsToDeliver);
      currentCustomers[selectedIdx] = {
        ...currentCustomers[selectedIdx],
        deliveredItems: finalItemsToDeliver,
        deliveryConfirmed: true,
        paymentReceived: totalAmount
      };

      const deliveryData = currentCustomers.map(c => ({
        customerId: c.customerId,
        deliveredItems: c.deliveredItems,
        paymentReceived: c.paymentReceived,
        deliveryConfirmed: c.deliveryConfirmed
      }));
      const totalPayments = currentCustomers.reduce((sum, c) => sum + c.paymentReceived, 0);

      router.push({
        pathname: "/CashDetailsScreen",
        params: {
          deliveryData: JSON.stringify(deliveryData),
          totalPayments: totalPayments.toString()
        }
      });
    } else {
      setSelectedIdx(selectedIdx + 1);
    }
  };

  // Compatibility aliases for render
  const loading = isLoading;
  const error = apiError ? (apiError as any).message || 'An error occurred' : null;
  const fetchDataFromAPI = refetchData;

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
            {error || 'No customers assigned'}
          </Text>

          <TouchableOpacity style={styles.retryButton} onPress={fetchDataFromAPI}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const progress = getDeliveryProgress()
  const totalPayment = calculateTotalPayment(customer.deliveredItems)

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header Top Bar */}
      <View style={styles.headerTopBar}>
        <TouchableOpacity
          style={styles.syncButton}
          onPress={refetchData}
          disabled={refreshing}
        >
          <Ionicons name="refresh" size={24} color={refreshing ? "#999" : "#3880FF"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.hamburgerButton}
          onPress={() => setMenuVisible(!menuVisible)}
        >
          <Ionicons name="menu" size={28} color="#3880FF" />
        </TouchableOpacity>

        {menuVisible && (
          <View style={styles.menuOverlay}>
            {['Add', 'Transfer', 'Purchase', 'Logout'].map((item) => (
              <TouchableOpacity
                key={item}
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  if (item === 'Logout') {
                    handleLogout();
                  } else if (['Add', 'Transfer', 'Purchase'].includes(item)) {
                    router.push({
                      pathname: '/InventoryManagementScreen',
                      params: {
                        customerName: customer?.name || '',
                        workerName: currentWorkerName,
                        initialTab: item.toUpperCase() // Pass TAB: ADD, TRANSFER, PURCHASE
                      }
                    });
                  }
                }}
              >
                <Text style={[styles.menuItemText, item === 'Logout' && { color: '#EF4444' }]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Tabs Container (B, C, D) */}
      <View style={styles.tabsContainer}>
        <FlatList
          ref={tabListRef}
          data={customers}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabs}
          snapToInterval={TAB_WIDTH}
          snapToAlignment="start"
          decelerationRate="fast"
          keyExtractor={(item) => item.id}
          initialScrollIndex={0}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[
                styles.tab,
                selectedIdx === index && { backgroundColor: item.classification === 'B2B' ? '#10B981' : '#3880FF' },
                item.deliveryConfirmed && styles.confirmedTab
              ]}
              onPress={() => handleTabPress(index)}
            >
              <Text style={[
                styles.tabText,
                selectedIdx === index && styles.activeTabText,
                item.deliveryConfirmed && styles.confirmedTabText
              ]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollViewContent, { paddingBottom: 100 }]}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => {
              Toast.show({ type: 'info', text1: 'Skipping Delivery' });
              if (selectedIdx < customers.length - 1) {
                setSelectedIdx(selectedIdx + 1);
              }
            }}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>

          <View style={styles.customerCard}>
            {/* Centered Customer Header */}
            <View style={styles.centeredCustomerHeader}>
              <Text style={styles.centeredCustomerName}>{customer.name}</Text>
              <View style={styles.underLine} />
            </View>

            <View style={{ marginTop: 10 }}>
              {getAssociatedProducts().map((inventoryItem, idx) => {
                const product = inventoryItem.inventory?.product;
                if (!product) return null;

                const isAlreadyAdded = customer.deliveredItems.some(
                  item => item.productId === product.productId
                );

                const totalDelivered = customers.reduce(
                  (sum, cust) => {
                    // Only count unconfirmed deliveries. Confirmed deliveries are accounted for
                    // in the backend's availableQuantity after refetch.
                    if (cust.deliveryConfirmed) return sum;
                    return sum +
                      cust.deliveredItems
                        .filter(item => item.productId === product.productId)
                        .reduce((subSum, item) => subSum + item.qty, 0);
                  },
                  0
                );

                // Use availableQuantity (Net) if present, fallback to TotalPicked (Gross)
                const baseQty = inventoryItem.availableQuantity ?? inventoryItem.totalPickedQuantity ?? 0;
                const availableQty = baseQty - totalDelivered;

                const associatedQty = customerProductRelations.find(
                  rel => rel.customerId === customer.customerId &&
                    rel.productId === product.productId &&
                    rel.thruDate === null
                )?.quantityAssociated || 0;

                const quantityKey = `${customer.customerId}-${product.productId}`;
                // B2C: Pre-fill with associated qty
                // B2B: Empty
                const defaultValue = isB2B ? '' : (associatedQty > 0 ? associatedQty.toString() : '');
                const currentQuantity = associatedProductQuantities[quantityKey] ?? defaultValue;

                return (
                  <View
                    key={`associated-${product.productId}`}
                    style={styles.productItemCard}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <View style={{ width: 60, height: 60, backgroundColor: '#F8F9FA', borderRadius: 8, marginRight: 12, justifyContent: 'center', alignItems: 'center' }}>
                        {product.imageUrl ? (
                          <Image source={{ uri: product.imageUrl }} style={{ width: 50, height: 50 }} resizeMode="contain" />
                        ) : (
                          <Ionicons name="cube-outline" size={30} color="#CBD5E1" />
                        )}
                      </View>
                      <View style={styles.listCardInfo}>
                        <Text style={styles.listCardName}>{product.productName}</Text>
                        <Text style={[styles.listCardDetails, { color: '#3880FF' }]}>
                          Available: {availableQty > 0 ? availableQty : 0}
                        </Text>
                        <Text style={styles.listCardPrice}>
                          ₹ {Number(product.currentProductPrice)}/packet
                        </Text>
                      </View>
                    </View>

                    {!customer.deliveryConfirmed && (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TextInput
                          style={[
                            styles.qtyInputBox,
                          ]}
                          value={currentQuantity}
                          placeholder="0"
                          onChangeText={(text) => {
                            let numText = text.replace(/[^0-9]/g, '');
                            setAssociatedProductQuantities(prev => ({
                              ...prev,
                              [quantityKey]: numText
                            }));
                          }}
                          keyboardType="numeric"
                          maxLength={3}
                        />
                      </View>
                    )}

                    {customer.deliveryConfirmed && isAlreadyAdded && (
                      <View style={styles.listCardActions}>
                        <Ionicons name="checkmark-circle" size={30} color="#10B981" />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Delivered Items Section (Only show if confirmed OR manually added via 'Other Product' modal) */}
            {(customer.deliveryConfirmed || (customer.deliveredItems.length > 0 && !isB2B)) && (
              <View style={{ padding: 16 }}>
                <Text style={styles.sectionTitle}>
                  {customer.deliveryConfirmed ? 'Delivered Summary' : 'Other Products Added'}
                </Text>
                <View style={styles.listContainer}>
                  {customer.deliveredItems.map((item, idx) => (
                    <View key={`delivered-${idx}`} style={[styles.listCard, styles.itemCard, { paddingVertical: 12 }]}>
                      <View style={styles.listCardInfo}>
                        <Text style={styles.listCardName}>{item.name}</Text>
                        {/* Detailed item info row */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                          <TextInput
                            style={[styles.priceInput, { width: 40, textAlign: 'center', height: 30, padding: 0 }]}
                            value={item.qty.toString()}
                            onChangeText={(newQty) => handleItemQuantityChange(idx, newQty)}
                            keyboardType="numeric"
                            editable={!customer.deliveryConfirmed}
                          />
                          <Text style={{ marginHorizontal: 4 }}>×</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text>₹</Text>
                            <TextInput
                              style={[styles.priceInput, { width: 60, height: 30, padding: 0 }]}
                              value={item.price.toString()}
                              onChangeText={(newPrice) => handleItemTotalChange(idx, newPrice)}
                              keyboardType="numeric"
                              editable={!customer.deliveryConfirmed}
                            />
                          </View>
                        </View>
                      </View>
                      {!customer.deliveryConfirmed && (
                        <TouchableOpacity onPress={() => handleRemoveItem(idx)}>
                          <Ionicons name="close-circle" size={24} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}



            {/* Other Product Button */}
            {!customer.deliveryConfirmed && (
              <TouchableOpacity
                style={styles.otherProductButton}
                onPress={() => setProductDeliveryModal(true)}
              >
                <Text style={styles.otherProductButtonText}>
                  Other Product
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Payment Section (B2B only) - Outside the card */}
          {isB2B && !customer.deliveryConfirmed && (
            <View style={[styles.paymentSection, { marginHorizontal: 13, marginTop: 10 }]}>
              <View style={styles.paymentInputContainer}>
                <Text style={{ fontSize: 20, color: '#333', marginRight: 4 }}>₹</Text>
                <TextInput
                  style={styles.paymentInput}
                  value={paymentAmount || totalPayment.toString()}
                  onChangeText={setPaymentAmount}
                  keyboardType="numeric"
                  placeholder="0.00"
                  underlineColorAndroid="transparent"
                />
              </View>

              <TouchableOpacity
                style={styles.collectButton}
                onPress={() => {
                  Toast.show({ type: 'success', text1: 'Payment Marked' });
                }}
              >
                <Text style={styles.collectButtonText}>Collect</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ProductDeliveryModal
        visible={productDeliveryModal}
        customer={customer}
        customers={customers}
        setCustomers={setCustomers as any}
        selectedIdx={selectedIdx}
        workerInventory={getUnassociatedProducts()}
        onClose={() => setProductDeliveryModal(false)}
      />

      <View style={[styles.fixedButtonContainer, { bottom: insets.bottom + 10 }]}>
        <TouchableOpacity
          style={[
            styles.confirmButton,
            { backgroundColor: '#3880FF' },
            processingDelivery && styles.confirmButtonProcessing
          ]}
          onPress={confirmDelivery}
          disabled={processingDelivery}
        >
          <Text style={styles.confirmButtonText}>
            {processingDelivery
              ? 'Processing...'
              : 'Confirm'
            }
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
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
} as const;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  keyboardAvoidingView: {
    flex: 1
  },
  scrollView: {
    flex: 1
  },
  scrollViewContent: {
    paddingBottom: 120
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

  syncBanner: {
    backgroundColor: theme.colors.warning,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: theme.spacing.md,
  },
  syncBannerText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: theme.font.size.xs,
  },
  syncButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
  },
  syncButtonText: {
    color: theme.colors.warning,
    fontWeight: 'bold',
    fontSize: theme.font.size.xs,
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
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    paddingVertical: 10,
  },
  tabs: {
    paddingLeft: 0,
  },
  tab: {
    width: TAB_WIDTH,
    paddingVertical: 12,
    borderRadius: 0,
    backgroundColor: theme.colors.tabInactive,
    alignItems: "center",
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#F0F0F0',
  },
  activeTab: {
    backgroundColor: theme.colors.primary
  },
  confirmedTab: {
    backgroundColor: theme.colors.successLight,
    borderColor: theme.colors.success,
    borderWidth: 1,
  },
  tabText: {
    color: theme.colors.tabInactiveText,
    fontWeight: theme.font.weight.medium,
    fontSize: theme.font.size.sm,
    textAlign: "center",
  },
  activeTabText: {
    color: theme.colors.textOnPrimary,
    fontWeight: theme.font.weight.bold
  },
  confirmedTabText: {
    color: theme.colors.successDark,
    fontWeight: theme.font.weight.bold,
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

  // NEW DESIGN STYLES
  headerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: '#fff',
    zIndex: 1100,
  },
  hamburgerButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  syncButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  menuOverlay: {
    position: 'absolute',
    top: 50,
    right: 16,
    width: 200,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 8,
    zIndex: 1200,
    elevation: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  skipButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginLeft: 16,
    marginBottom: 8,
  },
  skipButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  // STYLES FOR THE NEW CARD DESIGN
  customerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginHorizontal: 13,
    padding: 16,
    // Darker M3/Elevation Light/1 Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
    marginBottom: 20,
  },
  centeredCustomerHeader: {
    alignItems: 'center',
    paddingBottom: 16,
    marginBottom: 16,
  },
  centeredCustomerName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#3880FF',
    textAlign: 'center',
    marginBottom: 8,
  },
  underLine: {
    height: 1,
    backgroundColor: '#CBD5E1', // Darker gray for better definition
    position: 'absolute',
    bottom: 0,
    left: -16,
    right: -16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 }, // Cast shadow further down
    shadowOpacity: 0.15, // Significantly darker shadow
    shadowRadius: 3,
    elevation: 3,
  },
  productItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3880FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  qtyInputBox: {
    textAlign: 'center',
    width: 60,
    height: 40,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  paymentSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    marginTop: 20,
    marginBottom: 10,
  },
  paymentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    width: 140,
  },
  paymentInput: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    flex: 1,
    padding: 0,
    borderWidth: 0,
    // @ts-ignore
    outlineStyle: 'none' as any,
  },
  collectButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  collectButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  otherProductButton: {
    backgroundColor: '#3880FF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  otherProductButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
  },
  fixedButtonContainer: {
    position: "absolute",
    left: 18,
    right: 18,
    zIndex: 100,
  },
  confirmButton: {
    backgroundColor: '#3880FF',
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    elevation: 8,
    shadowColor: '#3880FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  confirmButtonProcessing: {
    backgroundColor: theme.colors.warning,
  },
  confirmButtonText: {
    color: theme.colors.textOnPrimary,
    fontWeight: '800',
    fontSize: 20,
  },
})