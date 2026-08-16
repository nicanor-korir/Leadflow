import type { Lead } from "./types";

export const FILTERS = ["all", "hot", "warm", "cold"] as const;
export type Filter = (typeof FILTERS)[number];

export function isFilter(value: string | null | undefined): value is Filter {
  return !!value && (FILTERS as readonly string[]).includes(value);
}

/**
 * Shared by the table and the CSV export so "export" always means "export
 * exactly the rows I am looking at". Duplicating this logic is how the two
 * quietly drift apart.
 */
export function filterLeads(leads: Lead[], query: string, filter: Filter): Lead[] {
  const needle = query.trim().toLowerCase();
  return leads.filter((lead) => {
    if (filter !== "all" && lead.temperature !== filter) return false;
    if (!needle) return true;
    return [lead.name, lead.email, lead.company, lead.message]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(needle));
  });
}
