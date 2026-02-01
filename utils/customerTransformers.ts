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
        const associatedProducts = activeRelations
            .filter(rel => rel.customerId === item.customer.customerId)
            .map(rel => rel.productId!)
            .filter(id => id !== null);

        return {
            id: item.customer.customerId.toString(),
            name: `${item.customer.firstName} ${item.customer.lastName || ''}`.trim(),
            type: item.customer.classification === 'B2B' ? 'B2B' : 'B2C',
            address: `${item.customer.address1}${item.customer.address2 ? ', ' + item.customer.address2 : ''}, ${item.customer.city || ''} ${item.customer.pincode || ''}`.trim(),
            deliveredItems: [],
            paymentReceived: 0,
            customerId: item.customer.customerId,
            deliveryConfirmed: false,
            sequenceNumber: item.sequenceNumber,
            associatedProductIds: associatedProducts
        };
    });
};
