import React, { useState } from "react";

import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import Toast from "react-native-toast-message";
import { getProductImageSource } from "../../utils/productImages";

// Updated DeliveredItem interface to match CustomerDeliveryScreen
interface DeliveredItem {
  name: string;
  qty: number;
  productId: number;
  price: number; // This is TOTAL amount per item, not per unit
  originalPrice: number; // Original per-unit price
  isEdited: boolean; // Track if user edited the total
}

interface CustomerForDelivery {
  id: string;
  name: string;
  type: string;
  address: string;
  deliveredItems: DeliveredItem[];
  paymentReceived: number;
  customerId: number;
  deliveryConfirmed: boolean;
  sequenceNumber: number;
}

interface WorkerInventory {
  id: number;
  workerId: number;
  inventoryId: number;
  totalPickedQuantity: number | null;
  availableQuantity?: number; // Computed by backend
  remainingQuantity: number | null;
  date: string;
  inventory: {
    inventoryId: number;
    totalOrderedQuantity: number;
    receivedQuantity: number | null;
    remainingQuantity: number | null;
    date: string;
    product: {
      productId: number;
      productName: string;
      currentProductPrice: number;
      storeId: string;
      imageUrl: string | null;
      description: string | null;
    };
  };
}

interface ProductDeliveryModalProps {
  visible: boolean;
  customer: CustomerForDelivery;
  customers: CustomerForDelivery[];
  setCustomers: (customers: CustomerForDelivery[]) => void;
  selectedIdx: number;
  workerInventory: WorkerInventory[];
  onClose: () => void;
}

