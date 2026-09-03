# CityRideTaxi Complete Process & Route Documentation

## 1. Executive Architecture & Flow

CityRideTaxi uses an Express Node.js application (`server.js`) connected to MySQL (`railway` DB) with real-time Socket.IO dispatching.

```
                              ┌───────────────────────────────────┐
                              │     Client Request (REST / WS)    │
                              └─────────────────┬─────────────────┘
                                                │
                                                ▼
                              ┌───────────────────────────────────┐
                              │     Express Middleware Pipeline    │
                              │  - Rate Limiter                   │
                              │  - JWT Authentication             │
                              │  - Role Verification              │
                              └─────────────────┬─────────────────┘
                                                │
                                                ▼
                              ┌───────────────────────────────────┐
                              │      Business & Database Logic    │
                              │  - Haversine Radial Distance      │
                              │  - Tariff & Peak Surge Engine     │
                              │  - Association Fleet Scope        │
                              └─────────────────┬─────────────────┘
                                                │
                                                ▼
                              ┌───────────────────────────────────┐
                              │       JSON Response / SSE         │
                              └───────────────────────────────────┘
```

---

## 2. Frontend Page HTML Routes

| Route | File Served | Description & User Role |
|---|---|---|
| `GET /` | `public/index.html` | Customer landing & booking SPA interface |
| `GET /auth` | `public/auth.html` | Customer registration & OTP/Password login |
| `GET /driver` | `public/driver.html` | Driver operational web console (duty toggle, active ride, earnings) |
| `GET /driver-login` | `public/driver-login.html` | Driver portal authentication page |
| `GET /driver-register` | `public/driver-register.html` | Driver registration with document upload & association pick |
| `GET /vendor` | `public/vendor.html` | Vendor fleet owner management console |
| `GET /vendor-login` | `public/vendor-login.html` | Vendor administrative login portal |
| `GET /admin` | `public/admin.html` | Super Admin full control panel |
| `GET /admin-login` | `public/admin-login.html` | Super Admin login portal |
| `GET /dashboard` | `public/dashboard.html` | Customer personal ride history and profile dashboard |
| `GET /association-admin` | `public/association-admin.html` | District Association Admin management dashboard |
| `GET /dbmanager` | `public/dbmanager.html` | Visual database manager & schema inspector |
| `GET /terms` | `public/terms.html` | Terms of service and privacy policy |
| `GET /monitor` | `public/monitor.html` | Live system health and request telemetry dashboard |

---

## 3. Exhaustive API Route Process Documentation

### A. Authentication & Session Module

#### `POST /api/auth/send-otp`
- **Purpose**: Generates and dispatches a 6-digit OTP for customer phone verification.
- **Access**: Public
- **Body**: `{ "phone": "9876543210" }`
- **Process**: Validates phone number, generates a random 6-digit OTP code, stores code in memory/cache with 5-minute expiration, returns success message.
- **Response**: `{ "success": true, "message": "OTP dispatched successfully" }`

#### `POST /api/auth/register`
- **Purpose**: Registers a new customer user account.
- **Access**: Public (Rate Limited)
- **Body**: `{ "name": "John", "phone": "9876543210", "email": "john@example.com", "password": "pass", "otp": "123456" }`
- **Process**: Verifies OTP code, hashes password using bcrypt, inserts record into `taxi_passengers` table, sets authentication HTTP cookie (`cr_usr_tok`).
- **Response**: `{ "success": true, "user": { "id": 1, "name": "John", "phone": "..." } }`

#### `POST /api/auth/login`
- **Purpose**: Authenticates passenger login via phone/email and password.
- **Access**: Public (Rate Limited)
- **Body**: `{ "login": "9876543210", "password": "password" }`
- **Process**: Queries `taxi_passengers`, verifies bcrypt password, checks if account is blocked (`is_blocked = 0`), issues JWT cookie.
- **Response**: `{ "success": true, "token": "...", "user": { ... } }`

