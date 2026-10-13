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

export default crons;
