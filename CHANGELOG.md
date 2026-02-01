# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **TanStack Query**: Integrated `@tanstack/react-query` for efficient data fetching and caching.
- **Offline Support**: `useOfflineQueue` and `OfflineQueueService` to handle actions when network is unavailable.
- **Custom Hooks**:
  - `useCustomers`: Fetches and caches customer data.
  - `useInventory`: Fetches and caches inventory.
  - `useCustomerDelivery`: Aggregates data for the delivery screen.
- **Documentation**: Added README, CHANGELOG, and CONTRIBUTING guides.

### Changed
- **CustomerDeliveryScreen**: 
  - Massive refactor reducing line count and complexity.
  - Switched from `ScrollView` to `FlatList` for customer tabs to improve performance.
  - Replaced manual `useEffect` fetching with `useQuery` hooks.
- **Data Handling**:
  - Centralized type definitions in `types/index.ts`.
  - Extracted calculations to `utils/deliveryCalculations.ts`.
  - Extracted transformers to `utils/customerTransformers.ts`.

### Fixed
- **Performance**: Solved lag issues with 200+ customers by implementing virtualization and memoization.
- **Reliability**: Improved offline sync reliability with queue system.
