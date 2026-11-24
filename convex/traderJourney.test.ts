import {expect,it} from "vitest";
import {traderJourney} from "./lib/traderJourney";
import type {Doc} from "./_generated/dataModel";
const tx={dueAt:"2026-11-13T08:00:00Z",fuelAmountGhs:500,interestCollectedUpfront:true,issuedAt:"2026-11-12T08:00:00Z",status:"pending"} as Doc<"transactions">;
const payment=(day:number,penalty:number,status="verified")=>({recordedAt:"2026-11-"+day+"T08:00:00Z",penaltyGhs:penalty,reconciliationStatus:status} as Doc<"payments">);
it("counts fully paid penalty days, skips Sunday and ignores late or unverified receipts",()=>{
 const receipts=[payment(14,10),payment(15,15),payment(16,25),payment(17,25,"pending"),payment(18,100)];
 const result=traderJourney(tx,receipts,[{category:"vehicle_fault",status:"open"} as Doc<"complaints">]);
 expect(result.paidDays).toEqual([receipts[1].recordedAt,receipts[2].recordedAt]);
 expect(result.faulty).toBe(true);
 expect(result.returned).toBe(receipts[4].recordedAt);
 expect(traderJourney(tx,[payment(17,75)],[]).paidDays).toHaveLength(3);
 expect(traderJourney(tx,[],[]).faulty).toBe(false);
});

it("uses the verification that completes the interest payment or the upfront fuel issue",()=>{
 const credit={...tx,interestGhs:20,interestCollectedUpfront:false};
 const first={...payment(14,0),interestGhs:8,reconciledAt:"2026-11-15T08:00:00Z"};
 const second={...payment(14,0),interestGhs:12,reconciledAt:"2026-11-15T08:03:00Z"};
 expect(traderJourney(credit,[first],[]).confirmedInterestAt).toBeNull();
 expect(traderJourney(credit,[second,first],[]).confirmedInterestAt).toBe(second.reconciledAt);
 expect(traderJourney({...credit,interestCollectedUpfront:true},[],[]).confirmedInterestAt).toBe(credit.issuedAt);
});

it("uses the daily penalty charged on the receipt for a funded driver's eligible days",()=>{
 const credit={...tx,interestRatePercent:10};
 expect(traderJourney(credit,[payment(16,50)],[]).paidDays).toHaveLength(1);
 expect(traderJourney(credit,[{...payment(16,25),dailyPenaltyGhs:25}],[]).paidDays).toHaveLength(1);
});
