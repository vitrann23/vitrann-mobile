import { useQuery } from "@tanstack/react-query";
import apiClient from "../services/apiClient";
import { ApiResponse, WorkerCustomer } from "../types";

/**
 * Fetch worker's assigned customers
 * Cached for 5 minutes, persists for 30 minutes
 */
export const useCustomers = () => {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const response = (await apiClient.get(
        "/daily-activity-ci/my-customers",
      )) as ApiResponse<WorkerCustomer[]>;
      if (!response.success) {
        throw new Error(response.message || "Failed to fetch customers");
      }
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};
