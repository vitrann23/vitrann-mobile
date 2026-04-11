# Vitran Mobile App - Fix Plan (Part 2)

This document details the root causes and implemented fixes for the second set of 10 issues refined in the `fix/multiple-issues` branch.

---

### 1. Daily Summary Variance Color & UI
**Issue:** Variance values were using a generic red/green logic that didn't distinguish between +ve and -ve as requested. UI lacked premium branding.
- **Cause:** Conditional coloring only checked `!== 0`.
- **Fix Plan:** Updated logic to `v > 0 ? green : v < 0 ? red : neutral`. Applied `LeagueSpartan` font family across all summary components for a premium look.

### 2. Payment Persistence (Zero values)
**Issue:** If a user manually sets a B2B payment to zero, it would revert to the default (total) upon returning to the screen.
- **Cause:** `manualB2bPayment` was local state that reset to `null` on mount or customer change, falling back to the calculated total.
- **Fix Plan:** Added a `manualPayment` field to the `CustomerForDelivery` type. Edits are now saved directly into the `customers` state array, which persists during the component lifecycle.

### 3. "No Stock !!" Popup
**Issue:** Insufficient stock message was too verbose.
- **Cause:** Generic "Insufficient Stock" title and long description.
- **Fix Plan:** Updated the Toast title to a big, bold **"No Stock !!"** and kept the description concise.

### 4. Close Menu on Outside Click
**Issue:** The hamburger menu would only close if the menu button was clicked again.
- **Cause:** No listener or overlay was present to detect clicks outside the menu boundaries.
- **Fix Plan:** Added a full-screen transparent `TouchableOpacity` overlay that appears when the menu is visible. Clicking anywhere outside the menu now triggers `setMenuVisible(false)`.

### 5. Delivery Confirmation Popup Timing
**Issue:** The green checkmark confirmation stayed on screen too long.
- **Cause:** `setTimeout` was set to `1000ms`.
- **Fix Plan:** Reduced the timeout to `50ms` as requested, making the feedback snappy while still providing a visual cue.

### 6. Logout on Error Screen
**Issue:** When the app fails to load (e.g., "No token provided"), there was no way to log out and try a different account.
- **Cause:** The error state only provided a "Retry" button.
- **Fix Plan:** Added a "Logout" button to the `errorContainer` in `CustomerDeliveryScreen`, styled in high-visibility red.

### 7. Global Resync Button
**Issue:** Need a way to clear cache and refresh all data (Products, Customers, Inventory) manually.
- **Cause:** Data could become stale due to long cache times in React Query or local AsyncStorage persistence.
- **Fix Plan:** Added a `refresh-circle` button in the header. 
  - **Logic:** Clears `AsyncStorage` keys and resets React Query via `queryClient.resetQueries()`.
  - **Aesthetics:** Color is Purple (`#590194`) if data is from cache (ready to resync), or Grey (`#BDBDBD`) otherwise.

### 8. Login Logo Resizing
**Issue:** Login logo was too small.
- **Cause:** Styles were set to `180x180`.
- **Fix Plan:** Updated logo dimensions to `320px Width` and `300px Height`.

### 9. App Icon Fix
**Issue:** Phone app icon looks improper/cut-off.
- **Cause:** Primary logo lacked the necessary padding for Android's adaptive icon safe zone.
- **Fix Plan:** Updated `app.json` to use `icon_fix.png` for both the main icon and the adaptive foreground image, ensuring the logo sits properly within the safe zone.

### 10. CDS Labeling: "Other Product" -> "Add"
**Issue:** Placeholder "Other Product" was confusing.
- **Cause:** Hardcoded string in the UI.
- **Fix Plan:** Changed all instances of "Other Product" to "Add" for a cleaner, more intuitive action label.
