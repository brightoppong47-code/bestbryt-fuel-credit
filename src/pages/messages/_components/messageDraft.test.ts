import { expect, it } from "vitest";
import { buildMessageDraft } from "./messageDraft";
const customer = { fullName: "Test Customer", accountNumber: "BBV-A-001" };
it("waits for a real balance and never substitutes a zero for unavailable data", () => {
  expect(buildMessageDraft(customer, "balance", "")).toBeNull();
  expect(buildMessageDraft(customer, "balance", "", Number.NaN)).toBeNull();
  expect(buildMessageDraft(customer, "balance", "", -1)).toBeNull();
  expect(buildMessageDraft(customer, "balance", "", 0)).toContain("GHS 0.00");
});
it("includes the customer's exact account and current balance", () => {
  const text = buildMessageDraft(customer, "balance", "", 1234.5);
  expect(text).toContain("Test Customer");
  expect(text).toContain("BBV-A-001");
  expect(text).toContain("GHS 1,234.50");
});
it("builds general announcements without inventing a balance or sending blank text", () => {
  expect(buildMessageDraft(customer, "general", "  ")).toBeNull();
  const text = buildMessageDraft(customer, "general", "  We open at 7am tomorrow.  ");
  expect(text).toContain("We open at 7am tomorrow.");
  expect(text).not.toContain("outstanding");
});
