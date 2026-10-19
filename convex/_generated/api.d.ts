/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountAdmin from "../accountAdmin.js";
import type * as auth from "../auth.js";
import type * as admin from "../admin.js";
import type * as appSettings from "../appSettings.js";
import type * as branches from "../branches.js";
import type * as crons from "../crons.js";
import type * as drivers from "../drivers.js";
import type * as eod from "../eod.js";
import type * as exports from "../exports.js";
import type * as helpers from "../helpers.js";
import type * as lib_paymentAllocation from "../lib/paymentAllocation.js";
import type * as messaging from "../messaging.js";
import type * as messaging_internal from "../messaging_internal.js";
import type * as penalties from "../penalties.js";
import type * as reports from "../reports.js";
import type * as transactions from "../transactions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountAdmin: typeof accountAdmin;
  auth: typeof auth;
  admin: typeof admin;
  appSettings: typeof appSettings;
  branches: typeof branches;
  crons: typeof crons;
  drivers: typeof drivers;
  eod: typeof eod;
  exports: typeof exports;
  helpers: typeof helpers;
  "lib/paymentAllocation": typeof lib_paymentAllocation;
  messaging: typeof messaging;
  messaging_internal: typeof messaging_internal;
  penalties: typeof penalties;
  reports: typeof reports;
  transactions: typeof transactions;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
