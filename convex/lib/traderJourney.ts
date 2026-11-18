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
  let confirmedInterestAt=tx.interestCollectedUpfront?tx.issuedAt:null;
  if(!confirmedInterestAt && tx.interestGhs>0){
    let total=0;
    const verified=receipts.filter(p=>p.reconciliationStatus==="verified" && (p.interestGhs??0)>0)
      .map(p=>({at:[p.reconciledAt??p.recordedAt,p.recordedAt].sort()[1],amount:Math.round(p.interestGhs!*100)}))
      .sort((a,b)=>a.at.localeCompare(b.at));
    for(const receipt of verified){
      total+=receipt.amount;
      if(total>=Math.round(tx.interestGhs*100)){confirmedInterestAt=receipt.at;break;}
    }
  }
  const last=receipts[receipts.length-1];
  return {confirmedInterestAt,issued:tx.issuedAt,returned:last?.recordedAt??null,receiptCount:receipts.length,
    settled:tx.status==="paid",faulty:faults.some(f=>f.category==="vehicle_fault"&&f.status==="open"),
    paidDays};
}
