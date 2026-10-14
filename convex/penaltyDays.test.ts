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
