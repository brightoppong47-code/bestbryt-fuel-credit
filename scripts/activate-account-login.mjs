// Run once in the already-authorized Codespace. Secrets are never printed or saved to the repository.
import { generateKeyPair, exportJWK, exportPKCS8 } from 'jose';
import { spawnSync } from 'node:child_process';
const deployment='prod:blissful-hawk-149';
function run(args, capture=false, input) {
  const result=spawnSync('npx',['convex',...args],{env:{...process.env,CONVEX_DEPLOYMENT:deployment},encoding:'utf8',input,stdio:capture?'pipe':'inherit'});
  if(result.status!==0) throw new Error('Convex command failed. Check your login and try again.');
  return result.stdout?.trim();
}
const privatePresent=run(['env','get','JWT_PRIVATE_KEY'],true);
const publicPresent=run(['env','get','JWKS'],true);
if (!!privatePresent !== !!publicPresent) throw new Error('Only one signing-key variable exists. Stop and ask for help; keys have not been replaced.');
if (!privatePresent) {
  const pair=await generateKeyPair('RS256',{extractable:true});
  const key=(await exportPKCS8(pair.privateKey)).trimEnd().replace(/\n/g,' ');
  const publicKey=JSON.stringify({keys:[{use:'sig',...await exportJWK(pair.publicKey)}]});
  run(['env','set'],true,`JWT_PRIVATE_KEY='${key}'\nJWKS='${publicKey}'\n`);
  console.log('Account-login signing keys configured.');
} else console.log('Existing account-login signing keys preserved.');
run(['deploy']);
