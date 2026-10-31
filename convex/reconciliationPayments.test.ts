
import { expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";

async function fixture() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      role: "owner",
      tokenIdentifier: "test|owner",
    });

    const branchId = await ctx.db.insert("branches", {
      name: "Test branch",
      code: "T",
      isActive: true,
      nextSequence: 2,
      createdBy: owner,
    });

    const otherBranchId = await ctx.db.insert("branches", {
      name: "Other branch",
      code: "O",
      isActive: true,
      nextSequence: 1,
      createdBy: owner,
    });

    await ctx.db.insert("users", {
      role: "staff",
      tokenIdentifier: "test|staff",
      branchId,
    });

    await ctx.db.insert("users", {
      role: "risk_manager",
      tokenIdentifier: "test|risk",
      branchId,
    });

    const driverId = await ctx.db.insert("drivers", {
      fullName: "Fictional customer",
      phone: "000",
      address: "Test",
      vehicleType: "Taxi",
      vehiclePlate: "TEST",
      gpsLatitude: 0,
      gpsLongitude: 0,
      branchId,
      accountNumber: "T1",
      sequenceNumber: 1,
      isActive: true,
      registeredBy: owner,
    });

    const transactionId = await ctx.db.insert(
      "transactions",
      {
        driverId,
        fuelAmountGhs: 200,
        interestGhs: 10,
        interestCollectedUpfront: true,
        totalOwedGhs: 200,
        penaltyGhs: 0,
        issuedAt: "2026-10-20T10:00:00.000Z",
        dueAt: "2099-01-01T00:00:00.000Z",
        status: "pending",
        issuedBy: owner,
      }
    );

    return { branchId, otherBranchId, transactionId };
  });

  return {
    t,
    ids,
    owner: t.withIdentity({
      tokenIdentifier: "test|owner",
    }),
    staff: t.withIdentity({
      tokenIdentifier: "test|staff",
    }),
    risk: t.withIdentity({
      tokenIdentifier: "test|risk",
    }),
  };
}

it("payment reduces debt once; handover does not reduce it again", async () => {
  const { t, ids, staff, owner } = await fixture();

  const result = await staff.mutation(
    api.transactions.recordPayment,
    {
      transactionId: ids.transactionId,
      amountGhs: 80,
      paymentMethod: "cash",
    }
  );

  expect(result.remaining).toBe(120);
  expect(result.newAmountPaid).toBe(80);

  const payments = await staff.query(
    api.transactions.getPayments,
    { transactionId: ids.transactionId }
  );

  expect(payments).toHaveLength(1);
  expect(payments[0].receiptNumber).toBeTruthy();
  expect(payments[0].reconciliationStatus).toBe(
    "pending"
  );

  const handoverId = await staff.mutation(
    api.collectionReconciliation.recordHandover,
    {
      branchId: ids.branchId,
      amountGhs: 80,
      collectionDate: "2026-10-20",
      method: "cash",
    }
  );

  await owner.mutation(
    api.collectionReconciliation.reviewHandover,
    {
      handoverId,
      decision: "verified",
      note: "Fictional cash count confirmed",
    }
  );

  await owner.mutation(
    api.collectionReconciliation.reviewPayment,
    {
      paymentId: payments[0]._id,
      decision: "verified",
      note: "Fictional receipt checked",
    }
  );

  const after = await t.run((ctx) =>
    ctx.db.get("transactions", ids.transactionId)
  );

  expect(after?.amountPaidGhs).toBe(80);
  expect(after?.status).toBe("pending");

  const events = await t.run((ctx) =>
    ctx.db.query(
      "collection_reconciliation_events"
    ).collect()
  );

  expect(events).toHaveLength(2);

  await expect(
    owner.mutation(
      api.collectionReconciliation.reviewHandover,
      {
        handoverId,
        decision: "verified",
        note: "Duplicate review",
      }
    )
  ).rejects.toThrow();

  await expect(
    owner.mutation(
      api.collectionReconciliation.reviewPayment,
      {
        paymentId: payments[0]._id,
        decision: "verified",
        note: "Duplicate review",
      }
    )
  ).rejects.toThrow();
});

it("blocks unauthorized handovers and reviews", async () => {
  const { ids, staff, risk } = await fixture();

  await expect(
    staff.mutation(
      api.collectionReconciliation.recordHandover,
      {
        branchId: ids.otherBranchId,
        amountGhs: 10,
        collectionDate: "2026-10-20",
        method: "cash",
      }
    )
  ).rejects.toThrow();

  await expect(
    risk.mutation(
      api.collectionReconciliation.recordHandover,
      {
        branchId: ids.branchId,
        amountGhs: 10,
        collectionDate: "2026-10-20",
        method: "cash",
      }
    )
  ).rejects.toThrow();

  await expect(
    staff.mutation(
      api.collectionReconciliation.recordHandover,
      {
        branchId: ids.branchId,
        amountGhs: 0,
        collectionDate: "2026-10-20",
        method: "cash",
      }
    )
  ).rejects.toThrow();

  await expect(
    staff.mutation(
      api.collectionReconciliation.recordHandover,
      {
        branchId: ids.branchId,
        amountGhs: 10,
        collectionDate: "2026-10-20",
        method: "company_momo",
      }
    )
  ).rejects.toThrow();

  const handoverId = await staff.mutation(
    api.collectionReconciliation.recordHandover,
    {
      branchId: ids.branchId,
      amountGhs: 10,
      collectionDate: "2026-10-20",
      method: "cash",
    }
  );

  await expect(
    staff.mutation(
      api.collectionReconciliation.reviewHandover,
      {
        handoverId,
        decision: "verified",
        note: "Not authorized",
      }
    )
  ).rejects.toThrow();
});
