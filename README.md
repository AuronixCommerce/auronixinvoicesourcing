# Auronix Inventory Sourcing

A sourcing workspace for Auronix Commerce LLC. React/Vinext frontend, Firebase Authentication and Firebase Realtime Database.

## Accounts

- `/signup`: email/password registration, name, company, password confirmation and email verification.
- `/login`: email/password login and password reset.
- `/`: authenticated inventory workspace; unauthenticated visitors see the login page. A clearly labeled, in-memory sample workspace is opt-in.
- Administrator UID: `w3NzuxTFqwYoweS9CWOXC8RROzp1`. No first-account bootstrap and no client-editable admin assignment.
- New members are pending. They must verify email and receive administrator approval to access their own inventory.

## Remaining project setup

The supplied Firebase web config is integrated under `lib/firebase/config.ts`. The actual Realtime Database URL was not supplied. Hosting public init configuration returned 404, so no database namespace or region is assumed.

1. Set the Site production runtime variable `FIREBASE_DATABASE_URL` to the exact HTTPS root URL displayed in Firebase Console → Realtime Database → Data.
2. Publish `firebase/database.rules.json` to that same database. `firebase.json` and `.firebaserc` target the supplied project. With an authenticated Firebase CLI, use `firebase deploy --only database` after reviewing the rules and verifying the selected project.
3. Enable Email/Password under Firebase Authentication if it is not already enabled.
4. The Site retains its existing owner-private access policy. Public customer registration requires a separate change to the Site audience. Firebase authentication cannot remove the outer Site access gate by itself.

Until RTDB is connected, a signed-in Firebase account sees a clear setup screen instead of fabricated inventory or approval success. No service-account private key is needed: the server validates the caller's Firebase ID token through Firebase Auth and performs RTDB REST operations using that same caller token. RTDB rules independently enforce access, even if a browser bypasses the app API.

## Data and pricing

Members are stored at `members/{firebaseUid}`. Each member's products, shipment requests, events and activity live under `inventory/{firebaseUid}`. The shared conversion rate is `settings/usd_pkr`. Currency prices use integer USD cents. Shipment requests snapshot the price and exchange rate.

Pending shipment requests do not reserve units. Admin approval uses an ETag-guarded transaction to atomically reserve available stock, book the order and create its timeline event. A request cannot be approved when stock is insufficient. Eligible cancellation restores approved/reserved units once. Delivered and Cancelled orders are final.

Admins manage Local/International products, custom warehouse names, assigned stock, approval decisions, custom shipment messages/locations and the statuses Order booked, In transit, At warehouse, Out for delivery and Delivered. Prices exclude shipping, duties and Amazon fees. No carrier booking or Amazon Seller Central API is connected.

Legacy D1 data and migrations are preserved, but the workspace API now uses Firebase RTDB. No production legacy data was deleted or silently copied into a different user's Firebase account.

## Checks

- `npx tsc --noEmit`
- `node scripts/test-workspace.mjs`: isolated HTTP-backed route checks with mocked Firebase verification and RTDB ETags. Validates the pinned UID, approval and verification gates, tenant isolation, conflict retries, reservation at approval, custom tracking, price/rate snapshots and cancellation.
- `npx firebase emulators:exec --only database --project demo-auronix-inventory 'node scripts/test-firebase-rules.mjs'`: executable database rule tests. During authoring the emulator started, but the environment closed the connection while the CLI uploaded initial rules; the rule test suite could not execute. This is not a passing rules verification or a production Firebase deployment.
- Production build through the Sites build helper.

The browser account pages were visually checked without creating a production test user or sending password-reset email to an unrelated address. Live signup and RTDB persistence still require project setup and account-level verification.
