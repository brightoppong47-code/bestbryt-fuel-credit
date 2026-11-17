# Smart Trading registration requests

## Behavior

The registration form requires a positive requested fuel amount in GHS, with at most two decimal places. Saving a driver atomically creates a separate funding request and assigns a permanent global alias such as SMART-000001. The request does not issue fuel, collect interest, or change a customer balance. Existing drivers are not automatically enrolled; older registration clients may omit the amount and continue to work without creating a request.

The fuel app driver profile shows the requested amount and delivery status. Delivery means the receiving service saved the request, not that admin selected it or a trader funded it. Selection and funding happen exclusively inside Smart Trading. No incoming trading mutations are added to the fuel app.

## One-way receiver contract

A five-minute job delivers pending registration requests to a separate backend. Configure the following server-only Convex environment variables after deploying a receiver:

- SMART_TRADING_REQUEST_URL: the HTTPS receiver endpoint.
- SMART_TRADING_BRIDGE_SECRET: a dedicated shared secret, configured on both backends. Never put it in frontend VITE variables or source control.

Without both settings, requests stay queued. Registration is independent of receiver availability. Failed deliveries retry with bounded exponential delay. The receiver must verify the Bearer secret before processing, validate the payload, and atomically enforce uniqueness on requestId before acknowledging. Duplicate delivery must return the same acknowledgement without creating another request. Source event IDs remain server metadata; traders see tradingCode only.

POST headers include Content-Type: application/json, Authorization: Bearer <secret>, and Idempotency-Key: <requestId>.

Payload fields:

| Field | Meaning |
| --- | --- |
| schemaVersion | 1 |
| requestId | Stable source event ID used for deduplication |
| tradingCode | Permanent driver alias |
| vehicleType | Vehicle category |
| requestedAmountGhs | Requested fuel principal, not issued credit |
| currency | GHS |
| createdAt | ISO timestamp |
| status | awaiting_admin_selection |

No name, phone, original plate, home address, GPS, photo, witness details or internal notes are sent. An accepted event must be durably stored in the Smart Trading admin selection queue before responding with HTTP 2xx and JSON { "accepted": true, "requestId": "<the exact source request ID>" }. Any other response leaves the event queued.

The separate Smart Trading application hosts the receiver, trader accounts and wallet logic. Funding remains disabled there until the source connection is verified.

## Admin setup and verified credit activity

In Smart Trading, the admin copies connection settings from Trading rules. Paste them into fuel app Settings → Smart Trading. Only the fuel owner can save settings; status queries never return credentials. Server-only connection settings take precedence over environment variables. For a private Smart Trading Site, the sender also supplies OAI-Sites-Authorization with the dedicated service token. Never share this setup bundle with traders.

When issuing the exact corresponding fuel credit, staff explicitly tick the Smart Trading link checkbox. The backend checks the driver, exact requested amount, unused request and 10% interest rate atomically before linking. Unlinked fuel credits follow their normal process.

A second five-minute worker sends linked source activity with deterministic event IDs. It includes upfront interest confirmation and only verified payment component allocations. Missing legacy allocations, source adjustments or decreasing totals stop financial updates for owner review. It never derives principal paid by subtracting arbitrary penalties from a total. No names, original plates or precise locations are sent. Late principal recovery after reimbursement restores the Smart Trading reserve; penalties are retained by the company.

Activity POST /api/bridge/activity uses the same authentication, with eventId, requestId, creditId, dueAt, sourceAt, principalPaidGhs, interestPaidGhs and penaltyPaidGhs. The receiver deduplicates eventId and acknowledges with accepted: true and the exact eventId. Transport timestamps may differ on retries without changing the logical event. Same-request events must be sent serially.

## Release order

Deploy the additive Convex schema and backend before the updated registration website. Deploy the Smart Trading receiver and configure its server-only credentials to enable delivery. Verify a registration reaches the admin queue exactly once even after a retry. Requests can accumulate safely before the receiver is available.

## Verification

Run the full Vitest suite and TypeScript/Vite build. The new tests cover validation, legacy registration compatibility, global alias uniqueness across branches, unchanged credits and payments, branch access, unconfigured delivery, restricted payloads, authenticated delivery, duplicate prevention, retry scheduling and stale worker acknowledgements.
