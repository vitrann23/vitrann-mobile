# Issues Fix Plan

## 1. Unauthorized Redirect Loop
**Cause:** 
When the `MorningStockScreen` encounters a 401 Unauthorized error, it routes to `/` (the login screen) without clearing the cached tokens. The login screen checks the cache, finds the tokens, and immediately redirects back to `MorningStockScreen`, creating an infinite loop.
**Fix Plan:** 
Use the `handleLogout` logic (or clear `AsyncStorage`/`SecureStore`) when receiving a 401 before calling `router.replace("/")`, ensuring the cache is clear so the user stays on the login screen.

## 2. Available Quantities Showing Negative
**Cause:** 
In `ProductDeliveryModal.tsx`, the `availableQty` is calculated as `product.availableQty - globalDelivered` without any floor. Due to staleness or edge cases, this subtraction can yield a negative number, which is directly displayed on the screen.
**Fix Plan:** 
Add a `Math.max(0, ...)` wrapper around the subtraction when calculating `availableQty` so it never displays a negative value.

## 3. Morning Stock Availability Not Updating After Entry
**Cause:** 
After successfully submitting picked quantities in `MorningStockScreen` via the backend API, the app transitions to `CustomerDeliveryScreen` without invalidating the React Query `"inventory"` cache. Because the cache has a 5-minute stale time, the delivery screen continues using the stale stock values.
**Fix Plan:** 
Call `queryClient.invalidateQueries({ queryKey: ["inventory"] })` immediately after a successful response in `MorningStockScreen`, so the next screens load fresh inventory data.

## 4. Customer Chip Not Marked Green Upon Delivery
**Cause:** 
There is a race condition in `CustomerDeliveryScreen`. Upon confirmation, the optimistic UI update is saved to local storage via an un-awaited `AsyncStorage.setItem`. Right after, `queryClient.invalidateQueries` triggers a re-fetch of inventory, which causes a re-render. The re-evaluating hook reads from `AsyncStorage` before the set operation finishes, pulling out the old (unconfirmed) state and reverting the UI marker.
**Fix Plan:** 
`await` the `AsyncStorage.setItem` call before triggering the query invalidate or ensure local state overrides correctly immediately.

## 5. Showing Delivered Quantity & Payment For Confirmed Customers
**Cause:** 
Once `deliveryConfirmed` is set to true on the customer object, the `<TextInput>` for editing quantities is un-rendered, leaving only a green checkmark icon. No text explicitly displays the delivered quantity.
**Fix Plan:** 
Add a conditionally rendered `<Text>` label next to the checkmark showing the quantity delivered (`currentQuantity`). Also ensure the B2B amount box remains visible for confirmed customers.

## 6. InventoryManagementScreen "Add" API Failing
**Cause:** 
An inspection using Jam.dev shows the backend returns `400 Bad Request` with message: *"Warehouse stock is low... If you've already bought this, please use the 'Purchase' tab instead."* The issue isn't the API malfunctioning; it's a validation error. However, `apiClient`'s response interceptor alters the error object format, so `error.response?.data?.message` is undefined, causing the UI to display a confusing generic "Operation failed" error.
**Fix Plan:** 
Fix the error parsing in `InventoryManagementScreen.tsx` to read `error.message` (how `apiClient` surfaces it) so the user can accurately see the backend validation message about warehouse stock.

## 7. Purchase "Paid" Button Disabling
**Cause:** 
In `InventoryManagementScreen`, the "Paid" button in the Purchase summary component is purely cosmetic with no `onPress` or disabled states tied to it. The actual submission happens on the bottom action button.
**Fix Plan:** 
Tie the `paidButton` click to the submission logic, or introduce an explicit `isPaid` state for the purchase tab that disables the button while submitting or once clicked.

## 8. Prevent Payment Collection on Insufficient Stock
**Cause:** 
The total amount in B2B does not prevent the user from pressing "Collect" even if the products technically cannot be fulfilled, though the inputs self-cap.
**Fix Plan:** 
Add a condition to the "Collect" button disabling it if the total entered quantity across all items exceeds the available inventory, or explicitly validate during the collect press.

## 9. Customer Delivery Payment Field Not Editable
**Cause:** 
In the B2B payment section inside `CustomerDeliveryScreen`, the payment amount is currently rendered inside a `<Text>` element based purely on calculations.
**Fix Plan:** 
Replace the `<Text>` with a `<TextInput>` bound to a new local state `paymentAmount` (or similar), initializing it with the computed value but allowing user edits before collecting.

## 10. Menu "Finish" Button Redirecting to CashDetailsScreen
**Cause:** 
The drop-down overlay menu in `CustomerDeliveryScreen` only lists `Add`, `Transfer`, `Purchase`, and `Logout`.
**Fix Plan:** 
Add `Finish` to the menu items array. In its `onPress` handler, construct the URL routing with standard delivery parameters to redirect to `/CashDetailsScreen`.

---
**Questions for Clarification:**
1. For Issue 7: Should pressing the "Paid" button in the Purchase Summary actually submit the purchase transaction, or should it only mark it as "paid" visually and require the user to still click the main bottom "Purchase" button?
2. For Issue 9: When the user manually edits the B2B payment field, how should that deviate from the calculated items' total? Does it override the invoice entirely?
