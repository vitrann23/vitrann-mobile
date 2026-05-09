import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ASYNC_SESSION_KEYS = [
  "authToken",
  "workerId",
  "workerName",
  "userType",
  "lastActiveScreen",
  "offline_customers",
  "offline_inventory",
  "offline_inventory_raw",
  "offline_relations",
];

const SECURE_SESSION_KEYS = ["authToken", "workerId"];

export const clearAuthSession = async () => {
  const allAsyncKeys = await AsyncStorage.getAllKeys().catch(() => []);
  const workerScopedKeys = allAsyncKeys.filter((key) =>
    key.startsWith("assoc_qty_"),
  );

  await AsyncStorage.multiRemove([
    ...ASYNC_SESSION_KEYS,
    ...workerScopedKeys,
  ]);

  if (Platform.OS !== "web") {
    await Promise.all(
      SECURE_SESSION_KEYS.map((key) =>
        SecureStore.deleteItemAsync(key).catch(() => undefined),
      ),
    );
  }
};
