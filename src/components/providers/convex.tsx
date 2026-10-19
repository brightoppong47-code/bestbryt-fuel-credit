import { ConvexAuthProvider, useConvexAuth as usePasswordAuth } from "@convex-dev/auth/react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { ConvexProviderWithHerculesAuth } from "@usehercules/auth/convex-react";

const convexUrl = import.meta.env.VITE_CONVEX_URL ?? "http://localhost:3000";
const convex = new ConvexReactClient(convexUrl);
const passwordSessionClient = new ConvexReactClient(convexUrl);

function BusinessProvider({children}:{children:React.ReactNode}) {
  const password = usePasswordAuth();
  if (password.isLoading) return <div className="min-h-screen flex items-center justify-center">Loading account…</div>;
  if (password.isAuthenticated) {
    return <ConvexProviderWithAuth client={convex} useAuth={usePasswordAuth}>{children}</ConvexProviderWithAuth>;
  }
  // Preserve the original provider's stable token callback and refresh locking.
  return <ConvexProviderWithHerculesAuth client={convex}>{children}</ConvexProviderWithHerculesAuth>;
}
export function ConvexProvider({ children }: { children: React.ReactNode }) {
  return <ConvexAuthProvider client={passwordSessionClient} shouldHandleCode={false}>
    <BusinessProvider>{children}</BusinessProvider>
  </ConvexAuthProvider>;
}
