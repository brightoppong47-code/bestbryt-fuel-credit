export type DraftCustomer = { fullName: string; accountNumber: string };
export function buildMessageDraft(customer: DraftCustomer, type: "balance" | "general", general: string, balance?: number) {
  if (type === "balance" && (balance === undefined || !Number.isFinite(balance) || balance < 0)) return null;
  if (type === "general" && !general.trim()) return null;
  const greeting = `BESTBRYT VENTURES\nDear ${customer.fullName},`;
  if (type === "general") return `${greeting}\n${general.trim()}\nAccount: ${customer.accountNumber}`;
  const amount = balance!.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${greeting}\nYour current outstanding fuel credit balance is GHS ${amount}.\nAccount: ${customer.accountNumber}\nPlease contact BESTBRYT VENTURES to arrange payment or ask about your balance. Thank you.`;
}