#### `POST /api/admin/login`
- **Purpose**: Authenticates Super Admin credentials.
- **Access**: Public (Rate Limited)
- **Body**: `{ "username": "admin", "password": "adminpassword" }`
- **Process**: Verifies credentials against `taxi_admin` table or environment fallback, returns admin JWT cookie (`cr_adm_tok`).

#### `POST /api/driver/login`
- **Purpose**: Authenticates driver login.
- **Access**: Public (Rate Limited)
- **Body**: `{ "phone": "9876543210", "password": "password" }`
- **Process**: Checks `taxi_drivers`, verifies approval status (`status = 'approved'`), issues driver JWT (`cr_drv_tok`).

#### `POST /api/vendor/login`
- **Purpose**: Authenticates fleet vendor accounts.
- **Access**: Public (Rate Limited)
- **Body**: `{ "email": "vendor@cityride.com", "password": "password" }`
- **Process**: Queries `taxi_vendors`, verifies password, returns vendor token (`cr_vnd_tok`).

#### `POST /api/association/login`
- **Purpose**: Authenticates District Association Admin users.
- **Access**: Public (Rate Limited)
- **Body**: `{ "username": "salem_union", "password": "password" }`
- **Process**: Queries `taxi_associations`, checks admin password, issues association JWT cookie (`cr_assoc_tok`).

#### `GET /api/auth/session`
- **Purpose**: Checks current user session status across cookies.
- **Access**: Public (Reads Cookies)
- **Process**: Decodes `cr_usr_tok`, `cr_drv_tok`, `cr_vnd_tok`, `cr_adm_tok` or `cr_assoc_tok` and returns active profile.

#### `POST /api/auth/logout`
- **Purpose**: Clears active authentication cookies.
- **Access**: Public
- **Process**: Clears `cr_usr_tok`, `cr_drv_tok`, `cr_vnd_tok`, `cr_adm_tok`, `cr_assoc_tok`.

---

### B. Driver Registration & Approval Module

#### `POST /api/driver/register/send-otp`
- **Purpose**: Sends OTP for driver registration verification.

#### `POST /api/driver/register/verify-otp`
- **Purpose**: Validates driver phone OTP before document upload.

#### `POST /api/driver/register`
- **Purpose**: Submits complete driver application with document file uploads.
- **Access**: Public (Rate Limited, Multipart Form Data)
- **Params**: Name, phone, email, car_model, car_number, vehicle_type, seating_capacity, district, association_id.
- **Files**: `license_img`, `rc_img`, `insurance_img`, `association_id_card`.
- **Process**: Compresses images to optimized Base64, inserts record into `taxi_driver_applications` with `status = 'pending'`.

#### `GET /api/admin/driver-applications`
- **Purpose**: Lists pending driver onboarding applications for admin approval.
- **Access**: Super Admin / Association Admin

#### `POST /api/admin/driver-applications/decision`
- **Purpose**: Approves or rejects a pending driver application.
- **Access**: Admin / Association Admin
- **Body**: `{ "application_id": 5, "decision": "approve" }`
- **Process**: If approved, transfers record from `taxi_driver_applications` into `taxi_drivers`, creates wallet record, updates application status to `approved`.

---

### C. Ride Booking & Dispatch Module

#### `POST /api/bookings/create`
- **Purpose**: Creates a new ride booking request.
- **Access**: Authenticated (`user`, `vendor`, `admin`)
- **Body**:
  ```json
  {
    "pickup": "Hosur Bus Stand",
    "drop": "Electronic City",
    "pickupCoords": "77.82,12.75",
    "dropCoords": "77.85,12.85",
    "vehicle_type": "sedan",
    "association_id": 1,
    "special_place_type": "bus_stand",
    "trip_category": "local"
  }
  ```
- **Process**:
  1. Computes distance via OSRM proxy.
  2. Applies local slab tariff or outstation pricing.
  3. Applies peak hour percentage and special location percentage.
  4. Inserts row into `taxi_bookings` with `status = 'pending'`.
  5. Emits real-time Socket.IO event `new_booking_broadcast` to online drivers matching `association_id` and `vehicle_type`.
