import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const { send } = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue({ success: true, status: "submitted" }) }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    usePaginatedQuery: () => ({ results: [{ _id: "customer-1", fullName: "Ama Test", accountNumber: "A001", phone: "0500000000", isActive: true }], status: "Exhausted", loadMore: vi.fn() }),
    useAction: () => send,
    useQuery: (query: never, args: unknown) => {
      const name = getFunctionName(query);
      if (name.endsWith("smsConfiguration")) return { configured: true, sender: "BESTBRYT" };
      if (name.endsWith("getCurrentUserData")) return { role: "owner" };
      return args && args !== "skip" ? { totalOwed: 125.5 } : [];
    },
  };
});
import MessagePreparation from "./MessagePreparation";
afterEach(() => { cleanup(); send.mockClear(); });
it("requires recipient review and consent before submitting and prevents a second click", async () => {
  render(<MessagePreparation />); fireEvent.click(screen.getByRole("checkbox"));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Review SMS" }));
  const submit = screen.getByRole("button", { name: "Send SMS (uses credit)" }); expect(submit).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /I have checked/ })); fireEvent.click(submit);
  await waitFor(() => expect(screen.getByText("Submitted to mNotify. Delivery is not yet confirmed.")).toBeInTheDocument());
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toMatchObject({ driverId: "customer-1", kind: "balance", expectedPhone: "0500000000" });
  expect(screen.getByRole("button", { name: "Review SMS" })).toBeDisabled();
});
it("keeps WhatsApp preview-only", () => {
  render(<MessagePreparation />); fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByRole("combobox", { name: "Channel" }), { target: { value: "both" } });
  expect(screen.getByText("SMS + WhatsApp · Draft")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Review SMS" })).not.toBeInTheDocument(); expect(send).not.toHaveBeenCalled();
});
