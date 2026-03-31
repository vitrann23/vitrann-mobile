// Centralized type definitions for the mobile app

export interface Worker {
    workerId: number;
    firstName: string;
    lastName: string | null;
    phoneNumber: string;
    role: 'WORKER';
    isActive: boolean;
}

export interface Customer {
    customerId: number;
    firstName: string;
    lastName: string | null;
    address1: string;
    address2: string | null;
    phoneNumber: string | null;
    city: string | null;
    pincode: string | null;
    classification: 'B2B' | 'B2C';
}

export interface WorkerCustomer {
    id: number;
    workerId: number;
    customerId: number;
    fromDate: string;
    sequenceNumber: number;
    thruDate: string | null;
    customer: Customer;
}

export interface Product {
    productId: number;
    productName: string;
    currentProductPrice: number;
    lastProductPrice?: number | null;
    storeId: string;
    imageUrl: string | null;
    description: string | null;
}

export interface Inventory {
    inventoryId: number;
    totalOrderedQuantity: number;
    receivedQuantity: number | null;
    remainingQuantity: number | null;
    date: string;
    product: Product;
}

export interface WorkerInventory {
    id: number;
    workerId: number;
    inventoryId: number;
    totalPickedQuantity: number | null;
    totalDeliveredQuantity?: number;
    transferredInQuantity?: number;
    transferredOutQuantity?: number;
    availableQuantity?: number; // Computed by backend
    remainingQuantity: number | null;
    date: string;
    inventory: Inventory;
}

export interface CustomerProductRelation {
    id: number;
    customerId: number;
    productId: number | null;
    quantityAssociated: number;
    fromDate: string;
    thruDate: string | null;
    product: Product;
    effectivePrice: number;
    isCustomPrice: boolean;
}

export interface DeliveredItem {
    name: string;
    qty: number;
    productId: number;
    price: number;
    originalPrice: number;
    isEdited: boolean;
}

export interface CustomerForDelivery {
    id: string;
    name: string;
    type: 'B2B' | 'B2C';
    address: string;
    deliveredItems: DeliveredItem[];
    paymentReceived: number;
    customerId: number;
    deliveryConfirmed: boolean;
    sequenceNumber: number;
    associatedProductIds?: number[];
    associatedProductPrices?: Record<number, { price: number, isCustom: boolean }>;
    isPaid: boolean;
}

export interface OfflineQueueItem {
    id: string;
    type: 'delivery' | 'stock' | 'cash' | 'return';
    data: any;
    timestamp: number;
    retries: number;
}

export interface ApiResponse<T> {
    success: boolean;
    message: string;
    data: T;
}
