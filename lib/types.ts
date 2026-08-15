import type { Temperature } from "./score";

export interface Lead {
  id: number;
  created_at: string;
  name: string;
  email: string;
  company: string | null;
  team_size: number | null;
  budget: number | null;
  timeline: number | null;
  message: string | null;
  score: number | null;
  temperature: Temperature | null;
  ai_reason: string | null;
  status: string | null;
}

export const TEAM_SIZES = [
  { value: 1, label: "Just me" },
  { value: 10, label: "2–10 people" },
  { value: 50, label: "11–50 people" },
  { value: 200, label: "51–200 people" },
  { value: 1000, label: "200+ people" },
];

// No "/ mo" suffix — the field label already says "Monthly budget", and the
// longer strings truncate inside the two-column select on narrow screens.
export const BUDGETS = [
  { value: 0, label: "Not sure yet" },
  { value: 500, label: "Under $500" },
  { value: 2000, label: "$500 – $2,000" },
  { value: 10000, label: "$2,000 – $10,000" },
  { value: 50000, label: "$10,000+" },
];

export const TIMELINES = [
  { value: 0, label: "Just researching" },
  { value: 1, label: "This quarter" },
  { value: 2, label: "Next few weeks" },
  { value: 3, label: "Urgent — right now" },
];

export function timelineLabel(value: number | null | undefined): string {
  return TIMELINES.find((t) => t.value === value)?.label ?? "—";
}
