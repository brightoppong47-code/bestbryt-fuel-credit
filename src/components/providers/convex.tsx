import { ConvexAuthProvider, useConvexAuth as usePasswordAuth } from "@convex-dev/auth/react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useAuth as useLegacyAuth } from "@usehercules/auth/react";
import { useCallback, useMemo } from "react";

const convexUrl = import.meta.env.VITE_CONVEX_URL ?? "http://localhost:3000";
const convex = new ConvexReactClient(convexUrl);
// Keep the password library's session client separate from the business-data client.
const passwordSessionClient = new ConvexReactClient(convexUrl);
function useCombinedAuth() {
  const password = usePasswordAuth();
  const legacy = useLegacyAuth();
  const {isAuthenticated:passwordAuthenticated,fetchAccessToken:fetchPasswordToken}=password;
  const {isAuthenticated:legacyAuthenticated,user:legacyUser,signinSilent}=legacy;
  const fetchAccessToken = useCallback(async (options: {forceRefreshToken:boolean}) => {
    if (passwordAuthenticated) return fetchPasswordToken(options);
    if (!legacyAuthenticated) return null;
    if (!options.forceRefreshToken) return legacyUser?.id_token ?? null;
    try { return (await signinSilent())?.id_token ?? null; } catch { return null; }
  }, [passwordAuthenticated, fetchPasswordToken, legacyAuthenticated, legacyUser?.id_token, signinSilent]);
  return useMemo(() => ({isLoading: password.isLoading || (!password.isAuthenticated && legacy.isLoading),
    isAuthenticated:password.isAuthenticated || legacy.isAuthenticated,fetchAccessToken}),
    [password.isLoading,password.isAuthenticated,legacy.isLoading,legacy.isAuthenticated,fetchAccessToken]);
}
function BusinessProvider({children}:{children:React.ReactNode}) {
  return <ConvexProviderWithAuth client={convex} useAuth={useCombinedAuth}>{children}</ConvexProviderWithAuth>;
}
export function ConvexProvider({ children }: { children: React.ReactNode }) {
  return <ConvexAuthProvider client={passwordSessionClient} shouldHandleCode={false}>
    <BusinessProvider>{children}</BusinessProvider>
  </ConvexAuthProvider>;
}
