
import { expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";

async function setup() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      role: "owner",
      tokenIdentifier: "test9|owner",
    });

    const branchA = await ctx.db.insert("branches", {
      name: "Test Branch A",
      code: "A9",
      isActive: true,
      nextSequence: 2,
      createdBy: owner,
    });

    const branchB = await ctx.db.insert("branches", {
      name: "Test Branch B",
      code: "B9",
      isActive: true,
      nextSequence: 2,
      createdBy: owner,
    });

    await ctx.db.insert("users", {
      role: "staff",
      tokenIdentifier: "test9|staff",
      branchId: branchA,
    });

    const driverId = await ctx.db.insert("drivers", {
      fullName: "Fictional Customer B",
      phone: "0000000000",
      address: "Test Address",
      vehicleType: "Taxi",
      vehiclePlate: "TEST-999",
      gpsLatitude: 0,
      gpsLongitude: 0,
      branchId: branchB,
      accountNumber: "B9-001",
      sequenceNumber: 1,
      isActive: true,
      registeredBy: owner,
    });

    const transactionId = await ctx.db.insert(
      "transactions",
      {
        driverId,
        fuelAmountGhs: 100,
        interestGhs: 5,
        interestCollectedUpfront: true,
        totalOwedGhs: 100,
        penaltyGhs: 0,
        issuedAt: "2026-10-20T10:00:00.000Z",
        dueAt: "2099-01-01T00:00:00.000Z",
        status: "pending",
        issuedBy: owner,
      }
    );

    return { transactionId };
  });

  return {
    t,
    ids,
    staff: t.withIdentity({
      tokenIdentifier: "test9|staff",
    }),
    owner: t.withIdentity({
      tokenIdentifier: "test9|owner",
    }),
  };
}

it("blocks cross-branch customer payments", async () => {
  const { staff, ids } = await setup();

  await expect(
    staff.mutation(api.transactions.recordPayment, {
      transactionId: ids.transactionId,
      amountGhs: 20,
      paymentMethod: "cash",
    })
  ).rejects.toThrow();
});

it("rejects invalid payment amounts", async () => {
  const { owner, ids } = await setup();

  for (const amountGhs of [0, -10, 150]) {
    await expect(
      owner.mutation(api.transactions.recordPayment, {
        transactionId: ids.transactionId,
        amountGhs,
        paymentMethod: "cash",
      })
    ).rejects.toThrow();
  }
});

it("requires MoMo transaction references", async () => {
  const { owner, ids } = await setup();

  await expect(
    owner.mutation(api.transactions.recordPayment, {
      transactionId: ids.transactionId,
      amountGhs: 20,
      paymentMethod: "company_momo",
    })
  ).rejects.toThrow();

  await expect(
    owner.mutation(api.transactions.recordPayment, {
      transactionId: ids.transactionId,
      amountGhs: 20,
      paymentMethod: "staff_momo",
      externalReference: "   ",
    })
  ).rejects.toThrow();

  const result = await owner.mutation(
    api.transactions.recordPayment,
    {
      transactionId: ids.transactionId,
      amountGhs: 20,
      paymentMethod: "company_momo",
      externalReference: "TEST-MOMO-123",
    }
  );

  expect(result.newAmountPaid).toBe(20);
  expect(result.remaining).toBe(80);

  const payments = await owner.query(
    api.transactions.getPayments,
    { transactionId: ids.transactionId }
  );

  expect(payments).toHaveLength(1);
  expect(payments[0].externalReference).toBe(
    "TEST-MOMO-123"
  );
  expect(payments[0].paymentMethod).toBe(
    "company_momo"
  );
});
