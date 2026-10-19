import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  users: defineTable({
    tokenIdentifier: v.string(),
    loginMethod: v.optional(v.literal("password")),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.union(
      v.literal("owner"),
      v.literal("staff"),
      v.literal("branch_secretary"),
      v.literal("risk_manager"),
    ),
    branchIds: v.optional(v.array(v.id("branches"))),
    // Branch assigned to this user (required for branch_secretary)
    branchId: v.optional(v.id("branches")),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_token", ["tokenIdentifier"])
    .index("by_role", ["role"]),

  complaints: defineTable({
    driverId: v.id("drivers"), branchId: v.id("branches"),
    category: v.union(v.literal("vehicle_fault"), v.literal("other")),
    description: v.string(), status: v.union(v.literal("open"), v.literal("resolved")),
    reportedBy: v.id("users"), createdAt: v.string(),
    resolution: v.optional(v.string()), resolvedBy: v.optional(v.id("users")), resolvedAt: v.optional(v.string()),
  }).index("by_branch", ["branchId"]).index("by_driver", ["driverId"]),

  // Pre-assigned roles for users who haven't signed in yet.
  // When a new user logs in, updateCurrentUser checks this table by email
  // and assigns the pre-set role instead of defaulting to "staff".
  invited_users: defineTable({
    email: v.string(),           // lowercase, used for matching on first login
    role: v.union(
      v.literal("owner"),
      v.literal("staff"),
      v.literal("branch_secretary"),
      v.literal("risk_manager"),
    ),
    name: v.optional(v.string()), // display name set by admin
    createdBy: v.id("users"),
    createdAt: v.string(),
    // Filled in once the user signs in for the first time
    acceptedAt: v.optional(v.string()),
    acceptedByUserId: v.optional(v.id("users")),
  }).index("by_email", ["email"]),

  // Branches / stations
  branches: defineTable({
    name: v.string(),          // e.g. "Kumasi Central"
    code: v.string(),          // e.g. "KMS" — used in account number
    location: v.optional(v.string()),
    isActive: v.boolean(),
    nextSequence: v.number(),  // atomic counter for account numbers
    createdBy: v.id("users"),
  }).index("by_code", ["code"]),

  drivers: defineTable({
    // Identity
    fullName: v.string(),
    phone: v.string(),
    address: v.string(),
    // Vehicle
    vehicleType: v.string(),
    vehiclePlate: v.string(),
    // Location
    gpsLatitude: v.number(),
    gpsLongitude: v.number(),
    gpsAddress: v.optional(v.string()),
    // Photo
    photoStorageId: v.optional(v.id("_storage")),
    // Witness
    witnessName: v.optional(v.string()),
    witnessPhone: v.optional(v.string()),
    // Account
    accountNumber: v.string(),   // e.g. "BBV-KMS-000001"
    branchId: v.id("branches"),
    sequenceNumber: v.number(),  // the raw counter for this branch
    // Meta
    notes: v.optional(v.string()),
    isActive: v.boolean(),
    registeredBy: v.id("users"),
  })
    .index("by_name", ["fullName"])
    .index("by_account_number", ["accountNumber"])
    .index("by_branch", ["branchId"]),

  // Each fuel credit issued to a driver
  transactions: defineTable({
    driverId: v.id("drivers"),
    // Amounts
    fuelAmountGhs: v.number(),
    interestGhs: v.number(),
    interestRatePercent: v.optional(v.number()),
    totalOwedGhs: v.number(),
    // Whether interest was collected from the driver upfront (at time of issuing)
    interestCollectedUpfront: v.optional(v.boolean()),
    // Timing
    issuedAt: v.string(),
    dueAt: v.string(),
    // Status
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("overdue"),
    ),
    // Penalties
    penaltyGhs: v.number(),
    lastPenaltyCalculatedAt: v.optional(v.string()),
    // Penalty pause: if set, no penalty accrues until this ISO timestamp
    penaltyPausedUntil: v.optional(v.string()),
    penaltyPausedBy: v.optional(v.id("users")),
    penaltyPauseReason: v.optional(v.string()),
    // Payment tracking
    amountPaidGhs: v.optional(v.number()),   // running total of all payments received
    paidAt: v.optional(v.string()),
    paidBy: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    issuedBy: v.id("users"),
  })
    .index("by_driver", ["driverId"])
    .index("by_status", ["status"])
    .index("by_issued_at", ["issuedAt"]),

  // Individual payment records (each partial or full payment on a transaction)
  payments: defineTable({
    principalGhs: v.optional(v.number()),
    interestGhs: v.optional(v.number()),
    penaltyGhs: v.optional(v.number()),
    branchId: v.optional(v.id("branches")),
    transactionId: v.id("transactions"),
    driverId: v.id("drivers"),
    amountGhs: v.number(),
    note: v.optional(v.string()),
    recordedBy: v.id("users"),
    recordedAt: v.string(),
  })
    .index("by_transaction", ["transactionId"])
    .index("by_driver", ["driverId"]),

  // End-of-day reports submitted by branch secretaries
  eod_reports: defineTable({
    branchId: v.id("branches"),
    submittedBy: v.id("users"),
    // The calendar date this report covers: YYYY-MM-DD in local time
    reportDate: v.string(),
    submittedAt: v.string(),
    // Stats computed at close-of-day
    customersServed: v.number(),    // unique drivers who received a credit today
    creditsIssuedCount: v.number(), // number of new credits issued
    creditsIssuedGhs: v.number(),   // total fuel amount issued
    interestCollectedGhs: v.number(), // interest earned today
    paymentsReceivedCount: v.number(),
    paymentsReceivedGhs: v.number(),  // total cash received
    penaltiesCollectedGhs: v.number(), // penalty amounts received in payments today
    notes: v.optional(v.string()),
  })
    .index("by_branch", ["branchId"])
    .index("by_date", ["reportDate"])
    .index("by_branch_date", ["branchId", "reportDate"]),

  // Log of every SMS / WhatsApp message sent
  message_logs: defineTable({
    transactionId: v.optional(v.id("transactions")),
    driverId: v.id("drivers"),
    phone: v.string(),
    channel: v.union(v.literal("sms"), v.literal("whatsapp")),
    messageType: v.union(
      v.literal("balance_due"),
      v.literal("payment_received"),
      v.literal("overdue_notice"),
      v.literal("broadcast"),
    ),
    body: v.string(),
    success: v.boolean(),
    error: v.optional(v.string()),
    sentAt: v.string(),
  })
    .index("by_driver", ["driverId"])
    .index("by_transaction", ["transactionId"])
    .index("by_sent_at", ["sentAt"]),
  // Global app settings — single document, keyed by "global"
  app_settings: defineTable({
    key: v.string(),              // always "global"
    interestRatePercent: v.optional(v.number()),
    logoStorageId: v.optional(v.id("_storage")),
  }).index("by_key", ["key"]),
});
