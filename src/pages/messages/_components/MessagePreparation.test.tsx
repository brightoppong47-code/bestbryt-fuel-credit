import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
vi.mock("convex/react", () => ({
  usePaginatedQuery: () => ({ results: [{ _id: "customer-1", fullName: "Ama Test", accountNumber: "A001", phone: "0500000000", isActive: true }], status: "Exhausted", loadMore: vi.fn() }),
  useQuery: (_query: unknown, args: unknown) => args && args !== "skip" ? { totalOwed: 125.5 } : [],
}));
import MessagePreparation from "./MessagePreparation";
it("previews both channels without providing an enabled send action", () => {
  render(<MessagePreparation />);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByText(/Your current outstanding fuel credit balance is GHS 125.50/)).toBeInTheDocument();
  expect(screen.getByText("SMS + WhatsApp · Draft")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sending pending Twilio activation" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Copy draft" })).toBeEnabled();
});
