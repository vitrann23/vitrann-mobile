import { useState, useEffect, useCallback } from "react";
import { OfflineQueueService } from "../services/OfflineQueueService";
import NetInfo from "@react-native-community/netinfo";
import Toast from "react-native-toast-message";
import { Platform } from "react-native";

export const useOfflineQueue = () => {
  const [queueSize, setQueueSize] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online =
        !!state.isConnected &&
        (Platform.OS === "web" || !!state.isInternetReachable);
      setIsOnline(online);

      // Auto-sync when online
      if (online && queueSize > 0) {
        syncQueue();
      }
    });

    return () => unsubscribe();
  }, [queueSize]);

  // Monitor queue size
  const updateQueueSize = useCallback(async () => {
    const size = await OfflineQueueService.getQueueSize();
    setQueueSize(size);
  }, []);

  // Initial check
  useEffect(() => {
    updateQueueSize();
  }, [updateQueueSize]);

  const addToQueue = async (
    type: "delivery" | "stock" | "cash" | "return",
    data: any,
    id: string,
  ) => {
    await OfflineQueueService.addToQueue({
      id,
      type,
      data,
    });
    await updateQueueSize();

    Toast.show({
      type: "info",
      text1: "Saved Offline",
      text2: "Will sync when connection is available",
    });
  };

  const syncQueue = async () => {
    if (isSyncing || queueSize === 0) return;

    setIsSyncing(true);
    try {
      const result = await OfflineQueueService.syncQueue();
      await updateQueueSize();

      if (result.synced > 0) {
        Toast.show({
          type: "success",
          text1: "Sync Complete",
          text2: `Synced ${result.synced} items`,
        });
      }
    } catch (error) {
      console.error("Sync error:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    queueSize,
    isSyncing,
    isOnline,
    addToQueue,
    syncQueue,
    updateQueueSize,
  };
};
