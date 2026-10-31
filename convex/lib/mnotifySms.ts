export function ghanaSmsPhone(raw: string) {
  const cleaned = raw.trim().replace(/[\s().-]/g, "");
  const local = cleaned.replace(/^\+?233/, "0");
  if (!/^0[235]\d{8}$/.test(local)) throw new Error("Enter a valid Ghana mobile number, for example 0241234567 or +233241234567.");
  return local;
}
export type SmsSubmission = { success: boolean; status: "submitted" | "failed" | "unknown"; sid?: string; error?: string };
export async function submitMnotifySms(to: string, body: string): Promise<SmsSubmission> {
  const key = process.env.MNOTIFY_API_KEY?.trim();
  const sender = process.env.MNOTIFY_SENDER_ID?.trim();
  if (!key || !sender) return { success: false, status: "failed", error: "mNotify SMS configuration is missing. Ask admin to configure the API key and approved sender ID in Convex." };
  if (sender.length > 11) return { success: false, status: "failed", error: "The SMS sender ID must be at most 11 characters and approved by BMS." };
  let phone: string;
  try { phone = ghanaSmsPhone(to); } catch { return { success: false, status: "failed", error: "Invalid Ghana mobile number. Update the customer phone number first." }; }
  try {
    const url = new URL("https://api.mnotify.com/api/sms/quick");
    url.searchParams.set("key", key);
    const response = await fetch(url, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: [phone], sender, message: body, is_schedule: false, schedule_date: "" }), signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (response.ok && String(result.code) === "2000" && result.status === "success") {
      if (result.summary?.total_rejected > 0 || result.summary?.total_sent === 0) return { success: false, status: "failed", error: "BMS rejected this SMS. Check your sender approval, recipient and credits." };
      return { success: true, status: "submitted", sid: typeof result.summary?._id === "string" ? result.summary._id : undefined };
    }
    // Only expose bounded numeric codes, never provider text that might echo credentials.
    const code = /^\d{3,6}$/.test(String(result?.code)) ? String(result.code) : "unavailable";
    const http = Number.isInteger(response.status) ? String(response.status) : "unavailable";
    const diagnostic = `BMS response code ${code} (HTTP ${http}).`;
    if (response.status >= 500) return { success: false, status: "unknown", error: "BMS returned a server error. Check BMS campaign history before attempting another send." };
    if (result?.status === "error" || result?.status === "failed" || (response.status >= 400 && response.status < 500)) {
      return { success: false, status: "failed", error: `${diagnostic} BMS rejected the request. Check the API key is active, its SMS credit limit, the approved sender ID and available SMS credits. Give BMS support this response code if these settings are correct.` };
    }
    return { success: false, status: "unknown", error: `${diagnostic} SMS acceptance could not be confirmed. Check BMS campaign history before attempting another send.` };
  } catch {
    // Never expose provider exceptions: they may contain the API key in the URL.
    return { success: false, status: "unknown", error: "SMS submission could not be confirmed. Check BMS campaign history before attempting another send. Do not retry automatically." };
  }
}
