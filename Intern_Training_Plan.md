# 15-Day Mobile Development Intern Training Programme

## Overview
**Duration:** 15 Days
**Goal:** Transform a developer with basic JS knowledge into a productive React Native contributor.
**Philosophy:** "Learn the Concept in Abstract -> Apply the Concept to Vitran."
**Structure:**
- **Phase 1 (Days 1-2):** Setup & Codebase Immersion.
- **Phase 2 (Days 3-13):** Core Competency Training (General Learning + Vitran Application).
- **Phase 3 (Days 14-15):** Final Capstone Feature.

---

## Phase 1: Onboarding, Setup & Understanding (Days 1-2)
**Focus:** Environment, Tools, and the "Big Picture".

### Day 1: The Ecosystem & Environment
**Objective:** Establish a working development environment and understand the toolchain.
- **Concept (General):**
    - What is React Native? vs Native (Swift/Kotlin).
    - What is Expo? (Managed vs Bare workflow).
    - What is EAS (Expo Application Services)?
- **Task (Vitran Specific):**
    - Environment Setup: Node.js, Git, VS Code, Android Studio/Xcode (simulators).
    - **Action:** Clone `vitran-main`.
    - **Action:** Install dependencies (`npm install`).
    - **Action:** Run the app (`npx expo start`) on both Simulator and Physical Device (using Expo Go).
- **Deliverable:**
    - A screenshot of the app running on their local machine/phone.
    - A brief "Environment Log" detailing node version, expo version, and any troubleshooting steps taken.

### Day 2: Architecture & "The Vitran Flow"
**Objective:** Understand the business logic without writing code.
**Concepts:**
- **Product Walkthrough:** Login as a Worker -> Select a Customer -> Manage Inventory -> Finalize Delivery.
- **Codebase Navigation:**
    - `app/`: Routing and Screens.
    - `components/`: Reusable UI.
    - `assets/`: Images and fonts.
- **Task (Vitran Specific):**
    - Audit `app.json` to understand the app config (name, slug, splash screen).
    - helper Read `package.json` to list major libraries used (e.g., `async-storage`, `expo-router`).
- **Deliverable:**
    - **System Diagram:** Draw a simple block diagram showing the flow involves: `Login Screen` -> `API Auth` -> `Dashboard/Stock Screen` -> `Delivery Flow`.

---

## Phase 2: Core Competencies (Days 3-13)
**Focus:** Master a concept generally, then see how Vitran implements it.

### Day 3: UI Fundamentals (Flexbox & Layouts)
**Objective:** Master mobile layouts.
- **Concept (General):**
    - Box Model in Mobile.
    - Flexbox: `flexDirection`, `justifyContent`, `alignItems`.
    - `SafeAreaView` concepts.
- **Application (Vitran):**
    - Study `app/index.tsx` (Login Screen). Note how `KeyboardAvoidingView` and `LinearGradient` are used.
- **Deliverable:**
    - Create a file `app/practice-ui.tsx`.
    - Build a **Static Profile Card** UI (hardcoded) that mimics the design style of Vitran (using the same colors and spacing) but is NOT part of the real app.

### Day 4: Navigation (Expo Router)
**Objective:** Understand file-based routing.
- **Concept (General):**
    - Stack Navigation vs Tab Navigation.
    - Passing parameters between screens.
    - The `_layout.tsx` file pattern.
- **Application (Vitran):**
    - Analyze how `Login` passes `workerId` to `MorningStockScreen`.
    - Trace the routing from `CustomerDeliveryScreen` to `CashDetailsScreen`.
- **Deliverable:**
    - Add a button to your `practice-ui` screen that navigates to a new "Details" screen, passing a static ID as a parameter.

