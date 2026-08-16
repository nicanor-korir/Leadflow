import type { Lead } from "./types";
import { budgetLabel, teamSizeLabel, timelineLabel } from "./types";

/**
 * RFC 4180 escaping. A lead's message routinely contains commas, quotes and
 * newlines — without this, one chatty prospect corrupts the whole file.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const COLUMNS: { header: string; value: (lead: Lead) => unknown }[] = [
  { header: "id", value: (l) => l.id },
  { header: "created_at", value: (l) => l.created_at },
  { header: "name", value: (l) => l.name },
  { header: "email", value: (l) => l.email },
  { header: "company", value: (l) => l.company },
  { header: "team_size", value: (l) => l.team_size },
  { header: "team_size_label", value: (l) => teamSizeLabel(l.team_size) },
  { header: "budget_usd_monthly", value: (l) => l.budget },
  { header: "budget_label", value: (l) => budgetLabel(l.budget) },
  { header: "timeline", value: (l) => l.timeline },
  { header: "timeline_label", value: (l) => timelineLabel(l.timeline) },
  { header: "score", value: (l) => l.score },
  { header: "temperature", value: (l) => l.temperature },
  { header: "score_source", value: (l) => l.score_source },
  { header: "ai_reason", value: (l) => l.ai_reason },
  { header: "status", value: (l) => l.status },
  { header: "outcome", value: (l) => l.outcome },
  { header: "message", value: (l) => l.message },
];

export function leadsToCsv(leads: Lead[]): string {
  const lines = [
    COLUMNS.map((c) => c.header).join(","),
    ...leads.map((lead) => COLUMNS.map((c) => cell(c.value(lead))).join(",")),
  ];
  // CRLF per the spec, and a BOM so Excel reads UTF-8 names correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function csvFilename(now = new Date()): string {
  return `leadflow-leads-${now.toISOString().slice(0, 10)}.csv`;
}
