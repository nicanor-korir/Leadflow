import type { ScoreSource, Temperature } from "./score";

/** Sales outcome, written back once a deal resolves. This is what makes the
 *  scores falsifiable — without it, nobody can tell whether a 90 beats a 50. */
export const OUTCOMES = ["won", "lost", "no_response"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABELS: Record<Outcome, string> = {
  won: "Won",
  lost: "Lost",
  no_response: "No response",
};

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
  score_source: ScoreSource | null;
  outcome: Outcome | null;
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

export function teamSizeLabel(value: number | null | undefined): string {
  return TEAM_SIZES.find((t) => t.value === value)?.label ?? (value ? `${value} people` : "—");
}

export function budgetLabel(value: number | null | undefined): string {
  return BUDGETS.find((b) => b.value === value)?.label ?? (value ? `$${value.toLocaleString()}` : "—");
}

/** "3h ago" / "2d ago" — the dashboard stores created_at but never showed it. */
export function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
