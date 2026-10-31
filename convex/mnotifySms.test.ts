import { afterEach, expect, it, vi } from "vitest";
import { submitMnotifySms, ghanaSmsPhone } from "./lib/mnotifySms";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("accepts Ghana formats and rejects invalid or non-Ghana numbers", () => {
  expect(ghanaSmsPhone("+233 24 123 4567")).toBe("0241234567");
  expect(ghanaSmsPhone("0241234567")).toBe("0241234567");
  expect(() => ghanaSmsPhone("+14445556666")).toThrow();
  expect(() => ghanaSmsPhone("abc0241234567")).toThrow();
});
it("sends one immediate normal SMS through BMS and distinguishes acceptance from delivery", async () => {
  vi.stubEnv("MNOTIFY_API_KEY", "test-secret"); vi.stubEnv("MNOTIFY_SENDER_ID", "BESTBRYT");
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success", code: "2000", summary: { _id: "campaign-1", total_sent: 1, total_rejected: 0 } }) });
  vi.stubGlobal("fetch", fetcher);
  expect(await submitMnotifySms("+233241234567", "Test preview")).toMatchObject({ success: true, status: "submitted", sid: "campaign-1" });
  const [url, options] = fetcher.mock.calls[0];
  expect(url.origin).toBe("https://api.mnotify.com");
  expect(JSON.parse(options.body)).toEqual({ recipient: ["0241234567"], sender: "BESTBRYT", message: "Test preview", is_schedule: false, schedule_date: "" });
});
it("does not expose keys on errors and does not retry an uncertain submission", async () => {
  vi.stubEnv("MNOTIFY_API_KEY", "test-secret"); vi.stubEnv("MNOTIFY_SENDER_ID", "BESTBRYT");
  const fetcher = vi.fn().mockRejectedValue(new Error("https://provider/?key=test-secret")); vi.stubGlobal("fetch", fetcher);
  const result = await submitMnotifySms("0241234567", "Test");
  expect(result.status).toBe("unknown"); expect(JSON.stringify(result)).not.toContain("test-secret"); expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rejects absent configuration without a network call and detects provider rejection", async () => {
  vi.stubEnv("MNOTIFY_API_KEY", ""); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect((await submitMnotifySms("0241234567", "Test")).status).toBe("failed"); expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv("MNOTIFY_API_KEY", "test-secret"); vi.stubEnv("MNOTIFY_SENDER_ID", "BESTBRYT");
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ status: "error", code: "1000" }) });
  expect((await submitMnotifySms("0241234567", "Test")).status).toBe("failed");
});
