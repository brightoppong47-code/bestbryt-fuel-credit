import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run every hour to keep statuses and penalties current.
// Hourly (not daily) because a transaction can flip from pending → overdue
// at any point in the day and drivers/staff check the app throughout the day.
crons.hourly(
  "update penalty amounts and overdue statuses",
  { minuteUTC: 0 },
  internal.penalties.updatePenaltiesAndStatuses,
);

crons.interval("deliver Smart Trading registration requests", { minutes: 5 }, internal.smartTrading.deliverRequests);

crons.interval("deliver Smart Trading repayment activity", { minutes: 5 }, internal.smartTrading.deliverActivities);

crons.interval("sync selected demo customers", { minutes: 1 }, internal.smartTrading.syncDemoHistory);
export default crons;

crons.interval("sync active Smart Trading drivers", {minutes:5}, internal.smartTrading.syncActiveDirectory, {});
