import { useQuery } from '@tanstack/react-query';
import apiClient from '../services/apiClient';
import { ApiResponse, CustomerProductRelation } from '../types';

/**
 * Fetch customer-product relations
 * Cached for 5 minutes, persists for 30 minutes
 */
export const useCustomerProducts = () => {
    return useQuery({
        queryKey: ['customerProducts'],
        queryFn: async () => {
            const response = await apiClient.get('/relations/customer-products') as ApiResponse<CustomerProductRelation[]>;
            if (!response.success) {
                throw new Error(response.message || 'Failed to fetch customer products');
            }
            return response.data;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 30 * 60 * 1000, // 30 minutes
    });
};
