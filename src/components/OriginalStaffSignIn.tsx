import { useState } from "react";
import { useAuth } from "@usehercules/auth/react";
import { Button } from "./ui/button";

export function OriginalStaffSignIn() {
  const {isAuthenticated, removeUser, signin}=useAuth();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  return <div className="space-y-3">
    {isAuthenticated && <p className="text-sm text-muted-foreground">Your previous login could not connect. Sign in again to reopen your account.</p>}
    <Button disabled={busy} onClick={async()=>{
      setBusy(true);setError("");
      try {await removeUser();await signin();}
      catch {setError("Could not open the original login. Please try again.");setBusy(false);}
    }}>{busy?"Opening login…":isAuthenticated?"Sign in again with original account":"Original staff / admin login"}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
