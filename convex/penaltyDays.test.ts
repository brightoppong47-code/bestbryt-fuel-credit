import { it, expect } from "vitest";
import { penaltyDays } from "./lib/penaltyDays";
it("skips Sunday and resumes Monday at the existing daily anniversary", () => {
  const due = "2026-10-17T10:00:00Z";
  expect(penaltyDays(due, new Date("2026-10-18T10:00:00Z"))).toBe(0);
  expect(penaltyDays(due, new Date("2026-10-18T23:59:59Z"))).toBe(0);
  expect(penaltyDays(due, new Date("2026-10-19T09:59:59Z"))).toBe(0);
  expect(penaltyDays(due, new Date("2026-10-19T10:00:00Z"))).toBe(1);
});
it("counts Saturday, excludes every Sunday and retains the 24-hour grace", () => {
  const due = "2026-10-16T10:00:00Z";
  expect(penaltyDays(due, new Date(due))).toBe(0);
  expect(penaltyDays(due, new Date("2026-10-17T09:59:59Z"))).toBe(0);
  expect(penaltyDays(due, new Date("2026-10-17T10:00:00Z"))).toBe(1);
  expect(penaltyDays(due, new Date("2026-10-18T20:00:00Z"))).toBe(1);
  expect(penaltyDays(due, new Date("2026-10-30T10:00:00Z"))).toBe(12);
});
it("matches a day-by-day reference for all starting weekdays and long periods", () => {
  for (let start=12; start<=18; start++) {
    const due=new Date(Date.UTC(2026,9,start,13));
    for(const elapsed of [0,1,2,6,7,8,14,31,365]) {
      let expected=0;
      for(let d=1;d<=elapsed;d++) if(new Date(due.getTime()+d*86400000).getUTCDay()!==0) expected++;
      expect(penaltyDays(due.toISOString(),new Date(due.getTime()+elapsed*86400000))).toBe(expected);
    }
  }
});
it("gives Saturday credits eight extra hours before the first Monday penalty", () => {
  const issued="2026-11-21T06:00:00Z", due="2026-11-22T06:00:00Z";
  for (const now of ["2026-11-22T20:00:00Z","2026-11-23T06:00:00Z","2026-11-23T13:59:59.999Z"]) expect(penaltyDays(due,new Date(now),issued)).toBe(0);
  expect(penaltyDays(due,new Date("2026-11-23T14:00:00Z"),issued)).toBe(1);
  expect(penaltyDays(due,new Date("2026-11-24T06:00:00Z"),issued)).toBe(2);
  expect(penaltyDays(due,new Date("2026-11-30T06:00:00Z"),issued)).toBe(7);
});
it("handles late Saturday fuel whose eight-hour extension ends on Tuesday", () => {
  const issued="2026-11-21T20:00:00Z", due="2026-11-22T20:00:00Z";
  expect(penaltyDays(due,new Date("2026-11-24T03:59:59Z"),issued)).toBe(0);
  expect(penaltyDays(due,new Date("2026-11-24T04:00:00Z"),issued)).toBe(1);
  expect(penaltyDays(due,new Date("2026-11-24T20:00:00Z"),issued)).toBe(2);
});
