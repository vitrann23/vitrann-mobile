import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

// Configure QueryClient with optimized defaults
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
            gcTime: 30 * 60 * 1000, // 30 minutes - garbage collection time
            retry: 2, // Retry failed requests twice
            refetchOnWindowFocus: false, // Don't refetch on app focus (mobile)
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
