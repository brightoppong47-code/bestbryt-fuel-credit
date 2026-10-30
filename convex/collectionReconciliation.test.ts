import { expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";

it("staff sees own handovers only; owner sees branch-wide handovers", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { role: "owner", tokenIdentifier: "test|owner" });
    const branchId = await ctx.db.insert("branches", { name: "Sandbox", code: "S", isActive: true, nextSequence: 1, createdBy: owner });
    const staffA = await ctx.db.insert("users", { role: "staff", branchId, tokenIdentifier: "test|a" });
    const staffB = await ctx.db.insert("users", { role: "staff", branchId, tokenIdentifier: "test|b" });
    for (const [staffId, amountGhs] of [[staffA, 30], [staffB, 70]] as const) {
      await ctx.db.insert("collection_handovers", {
        branchId, staffId, amountGhs, collectionDate: "2026-10-20", method: "cash",
        recordedAt: "2026-10-20T10:00:00.000Z", recordedBy: staffId, status: "pending",
      });
    }
    return { branchId };
  });
  const args = { branchId: ids.branchId, date: "2026-10-20" };
  const a = await t.withIdentity({ tokenIdentifier: "test|a" }).query(api.collectionReconciliation.dailyCollections, args);
  const b = await t.withIdentity({ tokenIdentifier: "test|b" }).query(api.collectionReconciliation.dailyCollections, args);
  const owner = await t.withIdentity({ tokenIdentifier: "test|owner" }).query(api.collectionReconciliation.dailyCollections, args);
  expect(a.handovers.map(h => h.amountGhs)).toEqual([30]);
  expect(b.handovers.map(h => h.amountGhs)).toEqual([70]);
  expect(owner.handovers.map(h => h.amountGhs).sort()).toEqual([30, 70]);
  expect(a.verifiedHandoverGhs).toBe(0);
});
