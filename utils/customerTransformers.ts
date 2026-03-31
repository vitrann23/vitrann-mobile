import { WorkerCustomer, CustomerForDelivery, CustomerProductRelation } from '../types';

/**
 * Transform API customer data to delivery format
 */
export const transformCustomersForDelivery = (
    customers: WorkerCustomer[],
    relations: CustomerProductRelation[]
): CustomerForDelivery[] => {
    const sortedCustomers = customers.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    const activeRelations = relations.filter(rel => rel.thruDate === null && rel.productId !== null);
    
    return sortedCustomers.map((item) => {
        const customerRelations = activeRelations.filter(rel => rel.customerId === item.customer.customerId);
        
        const associatedProductIds = customerRelations.map(rel => rel.productId!).filter(id => id !== null);
        
        const associatedProductPrices: Record<number, { price: number, isCustom: boolean }> = {};
        customerRelations.forEach(rel => {
            if (rel.productId) {
                associatedProductPrices[rel.productId] = {
                    price: rel.effectivePrice,
                    isCustom: rel.isCustomPrice
                };
            }
        });

        // Robust B2B Identification: check classification and other potential API fields
        const isB2B = 
            item.customer?.classification?.toUpperCase() === 'B2B' || 
            (item as any).classification?.toUpperCase() === 'B2B' ||
            (item.customer as any)?.type?.toUpperCase() === 'B2B' ||
            (item as any).customerType?.toUpperCase() === 'B2B';

        return {
            id: item.customer.customerId.toString(),
            name: `${item.customer?.firstName || 'Unknown'} ${item.customer?.lastName || ''}`.trim(),
            type: isB2B ? 'B2B' : 'B2C',
            isPaid: false, // Initial state for all customers
            address: `${item.customer.address1}${item.customer.address2 ? ', ' + item.customer.address2 : ''}, ${item.customer.city || ''} ${item.customer.pincode || ''}`.trim(),
            deliveredItems: [],
            paymentReceived: 0,
            customerId: item.customer.customerId,
            deliveryConfirmed: false,
            sequenceNumber: item.sequenceNumber,
            associatedProductIds,
            associatedProductPrices
        };
    });
};
