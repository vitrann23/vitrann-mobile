import axios, { AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Prioritize process.env for standard Expo/Web support
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL ?? 'https://theinfranova.com/api';

console.log('🚀 [API Client] Initialized with Base URL:', API_BASE_URL);

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 15000,
});

// Request Interceptor: Inject Auth Token
apiClient.interceptors.request.use(
    async (config) => {
        try {
            let token;
            if (Platform.OS === 'web') {
                token = await AsyncStorage.getItem('authToken');
            } else {
                token = await SecureStore.getItemAsync('authToken');
            }

            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        } catch (error) {
            console.error('Error fetching token from SecureStore:', error);
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response Interceptor: Centralized Error Handling
apiClient.interceptors.response.use(
    (response) => response.data,
    (error: AxiosError) => {
        const status = error.response?.status;
        const message = (error.response?.data as any)?.message || error.message;

        console.error(`[API Error] ${status || 'Network'}: ${message}`);

        if (status === 401) {
            // Logic for token expiration can be added here
            console.warn('Unauthorized request - session may have expired');
        }

        return Promise.reject({
            status,
            message,
            data: error.response?.data,
        });
    }
);

export default apiClient;
