import AsyncStorage from '@react-native-async-storage/async-storage';
import { OfflineQueueItem } from '../types';
import apiClient from '../services/apiClient';
import Toast from 'react-native-toast-message';

const QUEUE_KEY = 'offline_queue';

export class OfflineQueueService {
    /**
     * Add item to offline queue
     */
    static async addToQueue(item: Omit<OfflineQueueItem, 'timestamp' | 'retries'>) {
        try {
            const queue = await this.getQueue();
            const newItem: OfflineQueueItem = {
                ...item,
                timestamp: Date.now(),
                retries: 0
            };

            queue.push(newItem);
            await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
            return true;
        } catch (error) {
            console.error('Error adding to queue:', error);
            return false;
        }
    }

    /**
     * Get all queued items
     */
    static async getQueue(): Promise<OfflineQueueItem[]> {
        try {
            const queueJson = await AsyncStorage.getItem(QUEUE_KEY);
            return queueJson ? JSON.parse(queueJson) : [];
        } catch (error) {
            console.error('Error getting queue:', error);
            return [];
        }
    }

    /**
     * Sync queue with backend
     */
    static async syncQueue() {
        const queue = await this.getQueue();
        if (queue.length === 0) return { success: true, synced: 0, failed: 0 };

        let syncedCount = 0;
        let failedCount = 0;
        const remainingQueue: OfflineQueueItem[] = [];

        for (const item of queue) {
            try {
                let success = false;

                // Handle different action types
                if (item.type === 'delivery') {
                    await apiClient.post('/deliveries/process', item.data);
                    success = true;
                }

                if (success) {
                    syncedCount++;
                } else {
                    item.retries++;
                    remainingQueue.push(item);
                    failedCount++;
                }
            } catch (error) {
                console.error(`Sync failed for item ${item.id}:`, error);
                item.retries++;
                remainingQueue.push(item);
                failedCount++;
            }
        }

        // Update queue with remaining items
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remainingQueue));

        return { success: true, synced: syncedCount, failed: failedCount };
    }

    /**
     * Get queue size
     */
    static async getQueueSize() {
        const queue = await this.getQueue();
        return queue.length;
    }
}
