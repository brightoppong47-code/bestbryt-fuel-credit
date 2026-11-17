import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "sonner";
export function SmartTradingSettings() {
  const status=useQuery(api.smartTrading.connectionStatus);
  const configure=useMutation(api.smartTrading.configure);
  const [settings,setSettings]=useState("");const [busy,setBusy]=useState(false);
  return <Card><CardHeader><CardTitle>Smart Trading Connection</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm">{status?.configured?"Connection settings saved. Requests and verified repayment activity are delivered automatically every five minutes.":"Open Smart Trading as admin, copy its connection settings, and paste them here."}</p>
    {status?.requestUrl&&<p className="text-xs break-all">{status.requestUrl}</p>}
    <Textarea aria-label="Smart Trading connection settings" autoComplete="off" value={settings} onChange={e=>setSettings(e.target.value)} placeholder="Paste connection settings here" rows={4}/>
    <Button disabled={busy||!settings.trim()} onClick={async()=>{setBusy(true);try{const parsed=JSON.parse(settings) as {requestUrl:string;bridgeSecret:string;sitesToken:string};await configure({requestUrl:parsed.requestUrl,bridgeSecret:parsed.bridgeSecret,sitesToken:parsed.sitesToken});setSettings("");toast.success("Smart Trading connection saved");}catch{toast.error("Unable to save. Paste the full connection settings copied from Smart Trading.");}finally{setBusy(false);}}}>{busy?"Saving…":"Connect Smart Trading"}</Button>
    <p className="text-xs text-muted-foreground">This sends only trading codes, request amounts and linked credit activity. It does not allow Smart Trading to change fuel balances. Keep connection settings private.</p>
  </CardContent></Card>;
}
