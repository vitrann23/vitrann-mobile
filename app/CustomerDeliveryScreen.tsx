"use client";

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import apiClient from "../services/apiClient";
import { getProductImageSource } from "../utils/productImages";
import { ProductDeliveryModal } from "./CDS/ProductDeliveryModal";

// New Hooks & Types
import { useCustomerDelivery } from "../hooks/useCustomerDelivery";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { DeliveredItem, WorkerInventory } from "../types";
import { calculateTotalPayment } from "../utils/deliveryCalculations";

const { width } = Dimensions.get("window");
const TAB_WIDTH = width / 3;

export default function CustomerDeliveryScreen() {
  const router = useRouter();
  const { workerId: workerIdParam } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // Use new hooks
  const {
    customers,
    inventory,
    relations: customerProductRelations = [],
    loading: isLoading,
    error: apiError,
    refetchData,
    refreshing,
    setCustomers,
  } = useCustomerDelivery();

  const markAsPaid = (customerId: number) => {
    setCustomers((prev) => {
      const updated = prev.map((c) =>
        c.customerId === customerId ? { ...c, isPaid: true } : c,
      );
      // Persist to local storage
      AsyncStorage.setItem("offline_customers", JSON.stringify(updated)).catch(
        (err) => console.error("Failed to save offline_customers", err),
      );
      return updated;
    });
  };

  const {
    queueSize: offlineQueueCount,
    isSyncing,
    addToQueue: addToOfflineQueue,
    syncQueue: syncOfflineQueue,
  } = useOfflineQueue();

  // Local state for UI
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [processingDelivery, setProcessingDelivery] = useState(false);

  // Additional UI state
  const [associatedProductQuantities, setAssociatedProductQuantities] =
    useState<Record<string, string>>({});
  const [productDeliveryModal, setProductDeliveryModal] = useState(false); // For modal visibility
  const [menuVisible, setMenuVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [manualB2bPayment, setManualB2bPayment] = useState<string | null>(null);
  const [currentWorkerName, setCurrentWorkerName] = useState("");
  const [confirmationVisible, setConfirmationVisible] = useState(false);

  // Refs for tabs
  const tabListRef = useRef<FlatList>(null);
  const { width: screenWidth } = Dimensions.get("window");

  // Derived state
  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.includes(searchQuery),
    );
  }, [customers, searchQuery]);

  const customer = filteredCustomers[selectedIdx];
  const isB2B = customer?.type === "B2B";

  // Scroll to tab when selected
  useEffect(() => {
    if (customers.length === 0 || !tabListRef.current) return;
    try {
      // Small timeout to ensure layout is ready after selection change
      setTimeout(() => {
        tabListRef.current?.scrollToIndex({
          index: selectedIdx,
          animated: true,
          viewPosition: 0.5,
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
      const firstPendingIdx = customers.findIndex((c) => !c.deliveryConfirmed);
      if (firstPendingIdx !== -1) {
        setSelectedIdx(firstPendingIdx);
      }
      hasInitialJumped.current = true; // Mark as done so we don't jump while user is browsing
    }
  }, [customers]);

  useEffect(() => {
    setManualB2bPayment(null); // Reset manual payment field on customer change
  }, [selectedIdx]);

  useEffect(() => {
    const getWorkerName = async () => {
      const name = await AsyncStorage.getItem("workerName");
      if (name) setCurrentWorkerName(name);
    };
    getWorkerName();
  }, []);

  // Persist associatedProductQuantities so they survive navigation
  useEffect(() => {
    if (Object.keys(associatedProductQuantities).length === 0) return;
    AsyncStorage.setItem(
      `assoc_qty_${workerIdParam}`,
      JSON.stringify(associatedProductQuantities),
    ).catch(() => {});
  }, [associatedProductQuantities]);

  // Restore associatedProductQuantities on mount
  useEffect(() => {
    AsyncStorage.getItem(`assoc_qty_${workerIdParam}`)
      .then((val) => {
        if (val) setAssociatedProductQuantities(JSON.parse(val));
      })
      .catch(() => {});
  }, []);

  const handleTabPress = (index: number) => {
    setSelectedIdx(index);
  };

  const handleLogout = async () => {
    try {
      if (Platform.OS === "web") {
        await AsyncStorage.removeItem("authToken");
        await AsyncStorage.removeItem("workerId");
      } else {
        await SecureStore.deleteItemAsync("authToken");
        await SecureStore.deleteItemAsync("workerId");
      }
      router.replace("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const getAssociatedProducts = useCallback(() => {
    if (!customer || !inventory) return [];

    // Get inventory items that match the customer's associated products
    const directAssociations = inventory.filter((inv) =>
      customer.associatedProductIds?.includes(inv.inventory.product.productId),
    );

    return directAssociations;
  }, [customer, inventory]);

  const handleDeliveryConfirm = async (forcedItems?: DeliveredItem[]) => {
    if (!customer) return;

    const itemsToDeliver = forcedItems || customer.deliveredItems;

    if (itemsToDeliver.length === 0) {
      Alert.alert(
        "No Items",
        "Please add at least one item to confirm delivery.",
      );
      return;
    }

    setProcessingDelivery(true);
    let allSuccessful = true;
    let anySuccessful = false;

    try {
      const totalAmount = calculateTotalPayment(itemsToDeliver);

      for (const item of itemsToDeliver) {
        // Find corresponding inventoryId from worker's inventory
        const inventoryItem = (inventory || []).find(
          (inv) => inv.inventory?.product?.productId === item.productId,
        );

        if (!inventoryItem) {
          console.error(`Inventory ID not found for product ${item.productId}`);
          allSuccessful = false;
          continue;
        }

        const billAmount = item.price;

        if (item.qty < 0 || billAmount <= 0) {
          Alert.alert(
            "Invalid Entry",
            `Delivery quantity must be >= 0 and bill amount must be > 0 for ${item.name}.`,
          );
          setProcessingDelivery(false);
          return;
        }

        const itemPayload = {
          customerId: customer.customerId,
          inventoryId: inventoryItem.inventoryId,
          deliveredQuantity: item.qty,
          billAmount: billAmount,
          isPriceCustomized: item.isEdited,
        };

        try {
          // Always try direct API call first
          const response = (await apiClient.post(
            "/deliveries/process",
            itemPayload,
          )) as any;

          if (response.success) {
            anySuccessful = true;
          } else {
            throw new Error(response.message || "Server rejected delivery");
          }
        } catch (error) {
          console.log(
            `Online submission failed for item ${item.productId}, falling back to offline queue:`,
            error,
          );
          await addToOfflineQueue(
            "delivery",
            itemPayload,
            `del_${customer.customerId}_${item.productId}_${Date.now()}`,
          );
          allSuccessful = false;
        }
      }

      if (allSuccessful) {
        setConfirmationVisible(true);
        setTimeout(() => setConfirmationVisible(false), 1000);
      } else if (anySuccessful) {
        Toast.show({
          type: "info",
          text1: "Partial Success",
          text2: "Some items saved offline",
          visibilityTime: 2000,
        });
      } else {
        Toast.show({
          type: "info",
          text1: "Saved Offline",
          text2: "Delivery queued for sync",
          visibilityTime: 2000,
        });
      }

      // Auto-collect for B2B if not already paid
      if (isB2B && !customer.isPaid && totalAmount > 0) {
        // Optimistic: Update UI immediately
        markAsPaid(customer.customerId);

        // Background API call
        apiClient
          .post("/deliveries/b2b-payment", {
            customerId: customer.customerId,
            amount: totalAmount,
          })
          .catch((err) => {
            console.error("Auto-collect background failure:", err);
            // We'll keep the UI as 'Paid' to avoid confusing the user
          });
      }

      const finalPaidStatus = customer.isPaid || (isB2B && totalAmount > 0);

      // Mark as confirmed locally regardless (Optimistic UI)
      const updatedCustomers = [...customers];
      updatedCustomers[selectedIdx] = {
        ...updatedCustomers[selectedIdx],
        deliveredItems: itemsToDeliver,
        deliveryConfirmed: true,
        paymentReceived: totalAmount,
        isPaid: finalPaidStatus,
      };
      setCustomers(updatedCustomers);
      await AsyncStorage.setItem(
        "offline_customers",
        JSON.stringify(updatedCustomers),
      );

      // Invalidate inventory cache to fetch latest availableQuantity
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    } catch (error) {
      console.error("Error confirming delivery:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to save delivery",
        visibilityTime: 2000,
      });
    } finally {
      setProcessingDelivery(false);
    }
  };

  const handleAddProduct = (
    product: any,
    qty: number,
    price: number,
    isCustom: boolean = false,
  ) => {
    if (!customer) return;

    // Check duplication
    if (
      customer.deliveredItems.some(
        (item) => item.productId === product.productId,
      )
    ) {
      Toast.show({
        type: "info",
        text1: "Item already added",
        visibilityTime: 1500,
      });
      return;
    }

    const newItem: DeliveredItem = {
      productId: product.productId,
      name: product.productName,
      qty,
      price: price,
      originalPrice: isCustom ? price / qty : product.currentProductPrice,
      isEdited: isCustom || price !== product.currentProductPrice * qty,
    };

    const updatedCustomers = [...customers];
    updatedCustomers[selectedIdx] = {
      ...updatedCustomers[selectedIdx],
      deliveredItems: [
        ...updatedCustomers[selectedIdx].deliveredItems,
        newItem,
      ],
    };
    setCustomers(updatedCustomers);
  };

  const handleRemoveProduct = (productId: number) => {
    if (!customer) return;

    const updatedCustomers = [...customers];
    updatedCustomers[selectedIdx] = {
      ...updatedCustomers[selectedIdx],
      deliveredItems: updatedCustomers[selectedIdx].deliveredItems.filter(
        (item) => item.productId !== productId,
      ),
    };
    setCustomers(updatedCustomers);
  };

  const getDeliveryProgress = () => {
    const completed = customers.filter((c) => c.deliveryConfirmed).length;
    const total = customers.length;
    return { completed, total };
  };

  const getUnassociatedProducts = useCallback(() => {
    if (!customer || !inventory) return [];

    // If no associations, return all available inventory
    if (
      !customer.associatedProductIds ||
      customer.associatedProductIds.length === 0
    ) {
      return inventory.filter((item) => (item.totalPickedQuantity || 0) > 0);
    }

    // Otherwise filter out associated products
    return inventory.filter((item) => {
      const productId = item.inventory?.product.productId;
      return (
        productId &&
        !customer.associatedProductIds?.includes(productId) &&
        (item.totalPickedQuantity || 0) > 0
      );
    });
  }, [customer, inventory]);

  const hasUnassociatedProducts = () => getUnassociatedProducts().length > 0;

  const handleAddAssociatedProduct = (
    inventoryItem: WorkerInventory,
    quantity?: number,
  ) => {
    if (!inventoryItem.inventory?.product || !customer) return;
    const product = inventoryItem.inventory.product;

    // Check duplication
    if (
      customer.deliveredItems.some(
        (item) => item.productId === product.productId,
      )
    ) {
      Toast.show({
        type: "info",
        text1: "Item already added",
        visibilityTime: 2000,
      });
      return;
    }

    const availableQty = inventoryItem.totalPickedQuantity || 0;

    // Calculate availability (subtracting what others took)
    const totalDeliveredByAll = customers.reduce((sum, cust) => {
      if (cust.id === customer.id) return sum; // exclude current
      return (
        sum +
        cust.deliveredItems
          .filter((item) => item.productId === product.productId)
          .reduce((s, i) => s + i.qty, 0)
      );
    }, 0);

    const availableForThisProduct = availableQty - totalDeliveredByAll;

    if (availableForThisProduct <= 0) {
      Toast.show({
        type: "error",
        text1: "Out of Stock",
        text2: `${product.productName} is out of stock`,
        visibilityTime: 2000,
      });
      return;
    }

    const qtyToAdd = quantity || 1;
    if (qtyToAdd > availableForThisProduct) {
      Toast.show({
        type: "error",
        text1: "Not Enough Stock",
        text2: `Only ${availableForThisProduct} available`,
        visibilityTime: 2000,
      });
      return;
    }

    const priceInfo = customer.associatedProductPrices?.[product.productId];
    const effectivePrice = priceInfo
      ? priceInfo.price
      : Number(product.currentProductPrice);
    const isCustom = priceInfo?.isCustom || false;

    handleAddProduct(product, qtyToAdd, effectivePrice * qtyToAdd, isCustom);
  };

  const handleItemTotalChange = (itemIndex: number, newTotal: string) => {
    const totalAmount = Number(newTotal) || 0;
    if (!customer) return;

    const updatedCustomers = [...customers];
    const updatedItems = [...customer.deliveredItems];
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      price: totalAmount,
      isEdited: true,
    };

    updatedCustomers[selectedIdx] = {
      ...updatedCustomers[selectedIdx],
      deliveredItems: updatedItems,
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

    const inventoryItem = inventory?.find(
      (inv) => inv.inventory?.product.productId === itemToUpdate.productId,
    );
    // Use availableQuantity (Net) if present, fallback to TotalPicked (Gross)
    const baseQty =
      inventoryItem?.availableQuantity ??
      inventoryItem?.totalPickedQuantity ??
      0;

    const totalDeliveredByAll = customers.reduce((sum, cust) => {
      // Only count UNCONFIRMED deliveries in this subtraction.
      // Confirmed ones are already deducted from 'availableQuantity' by the backend.
      if (cust.deliveryConfirmed) return sum;

      if (cust.id === customer.id) {
        return (
          sum +
          cust.deliveredItems
            .filter(
              (i) =>
                i.productId === itemToUpdate.productId && i !== itemToUpdate,
            )
            .reduce((s, i) => s + i.qty, 0)
        );
      }
      return (
        sum +
        cust.deliveredItems
          .filter((i) => i.productId === itemToUpdate.productId)
          .reduce((s, i) => s + i.qty, 0)
      );
    }, 0);

    const maxAvailable = Math.max(0, baseQty - totalDeliveredByAll);

    if (newQuantity > maxAvailable && newQuantity !== 0) {
      Toast.show({
        type: "error",
        text1: "Not Enough Stock",
        text2: `Only ${maxAvailable} available`,
        visibilityTime: 2000,
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
      ...updatedCustomers[selectedIdx],
      deliveredItems: updatedItems,
    };
    setCustomers(updatedCustomers);
  };

  const handleRemoveItem = (itemIndex: number) => {
    if (!customer) return;
    const updatedCustomers = [...customers];
    const updatedItems = customer.deliveredItems.filter(
      (_, idx) => idx !== itemIndex,
    );

    updatedCustomers[selectedIdx] = {
      ...updatedCustomers[selectedIdx],
      deliveredItems: updatedItems,
    };
    setCustomers(updatedCustomers);
    Toast.show({ type: "info", text1: "Item Removed", visibilityTime: 2000 });
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

      const associatedQty =
        customerProductRelations.find(
          (rel) =>
            rel.customerId === customer.customerId &&
            rel.productId === product.productId &&
            rel.thruDate === null,
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
          return (
            sum +
            cust.deliveredItems
              .filter((item) => item.productId === product.productId)
              .reduce((s, i) => s + i.qty, 0)
          );
        }, 0);

        const baseQty =
          invItem.availableQuantity ?? invItem.totalPickedQuantity ?? 0;
        const availableNow = baseQty - totalDeliveredByAllPending;

        if (qty > availableNow) {
          Toast.show({
            type: "error",
            text1: "Insufficient Stock",
            text2: `${product.productName}: Needed ${qty}, Available ${availableNow}. Please Add or Purchase more stock.`,
            visibilityTime: 4000,
          });
          return; // Stop the whole confirmation
        }

        const isAlreadyIncluded = finalItemsToDeliver.some(
          (item) => item.productId === product.productId,
        );
        if (!isAlreadyIncluded) {
          const priceInfo =
            customer.associatedProductPrices?.[product.productId];
          const effectivePrice = priceInfo
            ? priceInfo.price
            : Number(product.currentProductPrice);
          const isCustom = priceInfo?.isCustom || false;

          finalItemsToDeliver.push({
            productId: product.productId,
            name: product.productName,
            qty: qty,
            price: effectivePrice * qty,
            originalPrice: effectivePrice,
            isEdited: isCustom,
          });
        }
      }
    }

    if (finalItemsToDeliver.length === 0) {
      if (selectedIdx < customers.length - 1) {
        Toast.show({ type: "info", text1: "Skipping", visibilityTime: 2000 });
        setSelectedIdx(selectedIdx + 1);
      } else {
        // Last customer - navigate to cash details anyway?
        router.push({
          pathname: "/CashDetailsScreen",
          params: {
            deliveryData: JSON.stringify(
              customers.map((c) => ({
                customerId: c.customerId,
                deliveredItems: c.deliveredItems,
                paymentReceived: c.paymentReceived,
                deliveryConfirmed: c.deliveryConfirmed,
              })),
            ),
            totalPayments: customers
              .reduce((sum, c) => sum + c.paymentReceived, 0)
              .toString(),
          },
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
        paymentReceived: totalAmount,
      };

      const deliveryData = currentCustomers.map((c) => ({
        customerId: c.customerId,
        deliveredItems: c.deliveredItems,
        paymentReceived: c.paymentReceived,
        deliveryConfirmed: c.deliveryConfirmed,
      }));
      const totalPayments = currentCustomers.reduce(
        (sum, c) => sum + c.paymentReceived,
        0,
      );

      router.push({
        pathname: "/CashDetailsScreen",
        params: {
          deliveryData: JSON.stringify(deliveryData),
          totalPayments: totalPayments.toString(),
        },
      });
    } else {
      setSelectedIdx(selectedIdx + 1);
    }
  };

  // Compatibility aliases for render
  const loading = isLoading;
  const error = apiError
    ? (apiError as any).message || "An error occurred"
    : null;
  const fetchDataFromAPI = refetchData;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading delivery route...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || customers.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {error || "No customers assigned"}
          </Text>

          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchDataFromAPI}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const progress = getDeliveryProgress();

  // Calculate total payment including both delivered items and associated products
  const calculateTotalPaymentWithAssociated = () => {
    let total = calculateTotalPayment(customer.deliveredItems);

    // Add payment for associated products that have quantities entered
    getAssociatedProducts().forEach((inventoryItem) => {
      const product = inventoryItem.inventory?.product;
      if (!product) return;

      const quantityKey = `${customer.customerId}-${product.productId}`;
      const enteredQty =
        parseInt(associatedProductQuantities[quantityKey]) || 0;

      if (enteredQty > 0) {
        const price =
          customer.associatedProductPrices?.[product.productId]?.price ||
          Number(product.currentProductPrice);
        total += price * enteredQty;
      }
    });

    return total;
  };

  const isDeliveryValid = () => {
    if (!customer) return false;
    const associatedProducts = getAssociatedProducts();
    for (const invItem of associatedProducts) {
      const product = invItem.inventory?.product;
      if (!product) continue;
      const quantityKey = `${customer.customerId}-${product.productId}`;
      const enteredQty = associatedProductQuantities[quantityKey];
      const associatedQty = customerProductRelations.find(rel => rel.customerId === customer.customerId && rel.productId === product.productId && rel.thruDate === null)?.quantityAssociated || 0;
      let qty = enteredQty !== undefined ? parseInt(enteredQty) || 0 : (!isB2B ? associatedQty : 0);
      if (qty > 0) {
        const totalDeliveredByAllPending = customers.reduce((sum, cust) => cust.deliveryConfirmed ? sum : sum + cust.deliveredItems.filter(item => item.productId === product.productId).reduce((s, i) => s + i.qty, 0), 0);
        const baseQty = invItem.availableQuantity ?? invItem.totalPickedQuantity ?? 0;
        if (qty > baseQty - totalDeliveredByAllPending) return false;
      }
    }
    return true;
  };

  const totalPayment = calculateTotalPaymentWithAssociated();
  const effectiveTotalPayment = manualB2bPayment !== null ? parseFloat(manualB2bPayment) || 0 : totalPayment;

  const associatedProducts = getAssociatedProducts();
  // Deduplicate: remove associated items already present in deliveredItems
  const deliveredProductIds = new Set(
    customer.deliveredItems.map((i) => i.productId),
  );
  const allProducts = [
    ...associatedProducts
      .filter(
        (inv) => !deliveredProductIds.has(inv.inventory?.product?.productId),
      )
      .map((inv) => ({
        type: "associated",
        inventoryItem: inv,
        deliveredItem: null,
      })),
    ...customer.deliveredItems.map((item) => ({
      type: "delivered",
      inventoryItem: null,
      deliveredItem: item,
    })),
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header Top Bar */}
      <View style={styles.headerTopBar}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => {
            Toast.show({
              type: "info",
              text1: "Skipping Delivery",
              visibilityTime: 1500,
            });
            if (selectedIdx < customers.length - 1) {
              setSelectedIdx(selectedIdx + 1);
            }
          }}
        >
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
        {/* <TouchableOpacity
          style={styles.syncButton}
          onPress={refetchData}
          disabled={refreshing}
        >
          <Ionicons
            name="refresh"
            size={24}
            color={refreshing ? "#999" : "#3880FF"}
          />
        </TouchableOpacity> */}

        <TouchableOpacity
          style={styles.hamburgerButton}
          onPress={() => setMenuVisible(!menuVisible)}
        >
          <Ionicons name="menu" size={30} color="#757575" />
        </TouchableOpacity>

        {menuVisible && (
          <View style={styles.menuOverlay}>
            {["Add", "Transfer", "Purchase", "Finish", "Logout"].map((item) => (
              <TouchableOpacity
                key={item}
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  if (item === "Logout") {
                    handleLogout();
                  } else if (item === "Finish") {
                    router.push({
                      pathname: "/CashDetailsScreen",
                      params: {
                        deliveryData: JSON.stringify(customers.map(c => ({
                          customerId: c.customerId,
                          deliveredItems: c.deliveredItems,
                          paymentReceived: c.paymentReceived,
                          deliveryConfirmed: c.deliveryConfirmed,
                        }))),
                        totalPayments: customers.reduce((sum, c) => sum + c.paymentReceived, 0).toString(),
                      },
                    });
                  } else if (["Add", "Transfer", "Purchase"].includes(item)) {
                    router.push({
                      pathname: "/InventoryManagementScreen",
                      params: {
                        customerName: customer?.name || "",
                        workerName: currentWorkerName,
                        initialTab: item.toUpperCase(), // Pass TAB: ADD, TRANSFER, PURCHASE
                      },
                    });
                  }
                }}
              >
                <Text
                  style={[
                    styles.menuItemText,
                    item === "Logout" && { color: "#EF4444" },
                  ]}
                >
                  {item}
                </Text>
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
          renderItem={({ item, index }) => {
            const isSelected = selectedIdx === index;
            const isConfirmed = item.deliveryConfirmed;
            const isFuture = index > selectedIdx;

            return (
              <TouchableOpacity
                style={[
                  styles.tab,
                  isConfirmed && styles.confirmedTab,
                  isSelected && styles.activeTab,
                  isSelected && isConfirmed && styles.activeConfirmedTab,
                  isFuture && styles.futureTab,
                ]}
                onPress={() => handleTabPress(index)}
              >
                <Text
                  style={[
                    styles.tabText,
                    isSelected && styles.activeTabText,
                    isConfirmed && !isSelected && styles.confirmedTabText,
                    isFuture && { color: "#94A3B8" }, // Faded gray for future
                  ]}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollViewContent,
            { paddingBottom: 100 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.customerCard}>
            {/* Centered Customer Header */}
            <View style={styles.centeredCustomerHeader}>
              <Text style={styles.centeredCustomerName}>{customer.name}</Text>
              <View style={styles.underLine} />
            </View>

            {/* Other Product Button */}
            {!customer.deliveryConfirmed && (
              <TouchableOpacity
                style={styles.otherProductButton}
                onPress={() => setProductDeliveryModal(true)}
              >
                <Text style={styles.otherProductButtonText}>Other Product</Text>
                <View style={styles.iconCircle}>
                  <Ionicons name="add" size={20} color="#757575" />
                </View>
              </TouchableOpacity>
            )}

            {/* Products List - Morning Stock Style */}
            <View style={styles.productsListWrapper}>
              <ScrollView
                contentContainerStyle={styles.productsListContainer}
                showsVerticalScrollIndicator={false}
              >
                {allProducts.map((item, idx) => {
                  const isAssociated = item.type === "associated";
                  const inventoryItem = item.inventoryItem;
                  const deliveredItem = item.deliveredItem;
                  const product = isAssociated
                    ? inventoryItem?.inventory?.product
                    : inventory?.find(
                        (inv) =>
                          inv.inventory?.product.productId ===
                          deliveredItem?.productId,
                      )?.inventory?.product;
                  if (!product) return null;
                  const inventoryItemForProduct = inventory?.find(
                    (inv) =>
                      inv.inventory?.product.productId === product.productId,
                  );
                  const totalDeliveredByOthers = customers.reduce(
                    (sum, cust) => {
                      if (cust.deliveryConfirmed) return sum;
                      if (cust.id === customer.id) return sum; // EXCLUDE current customer
                      return (
                        sum +
                        cust.deliveredItems
                          .filter((i) => i.productId === product.productId)
                          .reduce((subSum, i) => subSum + i.qty, 0)
                      );
                    },
                    0,
                  );

                  // For delivered items, exclude the current item being edited; for associated, don't subtract anything
                  const currentCustomerDeliveredExcludingCurrent = isAssociated
                    ? 0 // Associated products aren't in deliveredItems yet
                    : customer.deliveredItems
                        .filter(
                          (i) =>
                            i.productId === product.productId &&
                            i !== deliveredItem, // Exclude the current item being edited
                        )
                        .reduce((sum, i) => sum + i.qty, 0);

                  const baseQty =
                    inventoryItemForProduct?.availableQuantity ??
                    inventoryItemForProduct?.totalPickedQuantity ??
                    0;
                  const availableQty = Math.max(
                    0,
                    baseQty -
                      totalDeliveredByOthers -
                      currentCustomerDeliveredExcludingCurrent,
                  );
                  const associatedQty = isAssociated
                    ? customerProductRelations.find(
                        (rel) =>
                          rel.customerId === customer.customerId &&
                          rel.productId === product.productId &&
                          rel.thruDate === null,
                      )?.quantityAssociated || 0
                    : 0;
                  const quantityKey = `${customer.customerId}-${product.productId}`;
                  const defaultValue = isB2B
                    ? ""
                    : associatedQty > 0
                      ? associatedQty.toString()
                      : "";
                  const currentQuantity = isAssociated
                    ? (associatedProductQuantities[quantityKey] ?? defaultValue)
                    : deliveredItem?.qty.toString();
                  const priceValue = isAssociated
                    ? (
                        customer.associatedProductPrices?.[product.productId]
                          ?.price || Number(product.currentProductPrice)
                      ).toString()
                    : deliveredItem?.price.toString();
                  const isAlreadyAdded = customer.deliveredItems.some(
                    (d) => d.productId === product.productId,
                  );
                  const deliveredIndex = customer.deliveredItems.findIndex(
                    (d) => d.productId === deliveredItem?.productId,
                  );

                  return (
                    <View
                      key={
                        isAssociated
                          ? `associated-${product.productId}`
                          : `delivered-${deliveredItem?.productId}`
                      }
                      style={[
                        styles.productRow,
                        idx === allProducts.length - 1 && styles.lastRowStyle,
                        parseInt(currentQuantity || "") === 0 && {
                          opacity: 0.5,
                        },
                      ]}
                    >
                      {/* Image */}
                      <View style={styles.imageWrapper}>
                        {(() => {
                          const productImageSource = getProductImageSource({
                            productName: product.productName,
                            imageUrl: product.imageUrl,
                          });

                          if (productImageSource) {
                            return (
                              <Image
                                source={productImageSource}
                                style={styles.productImage}
                                resizeMode="contain"
                              />
                            );
                          }

                          return (
                            <View
                              style={[
                                styles.productImage,
                                {
                                  justifyContent: "center",
                                  alignItems: "center",
                                },
                              ]}
                            >
                              <Ionicons
                                name="cube-outline"
                                size={30}
                                color="#CBD5E1"
                              />
                            </View>
                          );
                        })()}
                      </View>

                      {/* Text Info */}
                      <View style={styles.textWrapper}>
                        <Text>{product.productName}</Text>
                        <Text>
                          Available: {availableQty > 0 ? availableQty : 0}
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginTop: 4,
                          }}
                        >
                          <Text style={{ fontSize: 12, color: "#64748B" }}>
                            ₹
                          </Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: "#64748B",
                              marginLeft: 2,
                            }}
                          >
                            {priceValue}/packet
                          </Text>
                        </View>
                      </View>

                      {/* Quantity Input */}
                      {!customer.deliveryConfirmed && (
                        <View style={styles.inputWrapper}>
                          <TextInput
                            style={styles.input}
                            value={currentQuantity}
                            placeholder="Other Product v2"
                            placeholderTextColor="#999"
                            onChangeText={(text) => {
                              let numText = text.replace(/[^0-9]/g, "");
                              // Limit based on available quantity for both associated and delivered products
                              const maxQty = Math.max(0, availableQty);
                              if (
                                parseInt(numText) > maxQty &&
                                numText !== ""
                              ) {
                                numText = maxQty.toString();
                              }
                              if (isAssociated) {
                                setAssociatedProductQuantities((prev) => ({
                                  ...prev,
                                  [quantityKey]: numText,
                                }));
                              } else {
                                // For delivered items - update the deliveredItems array
                                if (deliveredIndex >= 0) {
                                  handleItemQuantityChange(
                                    deliveredIndex,
                                    numText,
                                  );
                                }
                              }
                            }}
                            keyboardType="numeric"
                            maxLength={3}
                            editable={!customer.deliveryConfirmed}
                          />
                        </View>
                      )}

                      {customer.deliveryConfirmed && isAlreadyAdded && (
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={{ marginRight: 8, fontSize: 16, fontWeight: "600", color: "#10B981" }}>
                            Qty: {parseInt(currentQuantity || "") || (isAssociated ? 0 : deliveredItem?.qty)}
                          </Text>
                          <View style={styles.checkmarkIcon}>
                            <Ionicons
                              name="checkmark-circle"
                              size={28}
                              color="#10B981"
                            />
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
              {/* Payment Section (B2B only) */}
              {isB2B && (
                <View
                  style={[
                    styles.paymentSection,
                    { marginHorizontal: 13, marginTop: 10 },
                  ]}
                >
                  <View style={styles.paymentInputContainer}>
                    <TextInput
                      style={{
                        fontSize: 20,
                        fontWeight: "700",
                        color: "#000",
                        alignSelf: "center",
                        minWidth: 80,
                        textAlign: "center",
                        borderBottomWidth: 1,
                        borderColor: "#CBD5E1",
                      }}
                      editable={!customer.isPaid && !customer.deliveryConfirmed}
                      value={manualB2bPayment !== null ? manualB2bPayment : effectiveTotalPayment.toFixed(2)}
                      onChangeText={(val) => {
                        const clean = val.replace(/[^0-9.]/g, "");
                        setManualB2bPayment(clean);
                      }}
                      keyboardType="numeric"
                      placeholder="0.00"
                    />
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.collectButton,
                      (effectiveTotalPayment <= 0 ||
                        !isDeliveryValid() ||
                        customer.isPaid ||
                        customer.deliveryConfirmed) && {
                        backgroundColor: "#E2E8F0",
                      },
                    ]}
                    disabled={
                      effectiveTotalPayment <= 0 ||
                      !isDeliveryValid() ||
                      customer.isPaid ||
                      customer.deliveryConfirmed
                    }
                    onPress={async () => {
                      if (!customer || customer.isPaid || effectiveTotalPayment <= 0 || !isDeliveryValid())
                        return;

                      const amount = effectiveTotalPayment;

                      // OPTIMISTIC UPDATE: Instant feedback for the user
                      markAsPaid(customer.customerId);

                      try {
                        const response = (await apiClient.post(
                          "/deliveries/b2b-payment",
                          {
                            customerId: customer.customerId,
                            amount: amount,
                          },
                        )) as any;

                        if (
                          response.id ||
                          response.customerId ||
                          response.success
                        ) {
                          Toast.show({
                            type: "success",
                            text1: "Payment Collected",
                            text2: `₹${amount} recorded`,
                            visibilityTime: 1500,
                          });
                        } else {
                          throw new Error("API reported failure");
                        }
                      } catch (err) {
                        console.error("B2B Payment Error:", err);
                        // We keep the state as isPaid:true since it's already recorded in offline potential
                        Toast.show({
                          type: "info",
                          text1: "Payment Saved",
                          text2: "Payment will sync when online",
                          visibilityTime: 2000,
                        });
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.collectButtonText,
                        (customer.isPaid || customer.deliveryConfirmed) && {
                          color: "#94A3B8",
                        },
                      ]}
                    >
                      {customer.isPaid || customer.deliveryConfirmed
                        ? "Collected"
                        : "Collect"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
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

      {!customer.deliveryConfirmed && (
        <View
          style={[
            styles.fixedButtonContainer,
            { bottom: (insets.bottom || 0) + 10 },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.confirmButton,
              { backgroundColor: "#590194" },
              processingDelivery && styles.confirmButtonProcessing,
            ]}
            onPress={confirmDelivery}
            disabled={processingDelivery}
          >
            <Text style={styles.confirmButtonText}>
              {processingDelivery ? "Processing..." : "Confirm"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Green checkmark confirmation overlay */}
      <Modal
        transparent
        animationType="fade"
        visible={confirmationVisible}
        onRequestClose={() => setConfirmationVisible(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.25)",
          }}
        >
          <Ionicons name="checkmark-circle" size={120} color="#22C55E" />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const theme = {
  colors: {
    primary: "#2563EB",

    primaryLight: "#EFF6FF",
    primaryLighter: "#F0F9FF",
    primaryDark: "#1E40AF",
    primaryBorder: "#DBEAFE",

    success: "#10B981",
    successLight: "#ECFDF5",
    successDark: "#059669",

    warning: "#F59E0B",

    error: "#EF4444",
    errorLight: "#FEF2F2",
    errorBorder: "#FCA5A5",
    errorDark: "#DC2626",

    background: "#F8F9FA",
    surface: "#FFFFFF",

    textPrimary: "#1E293B",
    textSecondary: "#64748B",
    textOnPrimary: "#FFFFFF",

    border: "#E2E8F0",
    borderLight: "#EEE",

    inputBackground: "#FFFFFF",
    inputBorder: "#3B82F6",
    inputDisabled: "#9CA3AF",
    inputDisabledBg: "#F3F4F6",

    tabInactive: "#F1F5F9",
    tabInactiveText: "#333",

    disabled: "#D1D5DB",
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
      bold: "700",
      semibold: "600",
      medium: "500",
      regular: "400",
    },
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
    // backgroundColor: theme.colors.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 120,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: theme.spacing.md,
  },
  syncBannerText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: theme.font.size.xs,
  },
  syncButton: {
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
  },
  syncButtonText: {
    color: theme.colors.warning,
    fontWeight: "bold",
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
    // backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    paddingVertical: 10,
  },
  tabs: {
    paddingLeft: 4,
    paddingRight: 10,
  },
  tab: {
    minWidth: 120,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginLeft: 10,
    backgroundColor: "#FFFFFF", // White background for clean look
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    borderWidth: 1.5,
    borderColor: "#E2E8F0", // Subtle border
  },
  activeTab: {
    backgroundColor: "#590194", // Brand Purple
    borderColor: "#590194",
    transform: [{ scale: 1.05 }],
    shadowColor: "#590194",
    shadowOpacity: 0.4,
  },
  confirmedTab: {
    backgroundColor: "#DCFCE7", // Light Green
    borderColor: "#10B981", // Success Green
  },
  activeConfirmedTab: {
    backgroundColor: "#10B981", // Solid Green when selected
    borderColor: "#059669",
    transform: [{ scale: 1.05 }],
    shadowColor: "#10B981",
    shadowOpacity: 0.4,
  },
  futureTab: {
    backgroundColor: "#F8FAFC",
    opacity: 0.6,
    elevation: 0,
    shadowOpacity: 0,
    borderColor: "#F1F5F9",
  },
  tabText: {
    color: "#475569", // Slate gray for readability
    fontWeight: "600",
    fontSize: 15,
    textAlign: "center",
  },
  activeTabText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  confirmedTabText: {
    color: "#047857", // Dark emerald for contrast
    fontWeight: "700",
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

  // NEW DESIGN STYLES
  headerTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    // backgroundColor: "#fff",
    zIndex: 1100,
  },
  hamburgerButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  // syncButton: {
  //   padding: 8,
  //   borderRadius: 8,
  //   backgroundColor: "#F1F5F9",
  // },
  menuOverlay: {
    position: "absolute",
    top: 50,
    right: 16,
    width: 200,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 8,
    zIndex: 1200,
    elevation: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  menuItemText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  skipButton: {
    // backgroundColor: "#EF4444",
    // paddingHorizontal: 16,
    // paddingVertical: 8,
    // borderRadius: 8,
    alignSelf: "center",
    marginLeft: 16,
    // marginBottom: 8,
  },
  skipButtonText: {
    color: "#757575",
    fontWeight: "500",
    fontSize: 24,
  },
  // STYLES FOR THE NEW CARD DESIGN
  customerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    margin: 20,
    padding: 16,
    borderWidth: 2,
    borderColor: "#590194",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  centeredCustomerHeader: {
    alignItems: "center",
    paddingBottom: 16,
    marginBottom: 16,
  },
  centeredCustomerName: {
    fontSize: 30,
    fontWeight: "800",
    color: "#590194",
    textAlign: "center",
    marginBottom: 8,
  },
  underLine: {
    height: 1,
    backgroundColor: "#CBD5E1",
    position: "absolute",
    bottom: 0,
    left: -16,
    right: -16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  productsListWrapper: {
    marginTop: 16,
    // borderRadius: 16,
    borderColor: "#cac4d0",
    backgroundColor: "#FFFFFF",
    // borderWidth: 1,
    overflow: "hidden",
    flex: 1,
    maxHeight: 400,
  },
  productsListContainer: {
    paddingVertical: 8,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    height: 80,
    backgroundColor: "#FFFFFF",
  },
  lastRowStyle: {
    borderBottomWidth: 0,
  },
  imageWrapper: {
    width: 60,
    height: 60,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  productImage: {
    width: 60,
    height: 60,
  },
  textWrapper: {
    flex: 1,
    justifyContent: "center",
    paddingRight: 8,
  },
  productNameText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  availableQtyText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "500",
  },
  inputWrapper: {
    justifyContent: "center",
  },
  input: {
    width: 70,
    height: 44,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
  },
  checkmarkIcon: {
    justifyContent: "center",
    alignItems: "center",
  },
  paymentSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 0,
    marginTop: 20,
    marginBottom: 10,
  },
  paymentInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#10B981",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#fff",
    width: "48%",
  },
  paymentInput: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    flex: 1,
    padding: 0,
    borderWidth: 0,
    alignSelf: "center",
    // @ts-ignore
    outlineStyle: "none" as any,
  },
  collectButton: {
    width: "48%",
    backgroundColor: "#10B981",
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 10,
  },
  collectButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 20,
    alignSelf: "center",
  },
  otherProductButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#3880FF",
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  otherProductButtonText: {
    color: "#757575",
    fontWeight: "500",
    fontSize: 18,
    alignSelf: "flex-start",
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#757575",
    alignItems: "center",
  },
  fixedButtonContainer: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 20, // Default bottom for web/browser
    zIndex: 1000, // Higher z-index to stay on top
  },
  confirmButton: {
    backgroundColor: "#590194",
    borderRadius: 12,
    padding: 15,
    alignItems: "center",
    elevation: 8,
    shadowColor: "#590194",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  confirmButtonProcessing: {
    backgroundColor: theme.colors.warning,
  },
  confirmButtonText: {
    color: theme.colors.textOnPrimary,
    fontWeight: "600",
    fontSize: 25,
  },
});