### Day 5: Component Reusability & Props
**Objective:** Write clean, DRY (Don't Repeat Yourself) code.
- **Concept (General):**
    - Functional Components.
    - Props Interface (TypeScript).
    - Children props.
- **Application (Vitran):**
    - Review `components/ThemedView.tsx`.
    - Identify a repeated UI pattern in `CustomerDeliveryScreen` (e.g., the product row item) that is currently inline code but *should* be a component.
- **Deliverable:**
    - **Refactor Prototype:** Extract one logical UI chunk from `CustomerDeliveryScreen` (copy-paste the code to a separate file first) and turn it into a reusable component `ProductRow.tsx` which accepts props like `productName`, `price`, `qty`. *(Do not break the main app yet, do this in a sandbox file)*.

### Day 6: TypeScript for React Native
**Objective:** Type safety and reliability.
- **Concept (General):**
    - Interfaces vs Types.
    - Typing Props and State.
    - Handling API Response types.
- **Application (Vitran):**
    - Study the complex types in `CustomerDeliveryScreen.tsx`: `DeliveredItem`, `Customer`, `WorkerInventory`.
    - Understand why `associatedProductIds?: number[]` is optional.
- **Deliverable:**
    - Write a TypeScript Interface for a hypothetical "Vehicle" object (id, licensePlate, capacity) and a function that accepts this interface as an argument.

### Day 7: State Management (Hooks)
**Objective:** Handling local data.
- **Concept (General):**
    - `useState` basics.
    - `useEffect` lifecycles (Mount, Update, Unmount).
    - Dependency Arrays.
- **Application (Vitran):**
    - **Deep Dive:** Look at `CustomerDeliveryScreen` lines 163-172.
    - Explain why `customers` state is an array and how `setCustomers` is used to update a *single* item within that array (immutability).
- **Deliverable:**
    - Create a simple Counter component that has:
        - Increment/Decrement buttons.
        - A rule: Counter cannot go below 0 (Logic).
        - A "Max Limit" warning toast.

### Day 8: Networking & API Integration
**Objective:** Communicating with the backend.
- **Concept (General):**
    - REST APIs.
    - JSON parsing.
    - Async/Await & Promises.
    - Headers (Authorization Tokens).
- **Application (Vitran):**
    - Analyze `makeAuthenticatedRequest` in `CustomerDeliveryScreen.tsx`.
    - Understand how the Base URL is managed via `Constants`.
- **Deliverable:**
    - Write a standalone script (inside the app) that fetches data from `https://jsonplaceholder.typicode.com/todos/1` and displays the title on screen.

### Day 9: Local Storage & Persistence
**Objective:** Keeping data across app restarts.
- **Concept (General):**
    - Async Storage pattern (Key-Value pairs).
    - Security implications (what not to store).
- **Application (Vitran):**
    - Check where `authToken` is saved on Login.
    - Check how it's retrieved for API calls.
- **Deliverable:**
    - Modify your Counter component (from Day 7) to save the count to `AsyncStorage`. When the app reloads, the counter should start at the saved number, not 0.

### Day 10: Handling Complex Business Logic
**Objective:** Moving beyond simple CRUD.
- **Concept (General):**
    - Computed properties.
    - Filtering and Mapping arrays.
    - Client-side validation.
- **Application (Vitran):**
    - **The Challenge:** Study the function `handleAddAssociatedProduct`.
    - Logic Trace: It checks inventory -> checks stock -> checks limits -> adds to list -> updates state.
- **Deliverable:**
    - **Logic Flowchart:** Draw a flowchart diagramming specifically the `handleAddAssociatedProduct` function's decision tree.

### Day 11: Debugging & Troubleshooting
**Objective:** How to fix things when they break.
- **Concept (General):**
    - Reading Stack Traces.
    - Using `console.log` effectively.
    - React Native Debugger / Redux DevTools (if applicable).
- **Application (Vitran):**
    - Introduce a purposeful bug (e.g., typo in API URL).
    - Observe how the app handles it (Loading spinners? Error Toasts?).
- **Deliverable:**
    - Fix a small "Todo" bug provided by the mentor (Mentor should purposely comment out a line like `setLoading(false)` to let the intern find it).

### Day 12: Code Quality & Best Practices
**Objective:** Writing maintainable code.
- **Concept (General):**
    - File structure organization.
    - Naming conventions (`handlePress` vs `onClick`).
    - Removing dead code / console logs.
- **Application (Vitran):**
    - Run `npx expo lint` (if configured) or review `CustomerDeliveryScreen` for any unused imports.
- **Deliverable:**
    - **Refactor PR:** Submit a small cleanup PR (e.g., organize imports, add comments to complex functions, remove unused variables).

### Day 13: Preparing for Deployment
**Objective:** The release lifecycle.
- **Concept (General):**
    - AppVersioning (Major.Minor.Patch).
    - Environment Variables (.env).
    - Build Processes (.apk / .ipa).
- **Application (Vitran):**
    - Review `eas.json` and `app.json`.
    - Understand the build command `eas build --platform android`.
- **Deliverable:**
    - Bump the version number in `app.json` (e.g., 1.0.0 -> 1.0.1) and generate a local summary of changes.

---

## Phase 3: The Final Deliverable (Days 14-15)
**Focus:** Prove your skills.

### Days 14 & 15: The Mini-Feature Capstone
**Task:** Implement a **"Search & Filter"** feature for the Customer List.
**Context:** Currently, the `CustomerDeliveryScreen` shows a horizontal tab list of customers.
**Requirement:**
1. Add a `TextInput` search icon/bar above the tabs.
2. Typing "Ran" should filter the tabs to show only customers named "Ranjit", "Randy", etc.
3. If the currently selected customer is filtered out, the selection logic should handle it gracefully (select first visible or show "No results").
**Deliverable:**
- A specific Pull Request (PR) containing:
    - The new UI code.
    - The filtering logic function.
    - No regressions (existing delivery flow still works).
