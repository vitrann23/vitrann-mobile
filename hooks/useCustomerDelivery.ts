import { useState, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CustomerForDelivery } from '../types';
import { useCustomers } from './useCustomers';
import { useInventory } from './useInventory';
import { useCustomerProducts } from './useCustomerProducts';
import { transformCustomersForDelivery } from '../utils/customerTransformers';
import { handleApiError } from '../utils/errorHandler';

export const useCustomerDelivery = () => {
    const {
        data: customersData,
        isLoading: isLoadingCustomers,
        error: errorCustomers,
        refetch: refetchCustomers
    } = useCustomers();

    const {
        data: inventoryData,
        isLoading: isLoadingInventory,
        error: errorInventory
    } = useInventory();

    const {
        data: relationsData,
        isLoading: isLoadingRelations,
        error: errorRelations
    } = useCustomerProducts();

    const [customers, setCustomers] = useState<CustomerForDelivery[]>([]);
    const [loading, setLoading] = useState(true);

    // Combine loading states
    const isApiLoading = isLoadingCustomers || isLoadingInventory || isLoadingRelations;

    // Combine errors
    const apiError = errorCustomers || errorInventory || errorRelations;

    // Transform data when available
    useEffect(() => {
        if (customersData && relationsData && !isApiLoading) {
            try {
                const transformed = transformCustomersForDelivery(customersData, relationsData);
                setCustomers(transformed);
                setLoading(false);

                // Cache for offline use
                AsyncStorage.setItem('offline_customers', JSON.stringify(transformed));
                if (inventoryData) {
                    AsyncStorage.setItem('offline_inventory', JSON.stringify(inventoryData));
                }
                AsyncStorage.setItem('offline_relations', JSON.stringify(relationsData));
            } catch (error) {
                console.error('Error transforming data:', error);
                handleApiError(error, 'Data Transformation');
                setLoading(false);
            }
        } else if (apiError) {
            // Try loading from offline cache
            loadFromCache();
        }
    }, [customersData, relationsData, inventoryData, isApiLoading, apiError]);

    const loadFromCache = async () => {
        try {
            const cachedCustomers = await AsyncStorage.getItem('offline_customers');
            if (cachedCustomers) {
                setCustomers(JSON.parse(cachedCustomers));
                setLoading(false);
            } else {
                setLoading(false);
            }
        } catch (error) {
            console.error('Error loading cache:', error);
            setLoading(false);
        }
    };

    const refetchData = () => {
        setLoading(true);
        refetchCustomers();
        // Invalidate other queries if needed
    };

    return {
        customers,
        inventory: inventoryData,
        relations: relationsData,
        loading: loading || isApiLoading,
        error: apiError,
        refetchData,
        setCustomers // Exposed for local updates (optimistic UI)
    };
};
