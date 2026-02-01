import Toast from 'react-native-toast-message';
import { router } from 'expo-router';

/**
 * Centralized error handling for API calls
 */
export const handleApiError = (error: any, context?: string) => {
    console.error(`[Error${context ? ` - ${context}` : ''}]:`, error);

    // Handle authentication errors
    if (error.response?.status === 401) {
        Toast.show({
            type: 'error',
            text1: 'Session Expired',
            text2: 'Please login again',
            visibilityTime: 3000,
        });
        router.replace('/');
        return;
    }

    // Handle server errors
    if (error.response?.status === 500) {
        Toast.show({
            type: 'error',
            text1: 'Server Error',
            text2: 'Please try again later',
            visibilityTime: 3000,
        });
        return;
    }

    // Handle network errors
    if (error.message === 'Network Error' || !error.response) {
        Toast.show({
            type: 'error',
            text1: 'Network Error',
            text2: 'Please check your connection',
            visibilityTime: 3000,
        });
        return;
    }

    // Generic error
    Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.response?.data?.message || error.message || 'Something went wrong',
        visibilityTime: 3000,
    });
};
