"use client"

import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState, useRef, useMemo, useCallback } from "react"
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
  FlatList
} from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import Toast from 'react-native-toast-message'
import NetInfo from '@react-native-community/netinfo'
import apiClient from '../services/apiClient'
import { ProductDeliveryModal } from "./CDS/ProductDeliveryModal"

// New Hooks & Types
import { useCustomerDelivery } from '../hooks/useCustomerDelivery'
import { useOfflineQueue } from '../hooks/useOfflineQueue'
import { CustomerForDelivery, DeliveredItem, CustomerProductRelation, WorkerInventory } from '../types'
import { calculateTotalPayment, calculateTotalQuantity, hasEditedPrices } from '../utils/deliveryCalculations'

const { width } = Dimensions.get('window')

export default function CustomerDeliveryScreen() {
  const router = useRouter()
  const { workerId: workerIdParam } = useLocalSearchParams()
  const insets = useSafeAreaInsets()

  // Use new hooks
  const {
    customers,
    inventory,
    relations: customerProductRelations = [],
    loading: isLoading,
    error: apiError,
    refetchData,
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
      tabListRef.current.scrollToIndex({
        index: selectedIdx,
        animated: true,
        viewPosition: 0.5
      });
    } catch (e) {
      // Ignore specific scroll errors
    }
  }, [selectedIdx, customers]);

  // Initial tab selection
  useEffect(() => {
    if (customers.length > 0 && selectedIdx >= customers.length) {
      setSelectedIdx(0);
    }
  }, [customers]);

  const handleTabPress = (index: number) => {
    setSelectedIdx(index);
  };

  const getAssociatedProducts = useCallback(() => {
    if (!customer || !inventory) return [];

    // Get inventory items that match the customer's associated products
    const directAssociations = inventory.filter(inv =>
      customer.associatedProductIds?.includes(inv.inventory.product.productId)
    );

    return directAssociations;
  }, [customer, inventory]);

  const handleDeliveryConfirm = async () => {
    if (!customer) return;

    if (customer.deliveredItems.length === 0) {
      Alert.alert('No Items', 'Please add at least one item to confirm delivery.');
      return;
    }

    setProcessingDelivery(true);
    let allSuccessful = true;
    let anySuccessful = false;

    try {
      const totalAmount = calculateTotalPayment(customer.deliveredItems);

      for (const item of customer.deliveredItems) {
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

          // Fallback: Add individual item to offline queue
          await addToOfflineQueue('delivery', itemPayload, `del_${customer.customerId}_${item.productId}_${Date.now()}`);
          allSuccessful = false;
        }
      }

      if (allSuccessful) {
        Toast.show({
          type: 'success',
          text1: 'Delivery Confirmed',
          text2: 'All items submitted successfully (Online)',
        });
      } else if (anySuccessful) {
        Toast.show({
          type: 'info',
          text1: 'Partial Success',
          text2: 'Some items saved offline for later sync',
        });
      } else {
        Toast.show({
          type: 'info',
          text1: 'Saved Offline',
          text2: 'Network unavailable, delivery queued for sync',
        });
      }

      // Mark as confirmed locally regardless (Optimistic UI)
      const updatedCustomers = [...customers];
      updatedCustomers[selectedIdx] = {
        ...updatedCustomers[selectedIdx],
        deliveryConfirmed: true,
        paymentReceived: totalAmount
      };
      setCustomers(updatedCustomers);

      // Persist optimistic update to cache
      AsyncStorage.setItem('offline_customers', JSON.stringify(updatedCustomers));

    } catch (error) {
      console.error('Error confirming delivery:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to save delivery',
      });
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
    const totalPicked = inventoryItem?.totalPickedQuantity || 0;

    const totalDeliveredByAll = customers.reduce((sum, cust) => {
      if (cust.id === customer.id) {
        return sum + cust.deliveredItems.filter(i => i.productId === itemToUpdate.productId && i !== itemToUpdate).reduce((s, i) => s + i.qty, 0);
      }
      return sum + cust.deliveredItems.filter(i => i.productId === itemToUpdate.productId).reduce((s, i) => s + i.qty, 0);
    }, 0);

    const maxAvailable = totalPicked - totalDeliveredByAll;

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
    const hasDeliveredItems = customer.deliveredItems.length > 0;

    if (selectedIdx === customers.length - 1) {
      if (hasDeliveredItems && !customer.deliveryConfirmed) {
        await handleDeliveryConfirm();
      }

      const deliveryData = customers.map(c => ({
        customerId: c.customerId,
        deliveredItems: c.deliveredItems,
        paymentReceived: c.paymentReceived,
        deliveryConfirmed: c.deliveryConfirmed
      }));
      const totalPayments = customers.reduce((sum, c) => sum + c.paymentReceived, 0);

      router.push({
        pathname: "/CashDetailsScreen",
        params: {
          deliveryData: JSON.stringify(deliveryData),
          totalPayments: totalPayments.toString()
        }
      });
      return;
    }

    if (hasDeliveredItems && !customer.deliveryConfirmed) {
      await handleDeliveryConfirm();
    } else if (!hasDeliveredItems) {
      Toast.show({ type: 'info', text1: 'Skipping' });
    }

    setSelectedIdx(selectedIdx + 1);
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
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />

      {offlineQueueCount > 0 && (
        <View style={styles.syncBanner}>
          <Text style={styles.syncBannerText}>
            ⚠️ {offlineQueueCount} items waiting to sync
          </Text>
          <TouchableOpacity
            style={styles.syncButton}
            onPress={syncOfflineQueue}
            disabled={isSyncing}
          >
            <Text style={styles.syncButtonText}>
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.progressHeader}>
        <Text style={styles.progressText}>
          Delivery {progress.completed + 1} of {progress.total}
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${((progress.completed) / progress.total) * 100}%` }]}
          />
        </View>
      </View>

      <View style={styles.tabsContainer}>
        <FlatList
          ref={tabListRef}
          data={customers}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabs}
          keyExtractor={(item) => item.id}
          initialScrollIndex={0}
          onScrollToIndexFailed={info => {
            const wait = new Promise(resolve => setTimeout(resolve, 500));
            wait.then(() => {
              tabListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            });
          }}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[
                styles.tab,
                selectedIdx === index && styles.activeTab,
                item.deliveryConfirmed && styles.confirmedTab
              ]}
              onPress={() => handleTabPress(index)}
            >
              <Text style={[
                styles.tabText,
                selectedIdx === index && styles.activeTabText,
                item.deliveryConfirmed && styles.confirmedTabText
              ]}>
                {item.deliveryConfirmed ? '✓ ' : ''}{item.name}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent}>
          <View style={styles.card}>

            <View style={styles.customerCard}>
              <View style={styles.customerHeader}>
                <Text style={styles.customerName}>{customer.name}</Text>
                {customer.deliveryConfirmed && (
                  <View style={styles.confirmedBadge}>
                    <Text style={styles.confirmedBadgeText}>✓</Text>
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
                    const currentQuantity = associatedProductQuantities[quantityKey] || (associatedQty > 0 ? associatedQty.toString() : '')

                    return (
                      <View
                        key={`associated-${product.productId}`}
                        style={[
                          styles.listCard,
                          styles.catalogCard,
                          isAlreadyAdded && styles.catalogCardAdded,
                          (availableQty <= 0 || customer.deliveryConfirmed) && styles.catalogCardDisabled
                        ]}
                      >
                        <View style={styles.listCardInfo}>
                          <Text style={styles.listCardName}>{product.productName}</Text>
                          <Text style={styles.listCardDetails} numberOfLines={1}>
                            {isAlreadyAdded ? '✓ Added' : `Available: ${availableQty > 0 ? availableQty : 0}`}
                          </Text>
                          <Text style={styles.listCardPrice} numberOfLines={1}>
                            ₹{Number(product.currentProductPrice)}/packet
                          </Text>
                        </View>

                        {!isAlreadyAdded && availableQty > 0 && !customer.deliveryConfirmed && (
                          <View style={styles.listCardActions}>
                            <View style={styles.priceInputContainer}>
                              <TextInput
                                style={[styles.priceInput, { textAlign: 'center', width: 50 }]}
                                value={currentQuantity}
                                placeholder={associatedQty > 0 ? associatedQty.toString() : '0'}
                                onChangeText={(text) => {
                                  let numText = text.replace(/[^0-9]/g, '');

                                  if (numText === '') {
                                    setAssociatedProductQuantities(prev => ({
                                      ...prev,
                                      [quantityKey]: '0'
                                    }));
                                    return;
                                  }

                                  if (numText.length > 1 && numText.startsWith('0')) {
                                    numText = numText.substring(1);
                                  }

                                  const numValue = parseInt(numText);

                                  if (!isNaN(numValue) && numValue <= availableQty) {
                                    setAssociatedProductQuantities(prev => ({
                                      ...prev,
                                      [quantityKey]: numValue.toString()
                                    }));
                                  }
                                }}
                                keyboardType="numeric"
                                maxLength={3}
                              />
                            </View>
                            <TouchableOpacity
                              style={[
                                styles.addButton,
                                ((parseInt(currentQuantity) || 0) <= 0 || (parseInt(currentQuantity) || 0) > availableQty)
                                && styles.addButtonDisabled
                              ]}
                              onPress={() => {
                                const qty = parseInt(currentQuantity) || 0
                                if (qty > 0 && qty <= availableQty) {
                                  handleAddAssociatedProduct(inventoryItem, qty)
                                }
                              }}
                              disabled={(parseInt(currentQuantity) || 0) <= 0 || (parseInt(currentQuantity) || 0) > availableQty}
                            >
                              <Text style={styles.addButtonText}>Add</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {isAlreadyAdded && (
                          <View style={styles.listCardActions}>
                            <View style={styles.addedBadge}>
                              <Text style={styles.addedBadgeText}>✓</Text>
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
                              { textAlign: 'center', width: 50 },
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
                  Grand Total: ₹{totalPayment}
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
        setCustomers={setCustomers as any}
        selectedIdx={selectedIdx}
        workerInventory={getUnassociatedProducts()}
        onClose={() => setProductDeliveryModal(false)}
      />

      <View style={[styles.fixedButtonContainer, { bottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={[
            styles.confirmButton,
            processingDelivery && styles.confirmButtonProcessing
          ]}
          onPress={confirmDelivery}
          disabled={processingDelivery}
        >
          <Text style={styles.confirmButtonText}>
            {processingDelivery
              ? 'Processing...'
              : selectedIdx === customers.length - 1
                ? 'Complete All Deliveries'
                : 'Confirm & Next Customer'
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
    paddingBottom: 100
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
    paddingLeft: theme.spacing.md,
  },
  tab: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
    marginRight: theme.spacing.sm,
    backgroundColor: theme.colors.tabInactive,
    alignItems: "center",
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