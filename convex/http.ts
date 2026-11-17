import { httpRouter } from "convex/server";
import { auth } from "./auth";
const http = httpRouter();
auth.addHttpRoutes(http);
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
http.route({path:"/smart-trading/demo-history",method:"POST",handler:httpAction(async(ctx,req)=>{
  const config=await ctx.runQuery(internal.smartTrading.connection,{});
  if(!config||req.headers.get("Authorization")!=="Bearer "+config.bridgeSecret)return new Response(null,{status:403});
  const fields=await req.json() as {account?:string;driver?:string};
  if(typeof fields.account!=="string"||!fields.account.trim()||fields.account.length>120)return new Response(null,{status:400});
  const result=await ctx.runQuery(internal.smartTrading.demoHistory,{account:fields.account});
  return Response.json(result,{status:result?200:404,headers:{"Cache-Control":"no-store"}});
})});
export default http;
