import type {Doc} from "../_generated/dataModel";
import {penaltyDays} from "./penaltyDays";

export function traderJourney(tx:Doc<"transactions">, payments:Doc<"payments">[], faults:Doc<"complaints">[]) {
  const receipts=payments.slice().sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt));
  const base=tx.fuelAmountGhs+(tx.interestCollectedUpfront?0:tx.interestGhs);
  let collected=0;
  const paidDays:string[]=[];
  for(const receipt of receipts){
    const days=penaltyDays(tx.dueAt,new Date(receipt.recordedAt));
    if(receipt.reconciliationStatus!=="verified"||!receipt.penaltyGhs||days<1||days>3)continue;
    collected+=Math.round(receipt.penaltyGhs*100);
    while(base>0&&paidDays.length<days&&collected>=Math.round(base*5*(paidDays.length+1))){
      paidDays.push(receipt.recordedAt);
    }
  }
  const last=receipts[receipts.length-1];
  return {issued:tx.issuedAt,returned:last?.recordedAt??null,receiptCount:receipts.length,
    settled:tx.status==="paid",faulty:faults.some(f=>f.category==="vehicle_fault"&&f.status==="open"),
    paidDays};
}
