import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  RefreshControl,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import apiClient from "../services/apiClient";
import { useInventory } from "../hooks/useInventory";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getProductImageSource } from "../utils/productImages";

// Mock Data
// Product Interface
interface Product {
  productId: number;
  productName: string;
  currentProductPrice: string;
  lastProductPrice: string;
  imageUrl: string;
  description: string;
  storeId: string;
  inventory: {
    inventoryId: number;
    date: string;
  };
}

interface Worker {
  workerId: number;
  firstName: string;
  lastName: string | null;
}

type TabType = "ADD" | "TRANSFER" | "PURCHASE";

export default function InventoryManagementScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const {
    customerName,
    workerName: currentWorkerName,
    initialTab,
  } = useLocalSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: inventoryData, refetch: refetchInventory } = useInventory();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchProducts(), fetchWorkers(), refetchInventory()]);
    setRefreshing(false);
  };

  // Initialize with passed tab or default to ADD
  const [activeTab, setActiveTab] = useState<TabType>(
    (initialTab as TabType) || "ADD",
  );
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [manualAmount, setManualAmount] = useState("");
  const [showWorkerDropdown, setShowWorkerDropdown] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const fetchProducts = async () => {
    try {
      const response = (await apiClient.get(
        "/products/products-with-latest-inventory",
      )) as any;
      if (response.success && Array.isArray(response.data)) {
        // Filter valid products like MorningStockScreen does
        const validProducts = response.data.filter(
          (p: Product) => p && p.inventory && p.inventory.inventoryId,
        );
        setProducts(validProducts);
      } else {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Failed to load products",
          visibilityTime: 2000,
        });
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to fetch products",
        visibilityTime: 2000,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkers = async () => {
    try {
      const response = (await apiClient.get("/workers/list/public")) as any;
      // Handle different response structures
      if (Array.isArray(response)) {
        setWorkers(response);
      } else if (response.data && Array.isArray(response.data)) {
        setWorkers(response.data);
      } else {
        console.log("Unexpected worker response:", response);
      }
    } catch (error) {
      console.error("Error fetching workers:", error);
    }
  };

  // Fetch on Mount
  React.useEffect(() => {
    fetchProducts();
    fetchWorkers();
  }, []);

  const filteredProducts = useMemo(() => {
    return [...products].sort((a, b) => a.productId - b.productId);
  }, [products]);

  const handleQtyChange = (productId: number, qty: string) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: qty.replace(/[^0-9]/g, ""),
    }));
  };

  const totalCalculatedAmount = useMemo(() => {
    return filteredProducts.reduce((sum, p) => {
      const qty = parseInt(quantities[p.productId] || "0");
      const price = parseFloat(p.currentProductPrice) || 0;
      return sum + qty * price;
    }, 0);
  }, [filteredProducts, quantities]);

  // Sync manualAmount when totalCalculatedAmount changes, unless user has typed something
  React.useEffect(() => {
    setManualAmount(totalCalculatedAmount.toString());
  }, [totalCalculatedAmount]);

  const handleSubmit = async () => {
    const activeItems = Object.entries(quantities).filter(
      ([_, qty]) => parseInt(qty) > 0,
    );

    if (activeItems.length === 0) {
      Toast.show({
        type: "error",
        text1: "No products selected",
        text2: "Please enter a quantity",
        visibilityTime: 2000,
      });
      return;
    }

    if (activeTab === "TRANSFER" && !selectedWorkerId) {
      Toast.show({
        type: "error",
        text1: "Worker not selected",
        text2: "Please choose a worker to transfer to",
        visibilityTime: 2000,
      });
      return;
    }

    if (
      activeTab === "PURCHASE" &&
      (!manualAmount || parseFloat(manualAmount) <= 0)
    ) {
      Toast.show({
        type: "error",
        text1: "Invalid Amount",
        text2: "Please enter a valid amount",
        visibilityTime: 2000,
      });
      return;
    }

    try {
      setLoading(true);
      const currentWorkerIdStr = await AsyncStorage.getItem("workerId");
      if (!currentWorkerIdStr) {
        Toast.show({
          type: "error",
          text1: "Authentication Error",
          text2: "Worker ID not found",
          visibilityTime: 2000,
        });
        return;
      }
      const currentWorkerId = parseInt(currentWorkerIdStr);

      let successCount = 0;

      // Process items sequentially to maintain transaction integrity
      for (const [productIdStr, qtyStr] of activeItems) {
        const productId = parseInt(productIdStr);
        const quantity = parseInt(qtyStr);

        // Find inventoryId for product
        const product = products.find((p) => p.productId === productId);
        if (!product || !product.inventory?.inventoryId) continue;

        const inventoryId = product.inventory.inventoryId;

        let response: any;

        if (activeTab === "ADD") {
          response = await apiClient.post("/inventory/add", {
            workerId: currentWorkerId,
            inventoryId,
            quantity,
          });
        } else if (activeTab === "TRANSFER") {
          response = await apiClient.post("/inventory/transfer", {
            fromWorkerId: currentWorkerId,
            toWorkerId: selectedWorkerId,
            inventoryId,
            quantity,
          });
        } else if (activeTab === "PURCHASE") {
          // Calculate estimated cost per item based on unit price
          const itemPrice = parseFloat(product.currentProductPrice) || 0;
          const estimatedCost = itemPrice * quantity;

          response = await apiClient.post("/inventory/purchase", {
            workerId: currentWorkerId,
            inventoryId,
            quantity,
            amount: estimatedCost,
          });
        }

        if (response && (response.id || response.success)) {
          successCount++;
        }
      }

      if (successCount > 0) {
        const actionObj =
          activeTab === "ADD"
            ? "added"
            : activeTab === "TRANSFER"
              ? "transferred"
              : "purchased";
        Toast.show({
          type: "success",
          text1: "Success",
          text2: `Successfully ${actionObj} ${successCount} products`,
          visibilityTime: 1500,
        });

        // Force refetch of inventory throughout the app
        await queryClient.invalidateQueries({ queryKey: ["inventory"] });

        setQuantities({});
        setSelectedWorkerId(null);
        setManualAmount("");
        setSubmitted(true);
      } else {
        Toast.show({
          type: "error",
          text1: "Failed",
          text2: "Could not complete operation",
          visibilityTime: 2000,
        });
      }
    } catch (error: any) {
      console.error("Inventory Operation Failed:", error);
      const errorMsg = error.message || error.response?.data?.message || "Operation failed";
      Toast.show({
        type: "error",
        text1: "Error",
        text2: errorMsg,
        visibilityTime: 2000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F6FA" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inventory Management</Text>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabSelectorContainer}>
        {(["ADD", "TRANSFER", "PURCHASE"] as TabType[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tabButton,
              activeTab === tab && styles.activeTabButton,
            ]}
            onPress={() => {
              setActiveTab(tab);
              setQuantities({});
              setShowWorkerDropdown(false);
              setSubmitted(false); // Reset submitted state on tab change
            }}
          >
            <View style={styles.radioContainer}>
              <View
                style={[
                  styles.radioButton,
                  activeTab === tab && styles.radioButtonActive,
                ]}
              >
                {activeTab === tab && <View style={styles.radioInner} />}
              </View>
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === tab && styles.activeTabButtonText,
                ]}
              >
                {tab.charAt(0) + tab.slice(1).toLowerCase()}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search Bar / Placeholder Container */}
      <View style={styles.searchBarWrapper}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: "#fff",
              elevation: 0,
              borderWidth: 2,
              borderColor: "#333",
            },
          ]}
        >
          <Text
            style={[
              styles.searchPlaceholder,
              { fontWeight: "700", fontSize: 18 },
            ]}
          >
            {customerName || "Select Customer"}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inventoryContainer}>
            {/* Header section with Dropdown (Visible only in TRANSFER tab) */}
            <View style={styles.dropdownWrapper}>
              <View
                style={[
                  styles.workerSelector,
                  activeTab !== "TRANSFER" && {
                    borderColor: "#E5E7EB",
                    backgroundColor: "#F9FAFB",
                  },
                ]}
              >
                <TouchableOpacity
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                  onPress={() => {
                    if (activeTab === "TRANSFER") {
                      setShowWorkerDropdown(!showWorkerDropdown);
                    }
                  }}
                  disabled={activeTab !== "TRANSFER"}
                >
                  <Text
                    style={[
                      styles.workerSelectorText,
                      activeTab !== "TRANSFER" && { color: "#6B7280" },
                    ]}
                  >
                    {activeTab === "TRANSFER"
                      ? selectedWorkerId
                        ? workers.find((w) => w.workerId === selectedWorkerId)
                            ?.firstName
                        : "Select Worker"
                      : currentWorkerName || "My Stock"}
                  </Text>
                  {activeTab === "TRANSFER" && (
                    <Ionicons
                      name={showWorkerDropdown ? "chevron-up" : "chevron-down"}
                      size={22}
                      color="#333"
                    />
                  )}
                </TouchableOpacity>
              </View>

              {activeTab === "TRANSFER" && showWorkerDropdown && (
                <View style={styles.dropdownContent}>
                  {workers.map((worker) => (
                    <TouchableOpacity
                      key={worker.workerId}
                      style={styles.dropdownItem}
                      onPress={() => {
                        setSelectedWorkerId(worker.workerId);
                        setShowWorkerDropdown(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>
                        {worker.firstName} {worker.lastName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={styles.headerDivider} />
            </View>

            {/* Product List */}
            <View style={{ paddingHorizontal: 0 }}>
              {filteredProducts.map((product, idx) => (
                <View key={product.productId} style={styles.productCard}>
                  <View style={styles.productLeft}>
                    {(() => {
                      const imgSrc = getProductImageSource({
                        productName: product.productName,
                        imageUrl: product.imageUrl,
                      });
                      return imgSrc ? (
                        <Image
                          source={imgSrc}
                          style={styles.productImage}
                          resizeMode="contain"
                        />
                      ) : (
                        <View
                          style={[
                            styles.productImage,
                            {
                              justifyContent: "center",
                              alignItems: "center",
                              backgroundColor: "#F3F4F6",
                              borderRadius: 6,
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
                    <View style={styles.productInfo}>
                      <Text style={styles.productName}>
                        {product.productName}
                      </Text>
                      <Text style={styles.availabilityText}>
                        Available:{" "}
                        {inventoryData?.find(
                          (inv) =>
                            inv.inventory.product.productId ===
                            product.productId,
                        )?.availableQuantity ?? "--"}
                      </Text>
                      <Text style={styles.priceText}>
                        ₹ {product.currentProductPrice}/packet
                      </Text>
                    </View>
                  </View>

                  <TextInput
                    style={styles.qtyInput}
                    value={quantities[product.productId] || ""}
                    onChangeText={(val) =>
                      handleQtyChange(product.productId, val)
                    }
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#999"
                  />
                </View>
              ))}
            </View>

            {/* Spacing between list and action button */}
            <View style={{ height: 20 }} />

            {/* Purchase Summary */}
            {activeTab === "PURCHASE" ? (
              <View style={styles.purchaseSummaryContainer}>
                <View style={styles.purchaseSummary}>
                  <View style={styles.amountBox}>
                    <TextInput
                      style={styles.totalAmountInput}
                      value={manualAmount}
                      onChangeText={setManualAmount}
                      keyboardType="numeric"
                      placeholder="0.00"
                    />
                  </View>
                  <TouchableOpacity 
                    style={[styles.paidButton, (submitted || loading) && { backgroundColor: "#94A3B8" }]} 
                    onPress={handleSubmit} 
                    disabled={submitted || loading}
                  >
                    <Text style={styles.paidButtonText}>{submitted ? "Paid ✓" : "Paid"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* Action Button */}
            <View style={styles.actionButtonContainer}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  submitted && styles.actionButtonSubmitted,
                ]}
                onPress={handleSubmit}
                disabled={submitted || loading}
              >
                <Text style={styles.actionButtonText}>
                  {submitted
                    ? activeTab === "ADD"
                      ? "Added ✓"
                      : activeTab === "TRANSFER"
                        ? "Transferred ✓"
                        : "Purchased ✓"
                    : activeTab === "ADD"
                      ? "Add Products"
                      : activeTab === "TRANSFER"
                        ? "Transfer"
                        : "Purchase"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6FA",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },
  tabSelectorContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#F5F6FA",
  },
  tabButton: {
    flex: 1,
    height: 48,
    backgroundColor: "#fff",
    borderRadius: 8,
    marginHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  activeTabButton: {
    borderColor: "#590194",
    borderWidth: 2,
  },
  radioContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#9CA3AF",
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  radioButtonActive: {
    borderColor: "#590194",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#590194",
  },
  tabButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  activeTabButtonText: {
    color: "#590194",
    fontWeight: "700",
    fontFamily: "LeagueSpartan_700Bold",
  },
  searchBarWrapper: {
    paddingHorizontal: 16,
    marginVertical: 12,
  },
  searchBar: {
    height: 48,
    backgroundColor: "#fff",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    // M3 Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  searchPlaceholder: {
    color: "#333",
    fontSize: 16,
    fontWeight: "400",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  inventoryContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#590194",
    padding: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    marginTop: 8,
    overflow: "hidden",
  },
  dropdownWrapper: {
    padding: 16,
    paddingBottom: 0,
    zIndex: 10,
  },
  workerSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#333",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: 150,
    marginBottom: 8,
  },
  workerSelectorText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  dropdownContent: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    position: "absolute",
    top: 60,
    left: 16,
    width: 150,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 20,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dropdownItemText: {
    fontSize: 16,
    color: "#333",
  },
  headerDivider: {
    height: 2,
    backgroundColor: "#590194",
    marginTop: 4,
  },
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: "#590194",
  },
  productLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 6,
    marginRight: 16,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#333",
  },
  availabilityText: {
    fontSize: 14,
    color: "#590194",
    fontWeight: "700",
    marginTop: 2,
  },
  priceText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginTop: 2,
  },
  qtyInput: {
    width: 90,
    height: 44,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "800",
    color: "#333",
    backgroundColor: "#fff",
  },
  purchaseSummaryContainer: {
    padding: 16,
  },
  purchaseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: "#3880FF",
    marginBottom: 16,
  },
  purchaseHeaderText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#3880FF",
  },
  purchaseSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  amountBox: {
    flex: 1, // Take available space
    marginRight: 16, // Space between input and button
    borderWidth: 2,
    borderColor: "#10B981",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  totalAmountInput: {
    fontSize: 22,
    fontWeight: "900",
    color: "#10B981",
    textAlign: "center",
    padding: 0,
    width: "100%",
  },
  paidButton: {
    backgroundColor: "#10B981",
    borderRadius: 10,
    paddingHorizontal: 24, // Reduced padding slightly
    paddingVertical: 14,
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
    minWidth: 100, // Ensure button has a minimum clickable width
  },
  paidButtonText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  actionButtonContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  actionButton: {
    backgroundColor: "#590194",
    borderRadius: 10,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#590194",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  actionButtonSubmitted: {
    backgroundColor: "#A78BDA",
    elevation: 0,
    shadowOpacity: 0,
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.5,
    fontFamily: "LeagueSpartan_800ExtraBold",
  },
});
