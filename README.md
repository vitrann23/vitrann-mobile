# 🥛 Vitran (Dairy Management App)

A robust mobile application built with **React Native**, **Expo Router**, and **TanStack Query** to manage dairy product distribution efficiently. Designed for high performance even with large datasets (200+ customers) and offline capabilities.

## 🚀 Features

- **Optimized Data Fetching**: Utilizes **TanStack Query** for caching, background updates, and offline support.
- **Offline-First Architecture**: Changes are queued and synced automatically when back online.
- **Performance**: Virtualized lists (`FlatList`) for smooth rendering of large customer routes.
- **Worker Login**: Secure login with input validation.
- **Dark Mode**: Sleek dark-themed interface.
- **Daily Summary**: Track deliveries, cash collected, and inventory.

## 🛠 Tech Stack

- **Framework**: React Native (Expo)
- **Routing**: Expo Router (File-based routing)
- **State/Data**: @tanstack/react-query + Zustand (optional/local state)
- **Offline Storage**: Async Storage
- **Network**: Axios + NetInfo
- **UI**: Custom components with StyleSheet

## 📦 Installation

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd vitran-mobile
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Setup**:
   Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Update `EXPO_PUBLIC_API_URL` with your backend URL.

4. **Run the app**:
   ```bash
   npx expo start
   ```

## 🏗 Project Structure

- `app/`: Expo Router screens and layout.
- `components/`: Reusable UI components.
- `hooks/`: Custom hooks (business logic & data fetching).
- `services/`: API clients and background services.
- `types/`: TypeScript definitions.
- `utils/`: Helper functions (calculations, transformers).

## ⚡️ Key Optimizations

- **CustomerDeliveryScreen**: Refactored to separate business logic from UI.
- **TanStack Query**: `gcTime` set to 30 mins to reduce network load.
- **Memoization**: Heavy calculations derived only when dependencies change.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
