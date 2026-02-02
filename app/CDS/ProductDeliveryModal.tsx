import React, { useState } from 'react';

import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import Toast from 'react-native-toast-message';

// Simple ProductIcon component using ONLY API imageUrl
const ProductIcon = ({ imageUrl, productName, style }: {
  imageUrl: string | null;
  productName: string;
  style?: any
}) => {
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.productIconImage, style]}
        onError={() => console.log(`Failed to load image: ${imageUrl}`)}
      />
    );
  } else {
    // Generic fallback icon for products without images
    return <Text style={[styles.productIcon, style]}>📦</Text>;
  }
};

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
  onClose
}) => {
  const [productQtys, setProductQtys] = useState<Record<string, string>>({});

  // Get available products from inventory
  const getAvailableProducts = () => {
    return workerInventory
      .filter(item => item.inventory && ((item.availableQuantity ?? item.totalPickedQuantity) || 0) > 0)
      .map(item => ({
        productId: item.inventory!.product.productId,
        productName: item.inventory!.product.productName,
        price: item.inventory!.product.currentProductPrice,
        // Use availableQuantity (Net) if present, else fallback to totalPicked (Gross)
        // Backend provides availableQuantity which accounts for deliveries.
        availableQty: item.availableQuantity ?? item.totalPickedQuantity ?? 0,
        imageUrl: item.inventory!.product.imageUrl,
        description: item.inventory!.product.description
      }));
  };

  const availableProducts = getAvailableProducts();

  const getTotalDelivered = (productId: number) =>
    customers.reduce(
      (total, cust) => {
        // Only count unconfirmed (staged) deliveries. 
        // Confirmed ones are assumed to be in the backend 'availableQuantity' (after refetch).
        // If query is stale, we might show higher stock momentarily, but preventing double subtraction is key.
        if (cust.deliveryConfirmed) return total;

        return total +
          cust.deliveredItems
            .filter((item) => item.productId === productId)
            .reduce((subTotal, item) => subTotal + item.qty, 0);
      },
      0
    );

  const getAvailableQty = (product: any) => {
    const globalDelivered = getTotalDelivered(product.productId);
    return product.availableQty - globalDelivered;
  };

  const handleAddItem = (product: any) => {
    const qtyStr = productQtys[product.productId.toString()];
    if (!qtyStr || Number(qtyStr) <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Please Enter Quantity',
        text2: 'Enter how many packets to deliver',
        visibilityTime: 2000,
      });
      return;
    }

    const enteredQty = Number(qtyStr);
    const globalDelivered = getTotalDelivered(product.productId);
    const availableQty = product.availableQty - globalDelivered;

    if (enteredQty > availableQty) {
      Toast.show({
        type: 'error',
        text1: 'Not Enough Stock',
        text2: `Only ${availableQty} packets available`,
        visibilityTime: 3000,
      });
      return;
    }

    // ✅ FIXED: Create item with correct structure
    const newDeliveredItem: DeliveredItem = {
      name: product.productName,
      qty: enteredQty,
      productId: product.productId,
      price: product.price * enteredQty, // ✅ TOTAL amount (price * quantity)
      originalPrice: product.price, // ✅ Store original per-unit price
      isEdited: false // ✅ Initially not edited
    };

    const updatedDeliveredItems = [...customer.deliveredItems, newDeliveredItem];
    const updatedCustomers = [...customers];
    updatedCustomers[selectedIdx] = {
      ...updatedCustomers[selectedIdx],
      deliveredItems: updatedDeliveredItems
    };

    setCustomers(updatedCustomers);
    // Clear input
    setProductQtys(prev => ({ ...prev, [product.productId.toString()]: "" }));

    Toast.show({
      type: 'success',
      text1: 'Product Added',
      text2: `${product.productName} added to delivery`,
      visibilityTime: 1500,
    });
  };

  const isQuantityValid = (product: any, qty: string) => {
    if (!qty || Number(qty) <= 0) return false;
    const enteredQty = Number(qty);
    const globalDelivered = getTotalDelivered(product.productId);
    const availableQty = product.availableQty - globalDelivered;
    return enteredQty <= availableQty;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.fullModalOverlay}>
        <View style={styles.fullModal}>
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

          {/* Scrollable Content */}
          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 20 }}>
            {customer.deliveryConfirmed ? (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateIcon}>✓</Text>
                <Text style={styles.noItemsText}>Delivery Confirmed</Text>
                <Text style={styles.emptyStateSubtext}>
                  This customer's delivery cannot be modified
                </Text>
              </View>
            ) : availableProducts.length > 0 ? (
              <View style={styles.addProductsTab}>
                {availableProducts.map((product) => {
                  const availableQty = getAvailableQty(product);
                  const currentQty = productQtys[product.productId.toString()] || "";
                  const isValid = isQuantityValid(product, currentQty);
                  const hasValue = currentQty && Number(currentQty) > 0;
                  const exceedsStock = hasValue && Number(currentQty) > availableQty;

                  const isAlreadyDelivered = customer.deliveredItems.some(
                    (item) => item.productId === product.productId
                  );

                  if (isAlreadyDelivered) return null;

                  return (
                    <View key={product.productId} style={styles.productCard}>
                      <View style={styles.productHeader}>
                        <View style={styles.productRow}>
                          <ProductIcon
                            imageUrl={product.imageUrl}
                            productName={product.productName}
                          />
                          <View style={styles.productInfo}>
                            <Text style={styles.productName}>{product.productName}</Text>
                            <Text style={styles.productAvailable}>
                              Available: {availableQty} packets
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Quantity Input */}
                      <View style={styles.inputSection}>
                        <Text style={styles.inputLabel}>How many packets?</Text>
                        <View style={styles.quantityRow}>
                          <TextInput
                            style={[
                              styles.quantityInput,
                              exceedsStock && styles.inputError,
                            ]}
                            placeholder="0"
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
                            keyboardType="numeric"
                            maxLength={3}
                          />
                          <Text style={styles.packetsLabel}>packets</Text>
                        </View>
                        {exceedsStock && (
                          <Text style={styles.errorText}>
                            Maximum {availableQty} packets available
                          </Text>
                        )}
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.addButton,
                          (!hasValue || !isValid) && styles.addButtonDisabled,
                        ]}
                        onPress={() => handleAddItem(product)}
                        disabled={!hasValue || !isValid}
                      >
                        <Text style={styles.addButtonText}>Add to Delivery</Text>
                      </TouchableOpacity>
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
            <TouchableOpacity style={styles.doneButton} onPress={onClose}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fullModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  fullModal: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    marginTop: 40, // Add top margin so it doesn't fill entire screen
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
  addProductsTab: {
    gap: 16,
    paddingTop: 20,
  },
  productCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  productHeader: {
    marginBottom: 16,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
  },
  productIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  productIconImage: {
    width: 32,
    height: 32,
    marginRight: 12,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
  },
  productInfo: {
    flex: 1,
    paddingRight: 8,
  },
  productName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1E293B",
    lineHeight: 20,
    marginBottom: 4,
  },
  productAvailable: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
    lineHeight: 18,
  },
  inputSection: {
    gap: 12,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quantityInput: {
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    backgroundColor: "#fff",
    textAlign: "center",
    minWidth: 80,
    fontWeight: "600",
  },
  packetsLabel: {
    fontSize: 16,
    color: "#64748B",
    fontWeight: "500",
  },
  inputError: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  addButton: {
    backgroundColor: "#10B981",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    marginTop: 4,
  },
  addButtonDisabled: {
    backgroundColor: "#D1D5DB",
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 14,
    textAlign: "center",
    fontWeight: "500",
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
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  doneButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
