# Contributing to Vitran

Thank you for your interest in contributing to the Vitran mobile app!

## Development Guidelines

### 1. Code Style
- Use **TypeScript** for all new files.
- Prefer **Functional Components** with Hooks.
- Use `StyleSheet.create` for styling; avoid inline styles where possible.
- Ensure strict typing (avoid `any` unless absolutely necessary).

### 2. State Management
- Use **TanStack Query** for server state (data fetching).
- Use local `useState` or `useReducer` for UI state.
- Avoid global state stores (Redux/Context) unless managing app-wide settings (e.g., Theme, Auth).

### 3. Git Workflow
- Create feature branches: `feature/my-feature` or `fix/issue-description`.
- Write clear commit messages.
- Pull latest changes from `main` before pushing.

### 4. Performance
- Use `FlatList` for long lists.
- Memoize heavy computations with `useMemo` and callbacks with `useCallback`.
- Optimize re-renders by splitting components.

## Setup

1. Clone repo.
2. `npm install`
3. Setup `.env`.
4. `npx expo start`
