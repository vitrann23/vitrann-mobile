"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import apiClient from "../services/apiClient";

// Types
type DeliveryItem = {
  id: number;
  inventoryId: number;
  productName: string;
  quantity: number;
  price: number;
};

type PaymentItem = {
  id: number;
  amount: number;
  isCollected: boolean;
};

type CustomerDetail = {
  customerId: number;
  customerName: string;
  classification: string;
  deliveries: DeliveryItem[];
  payments: PaymentItem[];
};

export default function DetailedPreviewScreen() {
  const router = useRouter();
  const [data, setData] = useState<CustomerDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  // ✅ FIX: State map for individual product quantities
  const [editBuffers, setEditBuffers] = useState<{
    [inventoryId: number]: { quantity: string };
  }>({});
  // ✅ FIX: Customer-level payment state
  const [editTotalAmount, setEditTotalAmount] = useState("");
  const [editIsCollected, setEditIsCollected] = useState(false);

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const response = (await apiClient.get(
        "/deliveries/detailed-report",
      )) as any;
      if (response.success) {
        setData(response.data);
      }
    } catch (error) {
      console.error("Error fetching detailed report:", error);
      Toast.show({
        type: "error",
        text1: "Fetch Failed",
        text2: "Could not load detailed delivery data",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    return data
      .filter(
        (c) =>
          c.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.customerId.toString().includes(searchQuery),
      )
      .sort((a, b) => a.customerId - b.customerId);
  }, [data, searchQuery]);

  // ✅ FIX: Start editing with customer-level totals
  const startEdit = (customer: CustomerDetail) => {
    const buffers: any = {};
    customer.deliveries.forEach((d) => {
      buffers[d.inventoryId] = { quantity: d.quantity.toString() };
    });

    const totalAmount = customer.payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const anyCollected = customer.payments.some((p) => p.isCollected);

    setEditBuffers(buffers);
    setEditTotalAmount(totalAmount.toString());
    setEditIsCollected(anyCollected);
    setEditingId(customer.customerId);
  };

  const updateBuffer = (inventoryId: number, value: string) => {
    setEditBuffers((prev) => ({
      ...prev,
      [inventoryId]: { quantity: value },
    }));
  };

  // ✅ FIX: Handle update by separating product quantities from consolidated payment
  const handleUpdate = async (customer: CustomerDetail) => {
    const actualTotalCollected = customer.payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );

    try {
      setLoading(true);
      const updatePromises = customer.deliveries
        .map((d) => {
          const buffer = editBuffers[d.inventoryId];
          if (!buffer) return null;

          // Per-item bill is just qty * original_price
          const newQty = parseInt(buffer.quantity) || 0;
          if (isNaN(newQty)) return null;
          
          const newBill = d.price * newQty;

          return apiClient.post("/deliveries/update-item", {
            customerId: customer.customerId,
            inventoryId: d.inventoryId,
            deliveredQuantity: newQty,
            billAmount: newBill,
            isCollected: customer.classification === "B2B", // Auto-collected if B2B
          });
        })
        .filter(Boolean);

      const results = (await Promise.all(updatePromises)) as any[];

      if (results.every((r) => r.success)) {
        // Sync local storage for immediate summary update
        try {
          const offlineData = await AsyncStorage.getItem("offline_customers");
          if (offlineData) {
            let custs = JSON.parse(offlineData);
            const idx = custs.findIndex((c: any) => c.customerId === customer.customerId);
            if (idx !== -1) {
              // Update items and calculate new total
              let newTotal = 0;
              custs[idx].deliveredItems = custs[idx].deliveredItems.map((item: any) => {
                const buffer = editBuffers[item.inventoryId];
                if (buffer) {
                  const qty = parseInt(buffer.quantity) || 0;
                  const price = (item.originalPrice || item.price) * qty;
                  newTotal += price;
                  return { ...item, qty, price };
                }
                newTotal += (item.price || 0);
                return item;
              });

              // Update paymentReceived only if B2B (as B2C collection is separate)
              if (customer.classification === "B2B") {
                custs[idx].paymentReceived = newTotal;
                custs[idx].isPaid = newTotal > 0;
              }
              
              await AsyncStorage.setItem("offline_customers", JSON.stringify(custs));
            }
          }
        } catch (syncErr) {
          console.error("Local sync failed", syncErr);
        }

        Toast.show({ type: "success", text1: "Updated Successfully" });
        setEditingId(null);
        fetchReport();
      } else {
        throw new Error("Some items failed to update");
      }
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Update failed",
        text2: "Please try again",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading && data.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator
          size="large"
          color="#590194"
          style={{ marginTop: 50 }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TextInput
          style={styles.searchBar}
          placeholder="Search Customer..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {filteredData.map((customer) => {
          const isEditing = editingId === customer.customerId;
          const actualTotalCollected = customer.payments
            .filter((p) => p.isCollected)
            .reduce((sum, p) => sum + Number(p.amount), 0);

          const actualTotalBill = customer.deliveries.reduce((sum, d) => {
            const buffer = editBuffers[d.inventoryId];
            const qty = isEditing && buffer ? parseInt(buffer.quantity) : d.quantity;
            return sum + (d.price * (qty || 0));
          }, 0);

          return (
            <View key={customer.customerId} style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.customerName}>
                    {customer.customerName}
                  </Text>
                  <Text style={styles.customerTypeBadge}>
                    {customer.classification} Customer
                  </Text>
                </View>
                <Text style={styles.customerId}>ID: {customer.customerId}</Text>
              </View>

              <View style={styles.cardBody}>
                {customer.deliveries.map((d) => {
                  const buffer = editBuffers[d.inventoryId];

                  return (
                    <View key={d.inventoryId} style={styles.itemContainer}>
                      <View style={styles.itemRow}>
                        <View style={styles.productInfo}>
                          <Text style={styles.productName}>
                            {d.productName}
                          </Text>
                          <Text style={styles.productPrice}>
                            Rate: ₹{d.price}/unit
                          </Text>
                        </View>

                        {isEditing ? (
                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Qty:</Text>
                            <TextInput
                              style={styles.qtyInput}
                              keyboardType="numeric"
                              value={buffer?.quantity}
                              onChangeText={(val) =>
                                updateBuffer(d.inventoryId, val)
                              }
                            />
                          </View>
                        ) : (
                          <View style={styles.qtyDisplay}>
                            <Text style={styles.qtyText}>{d.quantity}</Text>
                            <Text style={styles.qtySubText}>delivered</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}

                <View style={styles.paymentFooter}>
                    <View
                      style={[
                        styles.amountBox,
                        {
                          borderColor:
                            customer.classification === "B2B" ? "#16A34A" : "#64748B",
                        },
                      ]}
                    >
                      <Text style={styles.amountLabel}>
                        {customer.classification === "B2B" ? "Amount Collected:" : "Bill Amount:"}
                      </Text>
                      <Text
                        style={[
                          styles.amountText,
                          {
                            color:
                              customer.classification === "B2B" ? "#16A34A" : "#64748B",
                          },
                        ]}
                      >
                        {customer.classification === "B2B" 
                          ? `₹${actualTotalBill.toFixed(2)}`
                          : `₹${actualTotalBill.toFixed(2)} Pending`
                        }
                      </Text>
                    </View>

                  <View style={styles.footerActionRow}>
                    {isEditing ? (
                      <TouchableOpacity
                        style={styles.updateBtn}
                        onPress={() => handleUpdate(customer)}
                      >
                        <Text style={styles.updateBtnText}>Save</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => startEdit(customer)}
                      >
                        <Text style={styles.editBtnText}>Edit</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={styles.satisfiedBtn}
        onPress={() => router.back()}
      >
        <Text style={styles.satisfiedText}>Satisfied</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F9",
  },
  header: {
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  searchBar: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "LeagueSpartan_600SemiBold",
    color: "#1E293B",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#590194",
    marginBottom: 20,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#590194",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  customerName: {
    fontSize: 20,
    fontFamily: "LeagueSpartan_700Bold",
    color: "#1E293B",
  },
  customerTypeBadge: {
    fontSize: 13,
    color: "#64748B",
    fontFamily: "LeagueSpartan_600SemiBold",
    marginTop: 2,
  },
  customerId: {
    fontSize: 12,
    color: "#94A3B8",
    fontFamily: "LeagueSpartan_700Bold",
  },
  cardBody: {
    padding: 12,
  },
  itemContainer: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 12,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 18,
    fontFamily: "LeagueSpartan_600SemiBold",
    color: "#1E293B",
  },
  productPrice: {
    fontSize: 14,
    color: "#64748B",
    fontFamily: "LeagueSpartan_500Medium",
  },
  qtyDisplay: {
    alignItems: "flex-end",
  },
  qtyText: {
    fontSize: 24,
    fontFamily: "LeagueSpartan_800ExtraBold",
    color: "#590194",
  },
  qtySubText: {
    fontSize: 11,
    color: "#94A3B8",
    textTransform: "uppercase",
    fontFamily: "LeagueSpartan_700Bold",
  },
  inputGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputLabel: {
    fontSize: 15,
    fontFamily: "LeagueSpartan_700Bold",
    color: "#64748B",
  },
  qtyInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: "#590194",
    width: 65,
    textAlign: "center",
    fontSize: 18,
    fontFamily: "LeagueSpartan_700Bold",
    color: "#1E293B",
  },
  paymentFooter: {
    marginTop: 4,
  },
  footerEditSection: {
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footerLabel: {
    fontSize: 15,
    fontFamily: "LeagueSpartan_700Bold",
    color: "#1E293B",
  },
  priceInputLarge: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: "#16A34A",
    width: 110,
    fontSize: 20,
    fontFamily: "LeagueSpartan_800ExtraBold",
    color: "#16A34A",
  },
  statusToggle: {
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  statusToggleActive: {
    backgroundColor: "#DCFCE7",
  },
  statusToggleText: {
    fontSize: 14,
    fontFamily: "LeagueSpartan_800ExtraBold",
    color: "#16A34A",
  },
  amountBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#F1F5F9",
    marginBottom: 14,
  },
  amountLabel: {
    fontSize: 11,
    color: "#64748B",
    fontFamily: "LeagueSpartan_700Bold",
    textTransform: "uppercase",
  },
  amountText: {
    fontSize: 18,
    fontFamily: "LeagueSpartan_800ExtraBold",
  },
  footerActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  editBtn: {
    backgroundColor: "#FBBF24",
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  editBtnText: {
    color: "#fff",
    fontFamily: "LeagueSpartan_800ExtraBold",
    fontSize: 15,
  },
  updateBtn: {
    backgroundColor: "#590194",
    borderRadius: 10,
    paddingHorizontal: 26,
    paddingVertical: 12,
  },
  updateBtnText: {
    color: "#fff",
    fontFamily: "LeagueSpartan_800ExtraBold",
    fontSize: 15,
  },
  satisfiedBtn: {
    position: "absolute",
    bottom: 25,
    left: 20,
    right: 20,
    backgroundColor: "#590194",
    height: 64,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#590194",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  satisfiedText: {
    color: "#fff",
    fontSize: 24,
    fontFamily: "LeagueSpartan_800ExtraBold",
    letterSpacing: 0.5,
  },
});