- **Response**: `{ "success": true, "bookingId": 1024, "fare": 350 }`

#### `POST /api/bookings/check-air-distance`
- **Purpose**: Enforces radial air distance boundary using Haversine algorithm.
- **Access**: Public
- **Body**: `{ "pickupCoords": "77.82,12.75", "baseRadiusKm": 10 }`
- **Process**:
  Calculates distance to available drivers:
  $$\text{dist} = 2 R \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
  If no driver within $10\text{ km}$, returns `{ "outOfRadius": true, "incentiveRequired": true, "incentiveFee": 50 }`.

#### `GET /api/bookings/fare-breakdown/:bookingId`
- **Purpose**: Returns itemized fare breakdown (base fare, peak surge, special location charge, driver allowance, platform fee).

#### `POST /api/bookings/accept`
- **Purpose**: Driver accepts a pending ride booking.
- **Access**: Authenticated (`driver`)
- **Body**: `{ "bookingId": 1024 }`
- **Process**: Atomically updates `taxi_bookings` set `driver_id = ?, status = 'accepted'` where `status = 'pending'`. Notifies customer via Socket.IO.

#### `POST /api/bookings/reached-pickup`
- **Purpose**: Driver notifies arrival at pickup location. Sets status to `reached_pickup`.

#### `POST /api/bookings/start-journey`
- **Purpose**: Driver starts the trip. Sets status to `started` and records start timestamp.

#### `POST /api/bookings/finish-trip`
- **Purpose**: Completes the trip, finalizes fare, and settles driver/association earnings.
- **Access**: Authenticated (`driver`)
- **Body**: `{ "bookingId": 1024, "actualDistanceKm": 25.4 }`
- **Process**: Calculates final billable fare, credits platform commission, updates booking `status = 'completed'`, updates driver total earnings.

#### `POST /api/user/cancel-ride`
- **Purpose**: Customer cancels active ride request.
- **Access**: Authenticated (`user`)
- **Body**: `{ "bookingId": 1024, "reason": "Changed plans" }`
- **Process**: Updates booking `status = 'cancelled'`. Emits cancellation alert to assigned driver.

#### `POST /api/bookings/driver-cancel`
- **Purpose**: Driver declines or cancels an accepted ride.
- **Process**: Updates booking `status = 'pending'` or `cancelled`, releasing booking back to matching association pool.

---

### D. GPS Tracking & Telemetry Module

#### `POST /api/bookings/update-gps-location`
- **Purpose**: Updates driver's live GPS coordinates.
- **Access**: Authenticated (`driver`)
- **Body**: `{ "latitude": 12.7513, "longitude": 77.8188, "bookingId": 1024 }`
- **Process**: Updates `taxi_drivers` lat/lng, inserts location trace log, broadcasts `driver_location_update` via Socket.IO.

#### `POST /api/bookings/upload-gps-logs-bulk`
- **Purpose**: Bulk uploads offline GPS logs recorded during network loss.

#### `GET /api/bookings/driver-location/:bookingId`
- **Purpose**: Fetches real-time lat/lng of assigned driver for active ride tracking.

#### `GET /api/monitor/stream`
- **Purpose**: Server-Sent Events (SSE) stream delivering real-time telemetry metrics for `/monitor`.

---

### E. Proxy & GIS Integration Services

#### `GET /api/proxy/geocode`
- **Purpose**: Nominatim/Photon geocoding proxy for address autocomplete.
- **Query**: `?q=Hosur&limit=8&lang=en`

#### `GET /api/proxy/reverse`
- **Purpose**: Reverse geocoding proxy converting lat/lng coordinates to address text.
- **Query**: `?lat=12.7513&lon=77.8188`

#### `GET /api/proxy/route`
- **Purpose**: OSRM routing proxy providing real route polyline geometry, distance in KM, and travel duration in minutes.
- **Query**: `?pickup=77.81,12.75&drop=77.85,12.85`

