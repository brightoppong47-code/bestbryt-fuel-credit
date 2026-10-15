import { Component, useState, type ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Building2, Plus, Loader2, Hash, Users, ShieldCheck,
  UserCog, UserPlus, Trash2, Clock, CheckCircle2, Mail,
  Palette, Database, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import {
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent,
} from "@/components/ui/empty.tsx";
import { format } from "date-fns";
import { AppearanceSettings } from "./_components/AppearanceSettings.tsx";
import { BackupRestore } from "./_components/BackupRestore.tsx";
import { DangerZone } from "./_components/DangerZone.tsx";
import { cn } from "@/lib/utils.ts";

class CorrectionsBoundary extends Component<{children: ReactNode}, {error: Error | null}> {
  state: {error: Error | null} = {error: null};
  static getDerivedStateFromError(error: unknown) {
    return {error: error instanceof Error ? error : new Error(String(error))};
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <Card role="alert"><CardHeader><CardTitle>Corrections could not load</CardTitle></CardHeader><CardContent className="space-y-3">
      <p>The corrections service failed to respond. Other Settings tabs and the menu are still available.</p>
      <details open><summary>Error details</summary><pre className="mt-2 whitespace-pre-wrap break-words text-xs">{this.state.error.message}</pre></details>
      <Button variant="secondary" onClick={() => this.setState({error: null})}>Try again</Button>
    </CardContent></Card>;
  }
}

type CorrectionTable = "drivers" | "transactions" | "payments" | "eod_reports";
const CORRECTION_OPTIONS: Record<CorrectionTable,string> = {drivers:"Customers",transactions:"Fuel credits",payments:"Payments",eod_reports:"End-of-day reports"};
const CORRECTION_FIELDS: Record<CorrectionTable,Array<[string,string,string]>> = {
  drivers:[["fullName","Customer name","text"],["phone","Phone","text"],["address","Address","text"],["vehicleType","Vehicle type","text"],["vehiclePlate","Vehicle plate","text"],["gpsAddress","GPS address","text"],["witnessName","Witness name","text"],["witnessPhone","Witness phone","text"],["notes","Notes","text"],["isActive","Active customer","checkbox"]],
  transactions:[["fuelAmountGhs","Fuel amount (GHS)","number"],["interestGhs","Interest (GHS)","number"],["interestCollectedUpfront","Interest collected upfront","checkbox"],["issuedAt","Issue date and time (Ghana UTC)","datetime-local"],["dueAt","Due date and time (Ghana UTC)","datetime-local"],["notes","Notes","text"]],
  payments:[["amountGhs","Payment amount (GHS)","number"],["recordedAt","Payment date and time (Ghana UTC)","datetime-local"],["note","Note","text"]],
  eod_reports:[["reportDate","Report date","date"],["customersServed","Customers served","number"],["creditsIssuedCount","Credits issued count","number"],["creditsIssuedGhs","Fuel credits (GHS)","number"],["interestCollectedGhs","Interest collected (GHS)","number"],["paymentsReceivedCount","Payments count","number"],["paymentsReceivedGhs","Payments received (GHS)","number"],["penaltiesCollectedGhs","Penalties collected (GHS)","number"],["notes","Notes","text"]],
};
function AdminCorrections() {
  const [table,setTable]=useState<CorrectionTable>("transactions");
  const [cursors,setCursors]=useState<Array<string|null>>([null]);
  const [search,setSearch]=useState("");
  const result=useQuery(api.admin.listCorrectionEntries,{table,paginationOpts:{numItems:25,cursor:cursors.at(-1) ?? null}});
  const save=useMutation(api.admin.correctEntry);
  const remove=useMutation(api.admin.deleteCorrectionEntry);
  const [selected,setSelected]=useState<{id:Id<CorrectionTable>;data:string;title:string;linkedPayments:number}|null>(null);
  const [values,setValues]=useState<Record<string,string|boolean>>({});
  const [mode,setMode]=useState<"edit"|"delete">("edit");
  const [confirmation,setConfirmation]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  function open(row:NonNullable<typeof selected>, action:"edit"|"delete") {
    const data=JSON.parse(row.data) as Record<string,unknown>;
    setValues(Object.fromEntries(CORRECTION_FIELDS[table].map(([key,,type])=>[key,type==="checkbox" ? Boolean(data[key]) : type==="datetime-local" ? String(data[key] ?? "").slice(0,19) : String(data[key] ?? "")])));
    setSelected(row);setMode(action);setConfirmation("");setError("");
  }
  async function submit() {
    if(!selected || busy) return;
    setBusy(true);setError("");
    try {
      if(mode==="delete") await remove({table,id:selected.id,expected:selected.data});
      else {
        const changes:Record<string,unknown>={};
        for(const [key,,type] of CORRECTION_FIELDS[table]) {
          const value=values[key];
          if(type==="number") { if(String(value).trim()==="") throw new Error("Amounts and counts are required"); changes[key]=Number(value); }
          else if(type==="datetime-local") changes[key]=String(value)+"Z";
          else changes[key]=value;
        }
        await save({table,id:selected.id,expected:selected.data,changes:JSON.stringify(changes)});
      }
      toast.success(mode==="delete" ? "Entry deleted successfully" : "Entry corrected successfully");
      setSelected(null);
    } catch(e) { setError(e instanceof Error ? e.message : "Correction failed"); }
    finally {setBusy(false);}
  }
  return <Card><CardHeader><CardTitle>Admin corrections</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Correct agent mistakes in customers, fuel credits, payments and submitted reports. Credit balances and collection totals update after financial corrections. Submitted end-of-day reports are historical snapshots; edit affected snapshots separately.</p>
    <label className="block text-sm">Entry type<select className="block w-full rounded-md border bg-background p-2 mt-1" value={table} onChange={e=>{setTable(e.target.value as CorrectionTable);setCursors([null]);setSearch("");setSelected(null);}}>{Object.entries(CORRECTION_OPTIONS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <Input placeholder="Search this page by customer, branch or date" value={search} onChange={e=>setSearch(e.target.value)}/>
    {!result ? <Skeleton className="h-40"/> : <><div className="space-y-3">{result.page.filter(r=>(r.title+" "+r.branch+" "+r.date).toLowerCase().includes(search.toLowerCase())).map(row=>{
      const record=JSON.parse(row.data) as Record<string,unknown>;
      return <div key={row.id} className="rounded-lg border p-3 space-y-2"><p className="font-semibold">{row.title}</p><p className="text-sm text-muted-foreground">{row.branch} · {row.date.replace("T"," ").slice(0,19)}</p>
      {table==="transactions" && <p className="text-sm">Fuel GHS {Number(record.fuelAmountGhs).toFixed(2)} · Paid GHS {Number(record.amountPaidGhs ?? 0).toFixed(2)} · {String(record.status)}</p>}
      {table==="payments" && <p className="text-sm">GHS {Number(record.amountGhs).toFixed(2)}</p>}
      <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={()=>open(row,"edit")}>Edit</Button><Button size="sm" variant="destructive" onClick={()=>open(row,"delete")}>Delete</Button></div></div>;
    })}</div>{!result.page.length && <p>No entries found.</p>}<div className="flex justify-between gap-2"><Button variant="secondary" disabled={cursors.length===1} onClick={()=>setCursors(c=>c.slice(0,-1))}>Previous</Button><Button variant="secondary" disabled={result.isDone} onClick={()=>setCursors(c=>[...c,result.continueCursor])}>Next</Button></div></>}
    <Dialog open={!!selected} onOpenChange={open=>{if(!open && !busy)setSelected(null);}}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{mode==="edit" ? "Correct" : "Delete"} {CORRECTION_OPTIONS[table]} entry</DialogTitle></DialogHeader>
      <p className="font-medium">{selected?.title}</p>
      {mode==="edit" ? <div className="space-y-3">{CORRECTION_FIELDS[table].map(([key,label,type])=><label key={key} className="block text-sm space-y-1">{label}{type==="checkbox" ? <input className="ml-3" type="checkbox" checked={Boolean(values[key])} onChange={e=>setValues(v=>({...v,[key]:e.target.checked}))}/> : <Input type={type} min={type==="number" ? 0 : undefined} step={type==="number" ? "0.01" : type==="datetime-local" ? 1 : undefined} value={String(values[key] ?? "")} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/>}</label>)}</div> : <div className="space-y-3"><p className="text-sm text-destructive">Deletion is permanent.{table==="transactions" ? " This also deletes "+selected?.linkedPayments+" linked payments and transaction message logs." : table==="payments" ? " The credit balance will be recalculated and may reopen." : table==="drivers" ? " Customers with credits or payments must have those entries corrected first." : " The submitted report will be removed."}</p><label className="block text-sm">Type DELETE to confirm<Input value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label></div>}
      {error && <p role="alert" className="text-sm text-destructive whitespace-pre-wrap break-words">{error}</p>}
      <DialogFooter><Button variant="secondary" disabled={busy} onClick={()=>setSelected(null)}>Cancel</Button><Button variant={mode==="delete" ? "destructive" : "default"} disabled={busy || (mode==="delete" && confirmation!=="DELETE")} onClick={submit}>{busy ? "Saving…" : mode==="delete" ? "Delete entry" : "Save correction"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </CardContent></Card>;
}

type Role = "owner" | "staff" | "branch_secretary" | "risk_manager";

const ROLE_LABELS: Record<Role, string> = {
  owner: "Admin / Owner",
  staff: "Staff",
  branch_secretary: "Branch Secretary",
  risk_manager: "Risk Manager",
};

function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge
      variant={role === "owner" ? "default" : "secondary"}
      className="capitalize shrink-0 whitespace-nowrap"
    >
      {ROLE_LABELS[role] ?? role}
    </Badge>
  );
}

// ─── Create Branch ────────────────────────────────────────────────────────────

function CreateBranchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createBranch = useMutation(api.branches.createBranch);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    setLoading(true);
    try {
      await createBranch({ name: name.trim(), code: code.trim(), location: location.trim() || undefined });
      toast.success(`Branch "${name}" created!`);
      setName(""); setCode(""); setLocation("");
      onClose();
    } catch (err) {
      toast.error(err instanceof ConvexError ? (err.data as { message: string }).message : "Failed to create branch.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create New Branch</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Branch Name *</Label>
            <Input placeholder="Kumasi Central" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Branch Code * <span className="text-muted-foreground font-normal">(2–5 letters)</span></Label>
            <Input
              placeholder="KMS" value={code} maxLength={5}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono uppercase"
            />
            {code && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Hash className="w-3 h-3" />
                Account numbers will look like:{" "}
                <span className="font-mono text-primary font-semibold">BBV-{code.toUpperCase()}-000001</span>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Location <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input placeholder="Kumasi, Ashanti Region" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading || !name.trim() || !code.trim()} className="gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Branch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assign Role (existing users) ────────────────────────────────────────────

function AssignRoleDialog({
  userId, currentRole, currentBranchId, userName, open, onClose,
}: {
  userId: Id<"users">; currentRole: Role; currentBranchId?: Id<"branches">; userName: string; open: boolean; onClose: () => void;
}) {
  const updateRole = useMutation(api.users.updateUserRole);
  const branches = useQuery(api.branches.listBranches);
  const [selectedRole, setSelectedRole] = useState<Role>(currentRole);
  const [selectedBranch, setSelectedBranch] = useState<string>(currentBranchId ?? "none");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateRole({
        userId,
        role: selectedRole,
        branchId: (selectedRole !== "owner") && selectedBranch !== "none"
          ? selectedBranch as Id<"branches">
          : undefined,
      });
      toast.success(`${userName}'s role updated to ${ROLE_LABELS[selectedRole]}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof ConvexError ? (err.data as { message: string }).message : "Failed to update role.");
    } finally {
      setLoading(false);
    }
  };

  const unchanged = selectedRole === currentRole &&
    (selectedRole === "owner" || selectedBranch === (currentBranchId ?? "none"));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Change Role — {userName}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([r, l]) => (
                  <SelectItem key={r} value={r}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(selectedRole !== "owner") && (
            <div className="space-y-1.5">
              <Label>Assigned Branch *</Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger><SelectValue placeholder="Select a branch..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No branch —</SelectItem>
                  {branches?.map((b) => (
                    <SelectItem key={b._id} value={b._id}>{b.name} ({b.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">This user can only view and record customer data in the selected branch.</p>
            </div>
          )}
          <RoleHint role={selectedRole} />
        </div>
        <DialogFooter className="mt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading || unchanged} className="gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create User (invite) ─────────────────────────────────────────────────────

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createInvite = useMutation(api.users.createInvite);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => { setName(""); setEmail(""); setRole("staff"); setDone(false); };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await createInvite({
        email: email.trim(),
        role,
        name: name.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      toast.error(err instanceof ConvexError ? (err.data as { message: string }).message : "Failed to create user.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Create New User
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="py-4 space-y-4">
            <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 space-y-2">
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4" /> User slot created
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">{email}</span> has been pre-assigned the{" "}
                <span className="font-medium text-foreground">{ROLE_LABELS[role]}</span> role.
              </p>
            </div>

            <div className="rounded-lg bg-muted p-3 space-y-2 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground text-sm">Next step — create their login:</p>
              <ol className="space-y-1.5 list-decimal list-inside">
                <li>Go to the <span className="font-medium text-foreground">Branding</span> tab in the Hercules App Builder sidebar</li>
                <li>Click <span className="font-medium text-foreground">Auth</span> and select your sign-in method</li>
                <li>Add the user with email <span className="font-mono font-medium text-foreground">{email}</span></li>
                <li>Share the login link / credentials with them</li>
              </ol>
              <p className="pt-1">When they sign in for the first time, they will automatically be placed in the <span className="font-medium text-foreground">{ROLE_LABELS[role]}</span> role.</p>
            </div>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDone(false)}>
                Add Another
              </Button>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="John Mensah"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email Address *</Label>
              <Input
                type="email"
                placeholder="john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([r, l]) => (
                    <SelectItem key={r} value={r}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <RoleHint role={role} />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={loading || !email.trim()} className="gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Create User
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoleHint({ role }: { role: Role }) {
  const hints: Record<Role, string> = {
    owner: "Full access — manage branches, team roles, all data and reports.",
    staff: "View and register customers, issue fuel credits, record payments and view reports in their assigned branch only.",
    branch_secretary: "Register drivers, issue fuel credits, record payments.",
    risk_manager: "View overdue alerts (3+ days), call drivers, register and deactivate drivers.",
  };
  return (
    <p className="text-xs text-muted-foreground rounded-lg bg-muted px-3 py-2 leading-relaxed">
      {hints[role]}
    </p>
  );
}

function InterestRateSettings() {
  const settings = useQuery(api.appSettings.getAppSettings);
  const saveRate = useMutation(api.appSettings.setInterestRate);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!settings) return <Skeleton className="h-48 w-full" />;
  const value = draft ?? String(settings.interestRatePercent);
  const rate = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(rate) && rate >= 0;
  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      await saveRate({ interestRatePercent: rate });
      setDraft(null);
      toast.success("Interest percentage saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save interest percentage.");
    } finally { setSaving(false); }
  }
  return <Card>
    <CardHeader><CardTitle>Interest percentage</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Applied to new fuel credits. Existing credits retain their original interest rate and amount.</p>
      <div className="space-y-2 max-w-sm">
        <Label htmlFor="interest-percentage">Interest percentage (%)</Label>
        <Input id="interest-percentage" type="number" min="0" step="any" value={value} onChange={e => setDraft(e.target.value)} disabled={saving} />
        {!valid && <p className="text-sm text-destructive">Enter a percentage of zero or greater.</p>}
      </div>
      {valid && <p className="text-sm">For GHS 100.00 of fuel, interest is GHS {(Math.round(100 * rate) / 100).toFixed(2)}.</p>}
      <Button onClick={save} disabled={saving || !valid || rate === settings.interestRatePercent}>{saving ? "Saving…" : "Save interest percentage"}</Button>
    </CardContent>
  </Card>;
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

type SettingsTab = "team" | "business" | "appearance" | "backup" | "danger" | "corrections";

const TAB_CONFIG: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }>; ownerOnly?: boolean }[] = [
  { id: "team", label: "Team & Branches", icon: Users },
  { id: "business", label: "Business", icon: Building2, ownerOnly: true },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "backup", label: "Backup", icon: Database },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle, ownerOnly: true },
  { id: "corrections", label: "Corrections", icon: ShieldCheck, ownerOnly: true },
];

export default function SettingsPage() {
  const staffList = useQuery(api.users.listStaff);
  const invites = useQuery(api.users.listInvites);
  const branches = useQuery(api.branches.listBranches);
  const currentUser = useQuery(api.users.getCurrentUserData);
  const appSettings = useQuery(api.appSettings.getAppSettings);
  const deleteInvite = useMutation(api.users.deleteInvite);

  const [activeTab, setActiveTab] = useState<SettingsTab>("team");
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [assignRoleTarget, setAssignRoleTarget] = useState<{
    userId: Id<"users">; role: Role; name: string; branchId?: Id<"branches">;
  } | null>(null);

  const isOwner = currentUser?.role === "owner";

  const handleDeleteInvite = async (inviteId: Id<"invited_users">, email: string) => {
    try {
      await deleteInvite({ inviteId });
      toast.success(`Invite for ${email} removed.`);
    } catch {
      toast.error("Failed to remove invite.");
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5 pb-10">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Manage branches, team, appearance and backups</p>
      </div>

      {/* ── Tab navigation ──────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl overflow-x-auto">
        {TAB_CONFIG.filter((t) => !t.ownerOnly || isOwner).map(({ id, label, icon: Icon, ownerOnly }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors flex-1 justify-center",
              activeTab === id
                ? ownerOnly
                  ? "bg-destructive text-white shadow-sm"
                  : "bg-background text-foreground shadow-sm"
                : ownerOnly
                ? "text-destructive/70 hover:text-destructive"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Team & Branches tab ─────────────────────────────────────────── */}
      {activeTab === "team" && (
        <>
          {/* Create User */}
          {isOwner && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" />
                  Create User
                </CardTitle>
                <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setCreateUserOpen(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add User
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  Pre-assign a role to an email. When the user signs in for the first time they will automatically receive their assigned role.
                  After saving, create their login from the{" "}
                  <span className="font-medium text-foreground">Branding → Auth</span> tab.
                </p>

                {invites === undefined ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : invites.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><Mail /></EmptyMedia>
                      <EmptyTitle>No users created yet</EmptyTitle>
                      <EmptyDescription>Click "Add User" to pre-assign a role to a new team member.</EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button size="sm" onClick={() => setCreateUserOpen(true)}>
                        <Plus className="w-4 h-4 mr-1" /> Add User
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : (
                  <div className="space-y-2">
                    {invites.map((invite) => (
                      <div key={invite._id} className="flex items-center gap-3 p-3 rounded-lg border">
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-xs shrink-0">
                          {invite.name?.charAt(0)?.toUpperCase() ?? invite.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{invite.name || invite.email}</p>
                          <p className="text-xs text-muted-foreground truncate">{invite.email}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <RoleBadge role={invite.role as Role} />
                          {invite.acceptedAt ? (
                            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Active
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3.5 h-3.5" /> Pending
                            </span>
                          )}
                          {!invite.acceptedAt && (
                            <button
                              onClick={() => handleDeleteInvite(invite._id, invite.email)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Remove invite"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Team Members */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Active Team Members</CardTitle>
              {isOwner && (
                <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                  <UserCog className="w-3.5 h-3.5" /> Click to change role
                </span>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {staffList === undefined ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
              ) : (
                staffList.map((user) => (
                  <div
                    key={user._id}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-lg transition-colors
                      ${isOwner && user._id !== currentUser?._id ? "hover:bg-muted cursor-pointer" : ""}`}
                    onClick={() => {
                      if (isOwner && user._id !== currentUser?._id) {
                        setAssignRoleTarget({
                          userId: user._id,
                          role: user.role as Role,
                          name: user.name ?? "Unknown",
                          branchId: user.branchId as Id<"branches"> | undefined,
                        });
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                        {user.name?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          {user.name ?? "Unknown"}
                          {user._id === currentUser?._id && (
                            <span className="text-xs text-muted-foreground font-normal">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <RoleBadge role={user.role as Role} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Role Legend */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Role Permissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(Object.entries(ROLE_LABELS) as [Role, string][]).map(([role, label]) => (
                <div key={role} className="flex items-start gap-3">
                  <RoleBadge role={role} />
                  <p className="text-muted-foreground text-xs leading-relaxed pt-0.5">
                    {role === "owner" && "Full access — manage branches, team roles, all data, and reports."}
                    {role === "staff" && "View and register customers, issue fuel credits, record payments and view reports in their assigned branch only."}
                    {role === "branch_secretary" && "Register and view drivers within their assigned branch only. Issue credits to their branch's drivers, record payments, submit EOD reports."}
                    {role === "risk_manager" && "View overdue alerts (3+ days), call drivers, register and deactivate drivers."}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Branches */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                Branches
              </CardTitle>
              {isOwner && (
                <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setCreateBranchOpen(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add Branch
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {branches === undefined ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : branches.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><Building2 /></EmptyMedia>
                    <EmptyTitle>No branches yet</EmptyTitle>
                    <EmptyDescription>
                      {isOwner ? "Create your first branch." : "Ask the owner to create a branch."}
                    </EmptyDescription>
                  </EmptyHeader>
                  {isOwner && (
                    <EmptyContent>
                      <Button size="sm" onClick={() => setCreateBranchOpen(true)}>
                        <Plus className="w-4 h-4 mr-1" /> Add Branch
                      </Button>
                    </EmptyContent>
                  )}
                </Empty>
              ) : (
                <div className="space-y-3">
                  {branches.map((branch) => (
                    <div key={branch._id} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center font-mono font-bold text-primary text-sm shrink-0">
                          {branch.code}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{branch.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {branch.location ?? "No location"} · Prefix:{" "}
                            <span className="font-mono text-primary">BBV-{branch.code}-</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">{branch.nextSequence - 1} registered</span>
                        <Badge variant={branch.isActive ? "default" : "secondary"}>
                          {branch.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Business Info */}
          <Card>
            <CardHeader><CardTitle className="text-base">Business Info</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p><span className="font-medium text-foreground">Business:</span> BESTBRYT VENTURES</p>
              <p><span className="font-medium text-foreground">Account Format:</span> <span className="font-mono text-primary">BBV-{"{BRANCH}"}-{"{000001}"}</span></p>
              <p><span className="font-medium text-foreground">Interest Rate:</span> {appSettings?.interestRatePercent ?? 5}% per transaction</p>
              <p><span className="font-medium text-foreground">Due Period:</span> 24 hours</p>
              <p><span className="font-medium text-foreground">Penalty:</span> 5% per overdue day, Monday–Saturday (Sunday excluded)</p>
              <p><span className="font-medium text-foreground">Currency:</span> Ghana Cedis (GHS)</p>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Appearance tab ──────────────────────────────────────────────── */}
      {activeTab === "business" && isOwner && <InterestRateSettings />}
      {activeTab === "appearance" && <AppearanceSettings />}

      {/* ── Backup tab ──────────────────────────────────────────────────── */}
      {activeTab === "backup" && <BackupRestore />}

      {/* ── Danger Zone tab (owner only) ─────────────────────────────────── */}
      {activeTab === "danger" && isOwner && <DangerZone />}
      {activeTab === "corrections" && isOwner && <CorrectionsBoundary><AdminCorrections /></CorrectionsBoundary>}

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      <CreateBranchDialog open={createBranchOpen} onClose={() => setCreateBranchOpen(false)} />
      <CreateUserDialog open={createUserOpen} onClose={() => setCreateUserOpen(false)} />
      {assignRoleTarget && (
        <AssignRoleDialog
          userId={assignRoleTarget.userId}
          currentRole={assignRoleTarget.role}
          currentBranchId={assignRoleTarget.branchId}
          userName={assignRoleTarget.name}
          open={true}
          onClose={() => setAssignRoleTarget(null)}
        />
      )}
    </div>
  );
}
