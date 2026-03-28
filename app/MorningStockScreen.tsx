"use client";

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
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
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import apiClient from "../services/apiClient";
import { getProductImageSource } from "../utils/productImages";

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

const MorningStockScreen = () => {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const workerId = params.workerId as string;

  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<{ [key: number]: string }>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [workerName, setWorkerName] = useState("");
  const [focusedInput, setFocusedInput] = useState<number | null>(null);

  // Get current date formatted
  const date = new Date();

  const formattedDate = date
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    .replace(",", "");

  const fetchData = useCallback(
    async (isRefresh = false) => {
      console.log("Fetching products for workerId:", workerId);
      if (!isRefresh) setLoading(true);
      else setRefreshing(true);

      try {
        const name = await AsyncStorage.getItem("workerName");
        setWorkerName(name || `Worker ${workerId}`);
        const response = (await apiClient.get(
          "/products/products-with-latest-inventory",
        )) as any;
        const result = response;
        if (result.success && Array.isArray(result.data)) {
          const validProducts = result.data.filter(
            (p: Product) => p && p.inventory && p.inventory.inventoryId,
          );
          setProducts(validProducts);

          if (!isRefresh) {
            const initial: { [key: number]: string } = {};
            validProducts.forEach((p: Product) => {
              initial[p.inventory.inventoryId] = "";
            });
            setQuantities(initial);
          }
        } else {
          Toast.show({
            type: "error",
            text1: "Error",
            text2: "Failed to load products",
          });
        }
      } catch (error) {
        Toast.show({ type: "error", text1: "Error", text2: "Network error" });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workerId],
  );

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

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  const handleInputChange = (inventoryId: number, text: string) => {
    let cleaned = text.replace(/[^0-9]/g, "").slice(0, 3);
    setQuantities((prev) => ({ ...prev, [inventoryId]: cleaned }));
  };

  const handleSubmit = async () => {
    const currentTotal = Object.values(quantities)
      .map((q) => parseInt(q) || 0)
      .reduce((acc, val) => acc + val, 0);

    if (currentTotal === 0) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Please enter quantity.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const pickItems = Object.entries(quantities)
        .filter(([_, qty]) => (parseInt(qty) || 0) > 0)
        .map(([inventoryId, qty]) => ({
          inventoryId: parseInt(inventoryId),
          totalPickedQuantity: parseInt(qty),
        }));

      const response = (await apiClient.post(
        "/daily-activity-wi/pick-quantities",
        {
          workerId: parseInt(workerId),
          pickItems,
        },
      )) as any;
      const result = response;
      if (result.success) {
        Toast.show({
          type: "success",
          text1: "Success",
          text2: "Stock submitted!",
        });
        setTimeout(() => {
          router.push({
            pathname: "/CustomerDeliveryScreen",
            params: { workerId, workerName },
          });
        }, 1200);
      } else {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: result.message || "Failed",
        });
      }
    } catch (error) {
      Toast.show({ type: "error", text1: "Error", text2: "Network error" });
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3880FF" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        {/* Header */}
        <View style={styles.headerContainer}>
          <Text style={styles.workerNameText}>{workerName}</Text>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitleText}>Morning Stock</Text>
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>
        </View>

        {products.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No products available</Text>
          </View>
        ) : (
          <View style={styles.productsWrapper}>
            <ScrollView
              // style={styles.productsMain}
              contentContainerStyle={styles.productsContainer}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => fetchData(true)}
                  tintColor="#3880FF"
                />
              }
            >
              {products.map((product, index) => (
                <View
                  key={product.inventory.inventoryId}
                  style={[
                    styles.productRow,
                    index === products.length - 1 && styles.lastRow,
                  ]}
                >
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
                          style={[styles.productImage, styles.placeholderImage]}
                        >
                          <Ionicons
                            name="image-outline"
                            size={24}
                            color="#ccc"
                          />
                        </View>
                      );
                    })()}
                  </View>

                  <View style={styles.textWrapper}>
                    <Text style={styles.productName}>
                      {product.productName}
                    </Text>
                  </View>

                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={[
                        styles.input,
                        (focusedInput === product.inventory.inventoryId ||
                          parseInt(
                            quantities[product.inventory.inventoryId] || "0",
                          ) > 0) &&
                          styles.inputActive,
                      ]}
                      placeholder="0"
                      placeholderTextColor="#999"
                      keyboardType="numeric"
                      maxLength={3}
                      value={quantities[product.inventory.inventoryId] ?? ""}
                      onFocus={() =>
                        setFocusedInput(product.inventory.inventoryId)
                      }
                      onBlur={() => setFocusedInput(null)}
                      onChangeText={(text) =>
                        handleInputChange(product.inventory.inventoryId, text)
                      }
                      editable={!submitting}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Start Delivery</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F7F7",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F7F7F7",
  },

  // Header Styles
  headerContainer: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CAC4D0",
    margin: 20,
    borderRadius: 20,
    padding: 20,
  },
  logoutButton: {
    position: "absolute",
    right: 20,
    top: 30,
    padding: 10,
  },
  headerTextContainer: {
    alignItems: "center",
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  workerNameText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#590194",
    marginBottom: 4,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  headerTitleText: {
    fontSize: 20,
    color: "#000000",
    marginBottom: 6,
  },
  dateText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3880FF",
  },

  productsWrapper: {
    margin: 20,
    borderRadius: 20,
    borderColor: "#cac4d0",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    overflow: "hidden",
    flex: 1,
  },

  productsContainer: {
    padding: 10,
  },

  productRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    height: 90,
    backgroundColor: "#FFFFFF",
  },
  lastRow: {
    borderBottomWidth: 0,
  },

  imageWrapper: {
    width: 60,
    height: 60,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  productImage: {
    width: 60,
    height: 60,
  },
  placeholderImage: {
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    width: 60,
    height: 60,
    justifyContent: "center",
    alignItems: "center",
  },

  textWrapper: {
    flex: 1,
    justifyContent: "center",
    paddingRight: 8,
  },
  productName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
    letterSpacing: 0.3,
  },

  inputWrapper: {
    justifyContent: "center",
  },
  input: {
    width: 80,
    height: 48,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: "#0F172A",
    backgroundColor: "#FFFFFF",
  },
  inputActive: {
    borderColor: "#3880FF",
    backgroundColor: "#EFF6FF",
    borderWidth: 2,
    color: "#3880FF",
  },
  footer: {
    backgroundColor: "#f7f7f7",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#f7f7f7",
    paddingBottom: Platform.OS === "ios" ? 16 : 16,
  },
  button: {
    backgroundColor: "#590194",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#590194",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: "#94A3B8",
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  emptyContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#64748B",
    marginTop: 12,
  },
});

export default MorningStockScreen;
