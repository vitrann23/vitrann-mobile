import { useQuery } from "@tanstack/react-query";
import apiClient from "../services/apiClient";
import { ApiResponse, WorkerInventory } from "../types";

/**
 * Fetch worker's inventory
 * Cached for 5 minutes, persists for 30 minutes
 */
export const useInventory = () => {
  return useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const response = (await apiClient.get(
        "/daily-activity-ci/my-inventory",
      )) as ApiResponse<WorkerInventory[]>;
      if (!response.success) {
        throw new Error(response.message || "Failed to fetch inventory");
      }
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};
