# Vitran Mobile App - Technical Guide

**Version**: 2.0 (Stable Offline)
**Repo**: `vitran-main/vitrann`
**Framework**: Expo (React Native) + TypeScript

---

## 1. Architecture Overview

- **Frontend**: React Native with Expo Managed Workflow.
- **State Management**: React Query (`@tanstack/react-query`) for server state, `useState` for local UI state.
- **Offline Storage**: `@react-native-async-storage/async-storage` for persisting the offline queue and auth tokens.
- **Navigation**: `expo-router` (File-based routing in `app/`).

---

## 2. Core Feature: Offline Logic (Direct-First)

The application uses a **"Direct-First"** strategy for critical actions like Delivery Submission to ensure reliability and data consistency.

### How It Works
1.  **Attempt Online**: When a user confirms a delivery, the app *always* attempts to send the data directly to the API first.
    - **Endpoint**: `POST /deliveries/process`
    - **Payload**: Individual Item DTO (see Section 3).
2.  **Fallback to Offline**: If the API call fails (Network Error, 500, etc.), the item is caught and saved to `AsyncStorage` via `OfflineQueueService`.
    - **Queue Key**: `offline_queue`
    - **User Feedback**: Toast says "Saved Offline", and a banner appears.
3.  **Sync**: When internet is restored, the user clicks **"Sync Now"**.
    - The `OfflineQueueService` iterates through the queue and retries the API call for each item.
    - Successful items are removed from the queue.

### Key Files
- `app/CustomerDeliveryScreen.tsx`: Implements the submission loop and fallback logic.
- `services/OfflineQueueService.ts`: Manages queue storage, retrieval, and syncing.
- `hooks/useOfflineQueue.ts`: React hook to expose queue state to the UI.

---

## 3. Backend Integration

### Delivery Submission Endpoint
- **URL**: `/products/process` (Note: Mapped to `/deliveries/process` in backend controller)
- **Method**: `POST`
- **DTO (Data Transfer Object)**:
    ```typescript
    interface ProcessDeliveryDto {
      customerId: number;
      inventoryId: number;      // Mapped from Product ID
      deliveredQuantity: number;
      billAmount: number;       // Calculated: quantity * price
      isPriceCustomized: boolean; // True if worker edited price
    }
    ```

**Critical Logic**: The frontend must iterate through the cart items and send **one request per item**. Sending an array of items (Bulk) is NOT supported by the current backend endpoint and will result in a `400 Bad Request`.

---

## 4. Setup & Build Instructions

### Prerequisites
- Node.js (v18+)
- EAS CLI: `npm install -g eas-cli`
- Expo CLI: `npm install -g expo`

### Running Locally
1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Start Development Server**:
    ```bash
    npx expo start
    ```
    - Press `w` for Web Preview (`localhost:8089`).
    - Scan QR code with Expo Go app for mobile.

### Production Build (APK)
We use EAS Build for generating production APKs.

1.  **Login to EAS**:
    ```bash
    eas login
    ```
2.  **Trigger Build (Android)**:
    ```bash
    eas build --platform android --profile preview
    ```
    - **Profile**: `preview` uses the production API (`https://theinfranova.com/api`) but produces an APK for side-loading (internal distribution).
    - **Config**: Settings are in `eas.json` and `.env`.

---

## 5. Troubleshooting

- **400 Bad Request**: Check that `inventoryId` is correctly mapped. The backend rejects payloads missing this field.
- **"Sync Needed" Loop**: If items refuse to sync, they might be malformed "zombie" records from older versions. Clear app data or use `AsyncStorage.clear()` (dev only) to reset.
- **Login Failures**: Ensure the `.env` file points to the correct production URL (`https://theinfranova.com/api`) and not `localhost`.

---

*Document created: Feb 2026*