---

### F. Tariffs, Surge & Special Surcharges Module

#### `GET /api/tariffs`
- **Purpose**: Returns active vehicle tariff matrix.

#### `POST /api/admin/update-tariff`
- **Purpose**: Admin updates pricing per KM, min KM, base price for vehicle categories.

#### `GET /api/peak-rules`
- **Purpose**: Returns list of configured peak hour surge rules.

#### `POST /api/admin/peak-rules/add`
- **Purpose**: Creates new peak hour rule (`start_time`, `end_time`, `surcharge_percentage`).

#### `POST /api/admin/peak-rules/update`
- **Purpose**: Updates existing peak surge rule.

#### `POST /api/admin/peak-rules/delete`
- **Purpose**: Deletes peak surge rule.

#### `GET /api/special-location-charges`
- **Purpose**: Returns list of special location surcharge rules.

#### `POST /api/admin/special-location-charges/add`
- **Purpose**: Adds location surcharge rule (e.g., `place_type = 'airport'`, `surcharge_percentage = 20.00`).

#### `POST /api/admin/special-location-charges/update`
- **Purpose**: Updates percentage for location surcharge.

#### `POST /api/admin/special-location-charges/toggle`
- **Purpose**: Enables or disables location surcharge.

#### `POST /api/admin/special-location-charges/delete`
- **Purpose**: Deletes location surcharge.

---

### G. District Association Admin Module

#### `GET /api/public/associations`
- **Purpose**: Public endpoint returning all registered district associations.

#### `GET /api/association/stats`
- **Purpose**: Association dashboard analytics (total drivers, active rides, daily revenue).

#### `GET /api/association/wallet`
- **Purpose**: Returns association wallet balance and fund metrics.

#### `GET /api/association/drivers`
- **Purpose**: Lists drivers registered under the logged-in association.

#### `GET /api/association/tariffs`
- **Purpose**: Fetches association-specific tariff overrides.

#### `POST /api/association/tariffs`
- **Purpose**: Saves custom tariff rates for association drivers.

#### `POST /api/association/drivers/toggle`
- **Purpose**: Association admin activates or blocks driver within association.

#### `GET /api/association/live-pilots`
- **Purpose**: Returns active GPS locations of association drivers for radar map.

#### `GET /api/association/driver-id-card/:id`
- **Purpose**: Generates dynamic Digital ID Card data for association driver.

#### `GET /api/association/sos/active`
- **Purpose**: Returns emergency SOS alerts triggered within association fleet.

---

### H. Visual Database Manager Module (`/dbmanager`)

#### `GET /api/dbmanager/tables`
- **Purpose**: Lists all database tables in `railway` database.

#### `GET /api/dbmanager/schema/:table`
- **Purpose**: Returns column metadata, data types, and primary keys for target table.

#### `GET /api/dbmanager/rows/:table`
- **Purpose**: Paginated row viewer for inspection.

#### `POST /api/dbmanager/insert/:table`
- **Purpose**: Inserts a new record into target database table.

#### `PUT /api/dbmanager/update/:table/:id`
- **Purpose**: Updates row values by primary ID.

#### `DELETE /api/dbmanager/delete/:table/:id`
- **Purpose**: Deletes specified table row.

---

## 4. Verification & Testing Instructions

Run the verification test suite to confirm all routes respond as expected:

```bash
# 1. Test Public Association Endpoint
node -e "fetch('http://localhost:3000/api/public/associations').then(r=>r.json()).then(d=>console.log('Associations:', d.length))"

# 2. Test Tariff Matrix Endpoint
node -e "fetch('http://localhost:3000/api/tariffs').then(r=>r.json()).then(d=>console.log('Tariff Keys:', Object.keys(d)))"

# 3. Test Peak Rules Endpoint
node -e "fetch('http://localhost:3000/api/peak-rules').then(r=>r.json()).then(d=>console.log('Peak Rules:', d.length))"
```

---
*End of Exhaustive Route Process Documentation.*
