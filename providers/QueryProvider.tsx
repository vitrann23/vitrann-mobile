import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

// Configure QueryClient with optimized defaults
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 0, // Always fetch fresh
            gcTime: 0, // No garbage collection caching
            retry: 2, // Retry failed requests twice
            refetchOnWindowFocus: false, // Refetch manually when needed to avoid race conditions
            refetchOnMount: true, // Refetch deeply on unmount/mount
            refetchOnReconnect: true, // Refetch when network reconnects
        },
        mutations: {
            retry: 1, // Retry mutations once
        },
    },
});

interface QueryProviderProps {
    children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

export { queryClient };