export const ProductDeliveryModal: React.FC<ProductDeliveryModalProps> = ({
  visible,
  customer,
  customers,
  setCustomers,
  selectedIdx,
  workerInventory,
  onClose,
}) => {
  const [productQtys, setProductQtys] = useState<Record<string, string>>({});

  // Get available products from inventory
  const getAvailableProducts = () => {
    return workerInventory
      .filter(
        (item) =>
          item.inventory &&
          ((item.availableQuantity ?? item.totalPickedQuantity) || 0) > 0,
      )
      .map((item) => ({
        productId: item.inventory!.product.productId,
        productName: item.inventory!.product.productName,
        price: item.inventory!.product.currentProductPrice,
        // Use availableQuantity (Net) if present, else fallback to totalPicked (Gross)
        // Backend provides availableQuantity which accounts for deliveries.
        availableQty: item.availableQuantity ?? item.totalPickedQuantity ?? 0,
        imageUrl: item.inventory!.product.imageUrl,
        description: item.inventory!.product.description,
      }));
  };

  const availableProducts = getAvailableProducts();

  const getTotalDelivered = (productId: number) =>
    customers.reduce((total, cust) => {
      // Only count unconfirmed (staged) deliveries.
      // Confirmed ones are assumed to be in the backend 'availableQuantity' (after refetch).
      // If query is stale, we might show higher stock momentarily, but preventing double subtraction is key.
      if (cust.deliveryConfirmed) return total;

      return (
        total +
        cust.deliveredItems
          .filter((item) => item.productId === productId)
          .reduce((subTotal, item) => subTotal + item.qty, 0)
      );
    }, 0);

  const getAvailableQty = (product: any) => {
    const globalDelivered = getTotalDelivered(product.productId);
    return Math.max(0, product.availableQty - globalDelivered);
  };

  const handleAddAllProducts = () => {
    const itemsToAdd: DeliveredItem[] = [];

    availableProducts.forEach((product) => {
      const qtyStr = productQtys[product.productId.toString()];
      const enteredQty = parseInt(qtyStr) || 0;

      if (enteredQty > 0) {
        const globalDelivered = getTotalDelivered(product.productId);
        const availableQty = Math.max(0, product.availableQty - globalDelivered);

        // Validate quantity
        if (enteredQty > availableQty) {
          Toast.show({
            type: "error",
            text1: `${product.productName} - Not Enough Stock`,
            text2: `Only ${availableQty} packets available`,
            visibilityTime: 2000,
          });
          return;
        }

        // Create item
        itemsToAdd.push({
          name: product.productName,
          qty: enteredQty,
          productId: product.productId,
          price: product.price * enteredQty,
          originalPrice: product.price,
          isEdited: false,
        });
      }
    });

    if (itemsToAdd.length === 0) {
      Toast.show({
        type: "info",
        text1: "No Products Selected",
        text2: "Please enter quantity for at least one product",
        visibilityTime: 1500,
      });
      return;
    }

    // Add all products to customer
    const updatedCustomers = [...customers];
    updatedCustomers[selectedIdx] = {
      ...updatedCustomers[selectedIdx],
      deliveredItems: [
        ...updatedCustomers[selectedIdx].deliveredItems,
        ...itemsToAdd,
      ],
    };

    setCustomers(updatedCustomers);
    setProductQtys({}); // Clear inputs

    Toast.show({
      type: "success",
      text1: "Products Added",
      text2: `${itemsToAdd.length} product(s) added to delivery`,
      visibilityTime: 1500,
    });

    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.fullModalOverlay}>
        <View style={styles.fullModal}>
          <KeyboardAvoidingView
            style={styles.modalKeyboardView}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeading}>Add Other Products</Text>
            <Text style={styles.modalSubheading}>{customer.name}</Text>
            <Text style={styles.modalDescription}>
              Select products not associated with this customer
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Confirmed Banner */}
          {customer.deliveryConfirmed && (
            <View style={styles.confirmedBanner}>
              <Text style={styles.confirmedBannerText}>
                ✓ This delivery has been confirmed
              </Text>
            </View>
          )}

          {/* Scrollable Content - Morning Stock Style */}
          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={{ paddingBottom: 120 }}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentInsetAdjustmentBehavior="automatic"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
          >
            {customer.deliveryConfirmed ? (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateIcon}>✓</Text>
                <Text style={styles.noItemsText}>Delivery Confirmed</Text>
                <Text style={styles.emptyStateSubtext}>
                  This customer&apos;s delivery cannot be modified
                </Text>
              </View>
            ) : availableProducts.length > 0 ? (
              <View style={styles.productsListWrapper}>
                {availableProducts.map((product, index) => {
                  const availableQty = getAvailableQty(product);
                  const currentQty =
                    productQtys[product.productId.toString()] || "";
                  const isAlreadyDelivered = customer.deliveredItems.some(
                    (item) => item.productId === product.productId,
                  );

                  if (isAlreadyDelivered) return null;

                  return (
                    <View
                      key={product.productId}
                      style={[
                        styles.productRowStyle,
                        index === availableProducts.length - 1 &&
                          styles.lastRowStyle,
                      ]}
                    >
                      <View style={styles.imageWrapperStyle}>
                        {(() => {
                          const productImageSource = getProductImageSource({
                            productName: product.productName,
                            imageUrl: product.imageUrl,
                          });

                          if (productImageSource) {
                            return (
                              <Image
                                source={productImageSource}
                                style={styles.productImageStyle}
                                resizeMode="contain"
                              />
                            );
                          }

                          return (
                            <View
                              style={[
                                styles.productImageStyle,
                                styles.placeholderImageStyle,
                              ]}
                            >
                              <Text style={{ fontSize: 24 }}>📦</Text>
                            </View>
                          );
                        })()}
                      </View>

                      <View style={styles.textWrapperStyle}>
                        <Text style={styles.productNameStyle}>
                          {product.productName}
                        </Text>
                        <Text style={styles.availableTextStyle}>
                          Available: {availableQty}
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
                            {product.price}/packet
                          </Text>
                        </View>
                      </View>

                      <View style={styles.inputWrapperStyle}>
                        <TextInput
                          style={styles.inputStyle}
                          placeholder="0"
                          placeholderTextColor="#999"
                          keyboardType="numeric"
                          maxLength={3}
                          value={currentQty}
                          onChangeText={(qty) => {
                            const numQty = Number(qty);
                            if (
                              qty === "" ||
                              (numQty >= 0 && numQty <= availableQty)
                            ) {
                              setProductQtys((prev) => ({
                                ...prev,
                                [product.productId.toString()]: qty,
                              }));
                            }
                          }}
                          editable={!customer.deliveryConfirmed}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateIcon}>📦</Text>
                <Text style={styles.noItemsText}>No products available</Text>
                <Text style={styles.emptyStateSubtext}>
                  Check with admin to add products to your stock
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footerButtons}>
            <TouchableOpacity
              style={styles.doneButton}
              onPress={handleAddAllProducts}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fullModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  fullModal: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    marginTop: 40, // Add top margin so it doesn't fill entire screen
  },
  modalKeyboardView: {
    flex: 1,
  },
  modalBody: {
    flex: 1,
    paddingHorizontal: 20,
  },
  modalHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    position: "relative",
  },
  modalHeading: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1E293B",
    textAlign: "center",
  },
  modalSubheading: {
    fontSize: 16,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
  },
  modalDescription: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 4,
    fontStyle: "italic",
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    fontSize: 18,
    color: "#64748B",
    fontWeight: "bold",
  },
  confirmedBanner: {
    backgroundColor: "#ECFDF5",
    borderColor: "#10B981",
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 8,
  },
  confirmedBannerText: {
    color: "#059669",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyStateContainer: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  noItemsText: {
    color: "#64748B",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  footerButtons: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  doneButton: {
    backgroundColor: "#590194",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  doneButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 25,
  },

  // Morning Stock Style Layouts
  productsListWrapper: {
    margin: 20,
    borderRadius: 20,
    borderColor: "#cac4d0",
    borderWidth: 1,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  productRowStyle: {
    height: 90,
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    alignItems: "center",
  },
  lastRowStyle: {
    borderBottomWidth: 0,
  },
  imageWrapperStyle: {
    width: 60,
    height: 60,
    marginRight: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  productImageStyle: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  placeholderImageStyle: {
    justifyContent: "center",
    alignItems: "center",
  },
  textWrapperStyle: {
    flex: 1,
    justifyContent: "center",
    paddingRight: 8,
  },
  productNameStyle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 4,
  },
  availableTextStyle: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "400",
  },
  inputWrapperStyle: {
    width: 80,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  inputStyle: {
    width: 70,
    height: 44,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 8,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    backgroundColor: "#FFFFFF",
  },
});
