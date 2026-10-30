import { NavLink, Outlet } from "react-router-dom";
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { OriginalStaffSignIn } from "@/components/OriginalStaffSignIn";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useAuth } from "@/hooks/use-auth.ts";
import { useAuthActions, useConvexAuth as usePasswordAuth } from "@convex-dev/auth/react";
import { PasswordSignIn } from "@/components/PasswordSignIn";
import { useAppAppearance } from "@/hooks/use-app-appearance.ts";
import {
  LayoutDashboard,
  Users,
  Fuel,
  ClipboardList,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldAlert,
  ClipboardCheck,
  MessageSquare,
  ShieldCheck,
  HandCoins,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils.ts";

type Role = "owner" | "staff" | "branch_secretary" | "risk_manager";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  roles?: Role[]; // undefined = visible to all roles
};

const ALL_NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, roles: ["owner", "staff"] },
  { to: "/drivers", label: "Drivers", icon: Users },
  { to: "/credits", label: "Fuel Credits", icon: Fuel, roles: ["owner", "staff", "branch_secretary"] },
  { to: "/eod", label: "End of Day", icon: ClipboardCheck, roles: ["branch_secretary"] },
  { to: "/risk", label: "Risk Manager", icon: ShieldAlert, roles: ["owner", "risk_manager"] },
  { to: "/messages", label: "Messages", icon: MessageSquare, roles: ["owner", "staff"] },
  { to: "/reports", label: "Reports", icon: ClipboardList, roles: ["owner", "staff"] },
  { to: "/reconciliation", label: "Reconciliation", icon: ShieldCheck, roles: ["owner"] },
  { to: "/handovers", label: "Handovers", icon: HandCoins, roles: ["owner", "staff", "branch_secretary"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["owner"] },
];

function getNavItems(role: Role | undefined): NavItem[] {
  if (!role) return [];
  return ALL_NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}

const ROLE_LABELS: Record<Role, string> = {
  owner: "Admin",
  staff: "Staff",
  branch_secretary: "Branch Secretary",
  risk_manager: "Risk Manager",
};

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { signout: legacySignout, removeUser } = useAuth();
  const {signOut: passwordSignout}=useAuthActions();
  const passwordAuth=usePasswordAuth();
  const signout=async()=>{if(passwordAuth.isAuthenticated) { await removeUser(); await passwordSignout(); } else await legacySignout();};
  const currentUser = useQuery(api.users.getCurrentUserData);
  const navItems = getNavItems(currentUser?.role as Role | undefined);
  const { settings } = useAppAppearance();
  const iconLabel = settings.appIcon;
  // Logo comes from Convex so it syncs across all devices
  const appSettings = useQuery(api.appSettings.getAppSettings);
  const logoUrl = appSettings?.logoUrl ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center font-bold text-accent-foreground text-sm shrink-0 overflow-hidden">
            {logoUrl
              ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-0.5" />
              : iconLabel
            }
          </div>
          <div className="leading-tight">
            <div className="font-bold text-sidebar-foreground text-sm">BESTBRYT</div>
            <div className="text-xs text-sidebar-foreground/60 font-medium">VENTURES</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
            {currentUser?.name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-sidebar-foreground text-xs font-semibold truncate">
              {currentUser?.name ?? "Staff"}
            </div>
            <div className="text-sidebar-foreground/50 text-xs">
              {currentUser?.role ? ROLE_LABELS[currentUser.role as Role] ?? currentUser.role : ""}
            </div>
          </div>
        </div>
        <button
          onClick={() => signout()}
          className="flex items-center gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground text-xs w-full transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}

function AppLayout() {
  const currentUser = useQuery(api.users.getCurrentUserData);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { settings } = useAppAppearance();
  // Logo from Convex for cross-device sync
  const appSettings = useQuery(api.appSettings.getAppSettings);
  const logoUrl = appSettings?.logoUrl ?? null;

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 flex-col bg-sidebar shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 h-full bg-sidebar flex flex-col">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 text-sidebar-foreground/60 hover:text-sidebar-foreground"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-sidebar border-b border-sidebar-border">
          <button onClick={() => setMobileOpen(true)} className="text-sidebar-foreground/70">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-accent flex items-center justify-center text-accent-foreground font-bold text-xs overflow-hidden">
              {logoUrl
                ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                : settings.appIcon
              }
            </div>
            <span className="text-sidebar-foreground font-bold text-sm">BESTBRYT VENTURES</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          {!currentUser ? <p className="p-6">Loading account…</p> : currentUser.role !== "owner" && !(currentUser.role === "risk_manager" ? (currentUser.branchIds ?? (currentUser.branchId ? [currentUser.branchId] : [])).length : currentUser.branchId)
            ? <div className="p-6"><h1 className="text-xl font-bold">Branch assignment required</h1><p className="mt-2 text-muted-foreground">Ask admin to assign your branch before viewing or recording customer data.</p></div>
            : <Outlet />}
        </main>
      </div>
    </div>
  );
}

export default function AuthenticatedLayout() {
  return (
    <>
      <AuthLoading>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Skeleton className="h-12 w-48" />
        </div>
      </AuthLoading>
      <Unauthenticated>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-6 p-8">
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl mb-2">
                BB
              </div>
              <h1 className="text-2xl font-bold">BESTBRYT VENTURES</h1>
              <p className="text-muted-foreground text-sm">Fuel Credit Management System</p>
            </div>
            <PasswordSignIn />
            <OriginalStaffSignIn />
          </div>
        </div>
      </Unauthenticated>
      <Authenticated>
        <AppLayout />
      </Authenticated>
    </>
  );
}
