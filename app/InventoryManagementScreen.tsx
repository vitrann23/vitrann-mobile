import React, { useState, useMemo } from 'react';
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Toast from 'react-native-toast-message';
import apiClient from '../services/apiClient';
import { useInventory } from '../hooks/useInventory';

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

// Mock Workers (Keep for now as no worker API provided)

const MOCK_WORKERS = [
    { id: 1, name: 'Sandeep' },
    { id: 2, name: 'Ravi' },
    { id: 3, name: 'Amit' },
    { id: 4, name: 'Deepak' },
];

type TabType = 'ADD' | 'TRANSFER' | 'PURCHASE';

export default function InventoryManagementScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { customerName, workerName: currentWorkerName } = useLocalSearchParams();

    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const { data: inventoryData } = useInventory();

    const [activeTab, setActiveTab] = useState<TabType>('ADD');
    const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
    const [quantities, setQuantities] = useState<Record<number, string>>({});
    const [manualAmount, setManualAmount] = useState('');
    const [showWorkerDropdown, setShowWorkerDropdown] = useState(false);

    // Fetch Products on Mount
    React.useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await apiClient.get('/products/products-with-latest-inventory') as any;
                if (response.success && Array.isArray(response.data)) {
                    // Filter valid products like MorningStockScreen does
                    const validProducts = response.data.filter((p: Product) => p && p.inventory && p.inventory.inventoryId);
                    setProducts(validProducts);
                } else {
                    Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load products' });
                }
            } catch (error) {
                console.error('Error fetching products:', error);
                Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to fetch products' });
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    const filteredProducts = useMemo(() => {
        return products;
    }, [products]);

    const handleQtyChange = (productId: number, qty: string) => {
        setQuantities(prev => ({
            ...prev,
            [productId]: qty.replace(/[^0-9]/g, '')
        }));
    };

    const totalCalculatedAmount = useMemo(() => {
        return filteredProducts.reduce((sum, p) => {
            const qty = parseInt(quantities[p.productId] || '0');
            const price = parseFloat(p.currentProductPrice) || 0;
            return sum + (qty * price);
        }, 0);
    }, [filteredProducts, quantities]);

    // Sync manualAmount when totalCalculatedAmount changes, unless user has typed something
    React.useEffect(() => {
        setManualAmount(totalCalculatedAmount.toString());
    }, [totalCalculatedAmount]);

    const handleSubmit = () => {
        const activeItems = Object.entries(quantities).filter(([_, qty]) => parseInt(qty) > 0);

        if (activeItems.length === 0) {
            Toast.show({ type: 'error', text1: 'No products selected', text2: 'Please enter a quantity' });
            return;
        }

        if (activeTab === 'TRANSFER' && !selectedWorkerId) {
            Toast.show({ type: 'error', text1: 'Worker not selected', text2: 'Please choose a worker to transfer to' });
            return;
        }

        const message = activeTab === 'ADD' ? 'Products Added' : activeTab === 'TRANSFER' ? 'Transfer Initiated' : 'Purchase Completed';
        Toast.show({ type: 'success', text1: message, text2: 'Mode: ' + activeTab });

        // Reset state after success
        setQuantities({});
        setSelectedWorkerId(null);
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#F5F6FA" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Inventory Management</Text>
            </View>

            {/* Tab Selector */}
            <View style={styles.tabSelectorContainer}>
                {(['ADD', 'TRANSFER', 'PURCHASE'] as TabType[]).map((tab) => (
                    <TouchableOpacity
                        key={tab}
                        style={[
                            styles.tabButton,
                            activeTab === tab && styles.activeTabButton
                        ]}
                        onPress={() => {
                            setActiveTab(tab);
                            setQuantities({});
                            setShowWorkerDropdown(false);
                        }}
                    >
                        <View style={styles.radioContainer}>
                            <View style={[styles.radioButton, activeTab === tab && styles.radioButtonActive]}>
                                {activeTab === tab && <View style={styles.radioInner} />}
                            </View>
                            <Text style={[styles.tabButtonText, activeTab === tab && styles.activeTabButtonText]}>
                                {tab.charAt(0) + tab.slice(1).toLowerCase()}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Search Bar / Placeholder Container */}
            <View style={styles.searchBarWrapper}>
                <View style={[styles.searchBar, { backgroundColor: '#fff', elevation: 0, borderWidth: 2, borderColor: '#333' }]}>
                    <Text style={[styles.searchPlaceholder, { fontWeight: '700', fontSize: 18 }]}>
                        {customerName || 'Select Customer'}
                    </Text>
                </View>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.inventoryContainer}>
                        {/* Header section with Dropdown (Visible only in TRANSFER tab) */}
                        <View style={styles.dropdownWrapper}>
                            <View style={[
                                styles.workerSelector,
                                activeTab !== 'TRANSFER' && { borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' }
                            ]}>
                                <TouchableOpacity
                                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                                    onPress={() => {
                                        if (activeTab === 'TRANSFER') {
                                            setShowWorkerDropdown(!showWorkerDropdown);
                                        }
                                    }}
                                    disabled={activeTab !== 'TRANSFER'}
                                >
                                    <Text style={[
                                        styles.workerSelectorText,
                                        activeTab !== 'TRANSFER' && { color: '#6B7280' }
                                    ]}>
                                        {activeTab === 'TRANSFER'
                                            ? (selectedWorkerId ? MOCK_WORKERS.find(w => w.id === selectedWorkerId)?.name : 'Select Worker')
                                            : (currentWorkerName || 'My Stock')
                                        }
                                    </Text>
                                    {activeTab === 'TRANSFER' && (
                                        <Ionicons name={showWorkerDropdown ? "chevron-up" : "chevron-down"} size={22} color="#333" />
                                    )}
                                </TouchableOpacity>
                            </View>

                            {activeTab === 'TRANSFER' && showWorkerDropdown && (
                                <View style={styles.dropdownContent}>
                                    {MOCK_WORKERS.map(worker => (
                                        <TouchableOpacity
                                            key={worker.id}
                                            style={styles.dropdownItem}
                                            onPress={() => {
                                                setSelectedWorkerId(worker.id);
                                                setShowWorkerDropdown(false);
                                            }}
                                        >
                                            <Text style={styles.dropdownItemText}>{worker.name}</Text>
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
                                        <Image source={{ uri: product.imageUrl }} style={styles.productImage} />
                                        <View style={styles.productInfo}>
                                            <Text style={styles.productName}>{product.productName}</Text>
                                            <Text style={styles.availabilityText}>
                                                Available: {inventoryData?.find(inv => inv.inventory.product.productId === product.productId)?.totalPickedQuantity ?? '--'}
                                            </Text>
                                            <Text style={styles.priceText}>₹ {product.currentProductPrice}/packet</Text>
                                        </View>
                                    </View>

                                    <TextInput
                                        style={styles.qtyInput}
                                        value={quantities[product.productId] || ''}
                                        onChangeText={(val) => handleQtyChange(product.productId, val)}
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
                        {activeTab === 'PURCHASE' ? (
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
                                    <TouchableOpacity style={styles.paidButton}>
                                        <Text style={styles.paidButtonText}>Paid</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : null}

                        {/* Action Button */}
                        <View style={styles.actionButtonContainer}>
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={handleSubmit}
                            >
                                <Text style={styles.actionButtonText}>
                                    {activeTab === 'ADD' ? 'Add Products' : activeTab === 'TRANSFER' ? 'Transfer' : 'Purchase'}
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
        backgroundColor: '#F5F6FA',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backButton: {
        marginRight: 16,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#333',
    },
    tabSelectorContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: '#F5F6FA',
    },
    tabButton: {
        flex: 1,
        height: 48,
        backgroundColor: '#fff',
        borderRadius: 8,
        marginHorizontal: 4,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D1D5DB',
    },
    activeTabButton: {
        borderColor: '#3880FF',
        borderWidth: 2,
    },
    radioContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    radioButton: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#9CA3AF',
        marginRight: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    radioButtonActive: {
        borderColor: '#3880FF',
    },
    radioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#3880FF',
    },
    tabButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#6B7280',
    },
    activeTabButtonText: {
        color: '#3880FF',
        fontWeight: '700',
    },
    searchBarWrapper: {
        paddingHorizontal: 16,
        marginVertical: 12,
    },
    searchBar: {
        height: 48,
        backgroundColor: '#fff',
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        // M3 Shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    searchPlaceholder: {
        color: '#333',
        fontSize: 16,
        fontWeight: '400',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    inventoryContainer: {
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#3880FF',
        padding: 0,
        // Premium Shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 8,
        marginTop: 8,
        overflow: 'hidden',
    },
    dropdownWrapper: {
        padding: 16,
        paddingBottom: 0,
        zIndex: 10,
    },
    workerSelector: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#333',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        width: 150,
        marginBottom: 8,
    },
    workerSelectorText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#333',
    },
    dropdownContent: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        position: 'absolute',
        top: 60,
        left: 16,
        width: 150,
        shadowColor: '#000',
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
        borderBottomColor: '#F3F4F6',
    },
    dropdownItemText: {
        fontSize: 16,
        color: '#333',
    },
    headerDivider: {
        height: 2,
        backgroundColor: '#3880FF',
        marginTop: 4,
    },
    productCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 2,
        borderBottomColor: '#3880FF',
    },
    productLeft: {
        flexDirection: 'row',
        alignItems: 'center',
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
        fontWeight: '800',
        color: '#333',
    },
    availabilityText: {
        fontSize: 14,
        color: '#3880FF',
        fontWeight: '700',
        marginTop: 2,
    },
    priceText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginTop: 2,
    },
    qtyInput: {
        width: 90,
        height: 44,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        borderRadius: 10,
        textAlign: 'center',
        fontSize: 20,
        fontWeight: '800',
        color: '#333',
        backgroundColor: '#fff',
    },
    purchaseSummaryContainer: {
        padding: 16,
    },
    purchaseHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 12,
        borderBottomWidth: 2,
        borderBottomColor: '#3880FF',
        marginBottom: 16,
    },
    purchaseHeaderText: {
        fontSize: 22,
        fontWeight: '800',
        color: '#3880FF',
    },
    purchaseSummary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    amountBox: {
        flex: 1, // Take available space
        marginRight: 16, // Space between input and button
        borderWidth: 2,
        borderColor: '#10B981',
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    totalAmountInput: {
        fontSize: 22,
        fontWeight: '900',
        color: '#10B981',
        textAlign: 'center',
        padding: 0,
        width: '100%',
    },
    paidButton: {
        backgroundColor: '#10B981',
        borderRadius: 10,
        paddingHorizontal: 24, // Reduced padding slightly
        paddingVertical: 14,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 3,
        minWidth: 100, // Ensure button has a minimum clickable width
    },
    paidButtonText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '800',
    },
    actionButtonContainer: {
        paddingHorizontal: 16,
        paddingBottom: 20,
    },
    actionButton: {
        backgroundColor: '#3880FF',
        borderRadius: 10,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#3880FF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
    },
    actionButtonText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
});
