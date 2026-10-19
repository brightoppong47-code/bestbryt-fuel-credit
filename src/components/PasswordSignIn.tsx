import { useState } from "react";
import { useAuth as useLegacyAuth } from "@usehercules/auth/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
export function PasswordSignIn() {
  const {signIn}=useAuthActions();
  const legacy=useLegacyAuth();
  const [email,setEmail]=useState("");const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  return <form className="space-y-3 text-left w-full max-w-sm mx-auto" onSubmit={async e=>{
    e.preventDefault();setBusy(true);setError("");
    try {await signIn("password",{email:email.trim().toLowerCase(),password,flow:"signIn"});await legacy.removeUser();setPassword("");}
    catch {setError("Could not sign in. Check your email and password, or ask admin for help. After several failed attempts, wait before trying again.");}
    finally {setBusy(false);}
  }}>
    <p className="text-sm font-medium">Sign in with an account created by admin</p>
    <div className="space-y-1"><Label htmlFor="login-email">Email</Label><Input id="login-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required disabled={busy}/></div>
    <div className="space-y-1"><Label htmlFor="login-password">Password</Label><Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy}/></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button className="w-full" disabled={busy}>{busy?"Signing in…":"Sign in"}</Button>
    <p className="text-xs text-muted-foreground">New account or forgotten password? Contact admin. Existing staff can use the original login below.</p>
  </form>;
}
