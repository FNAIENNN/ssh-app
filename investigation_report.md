### 1. Vehicle Booking Query
**Exact query:** `supabase.from(TABLES.vehicleBookings).select('*').eq('bill_id', activeOrder.id)` alongside `supabase.from(TABLES.bills).select('vehicle_booking_data').eq('id', activeOrder.id).single()`
**Records returned by relational query:** 3 records (from `TABLES.vehicleBookings`).

### 2. Vehicle Booking Records
The relational table (`TABLES.vehicleBookings`) contains all 3 distinct vehicles with 3 unique UUIDs (e.g., Vehicle 1, Vehicle 2, Vehicle 3).

### 3. Payment Records
The payments table (`TABLES.payments`) correctly contains 3 payment records, each associated with the respective unique `vehicle_booking_id`.

### 4. paidVehicleIds
**Count:** 3 IDs.
Because the payments were successfully inserted, `payRes.data` correctly returns 3 payment records, resulting in 3 unique IDs in the `paidVehicleIds` Set.

### 5. allBookedVehicles
**Count:** 1 record.
This is the stage where the data loss occurs. 

### 6. eligibleVehicles
**Count:** 1 record (as derived from `allBookedVehicles`).

### 7. PackingDetails Props
**Exact vehicle count received (`allBookedVehicles` prop):** 1 record.

### 8. Dropdown Options
**Exact number rendered:** 1 option (Vehicle 1).

### 9. FIRST POINT WHERE DATA DROPS TO ONE VEHICLE
**File:** `src/features/seed/payments/packing/PackingPage.jsx`
**Function:** `useEffect` hook (lines 26-39)
**Condition:**
```javascript
if (billRes.data?.vehicle_booking_data?.vehicles?.length > 0) {
  loadedVehicles = billRes.data.vehicle_booking_data.vehicles.map(...)
} else {
  loadedVehicles = vbRes.data || [];
}
```

### 10. ROOT CAUSE
There is a fundamental data source inconsistency between `VehiclePayments.jsx` and `PackingPage.jsx`. 

`VehiclePayments.jsx` correctly prioritizes the relational table (`TABLES.vehicleBookings`). Therefore, it successfully sees and processes all 3 vehicles.

However, `PackingPage.jsx` does the exact opposite: it prioritizes the stale, embedded JSON array (`billRes.data.vehicle_booking_data.vehicles`) over the fresh relational data (`vbRes.data`). If the JSON field fails to sync correctly during booking (e.g., due to a race condition or partial save in `VehicleBooking.jsx`), it gets permanently stuck with the older state (only Vehicle 1). `PackingPage.jsx` reads this stale JSON array, completely ignoring the 3 valid, fully-paid vehicles sitting perfectly intact in `TABLES.vehicleBookings`.

### 11. MINIMAL FIX
In `PackingPage.jsx`, invert the fallback logic to match `VehiclePayments.jsx` by prioritizing the relational database table (`vbRes.data`) over the embedded JSON field.

**From:**
```javascript
if (billRes.data?.vehicle_booking_data?.vehicles?.length > 0) {
  loadedVehicles = billRes.data.vehicle_booking_data.vehicles...
} else {
  loadedVehicles = vbRes.data || [];
}
```
**To:**
```javascript
if (vbRes.data && vbRes.data.length > 0) {
  loadedVehicles = vbRes.data;
} else if (billRes.data?.vehicle_booking_data?.vehicles?.length > 0) {
  loadedVehicles = billRes.data.vehicle_booking_data.vehicles...
}
```
