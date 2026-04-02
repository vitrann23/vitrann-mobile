import { DeliveredItem } from '../types';

/**
 * Calculate total payment from delivered items
 */
export const calculateTotalPayment = (items: DeliveredItem[]): number => {
    return items.reduce((sum, item) => sum + item.price, 0);
};

/**
 * Calculate total quantity delivered
 */
export const calculateTotalQuantity = (items: DeliveredItem[]): number => {
    return items.reduce((sum, item) => sum + item.qty, 0);
};

/**
 * Check if any prices were edited
 */
export const hasEditedPrices = (items: DeliveredItem[]): boolean => {
    return items.some(item => item.isEdited);
};
