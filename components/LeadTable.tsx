"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Download, Search } from "lucide-react";
import { FILTERS, filterLeads, type Filter } from "@/lib/filter";
import { OUTCOME_LABELS, relativeTime, type Lead } from "@/lib/types";

const TEMPERATURE_STYLES: Record<string, string> = {
  hot: "bg-hot/10 text-hot",
  warm: "bg-warm/10 text-[#b45309]",
  cold: "bg-cold/10 text-cold",
};

const SCORE_BAR: Record<string, string> = {
  hot: "bg-hot",
  warm: "bg-warm",
  cold: "bg-cold",
};

const OUTCOME_STYLES: Record<string, string> = {
  won: "bg-good/10 text-good",
  lost: "bg-hot/10 text-hot",
  no_response: "bg-[#f1f2f7] text-muted",
};

export default function LeadTable({
  leads,
  highlightId,
  onSelect,
}: {
  leads: Lead[];
  highlightId?: number;
  onSelect: (lead: Lead) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => filterLeads(leads, query, filter), [leads, query, filter]);

  // The export mirrors the toolbar, so you download exactly what you're looking at.
  const exportHref = `/api/leads/export?${new URLSearchParams({
    ...(query.trim() ? { q: query.trim() } : {}),
    ...(filter !== "all" ? { temperature: filter } : {}),
  })}`;

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-[240px] sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="field py-2 pl-9 text-[13px]"
            placeholder="Search leads…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search leads"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-line bg-[#fbfbfe] p-1">
            {FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={[
                  "rounded-lg px-3 py-1.5 text-[12px] font-semibold capitalize transition",
                  filter === option
                    ? "bg-white text-ink shadow-[0_1px_2px_rgba(26,31,54,0.10)]"
                    : "text-muted hover:text-ink",
                ].join(" ")}
              >
                {option}
              </button>
            ))}
          </div>

          <a
            href={exportHref}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-[12px] font-semibold text-ink transition hover:border-accent hover:text-accent"
            title={`Export ${visible.length} lead${visible.length === 1 ? "" : "s"} as CSV`}
          >
            <Download className="h-3.5 w-3.5" />
            Export
            <span className="tabular-nums text-muted">({visible.length})</span>
          </a>
        </div>
      </div>

      <div className="scroll-slim -mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-muted">
              <th className="border-b border-line pb-2 pr-3 font-semibold">Lead</th>
              <th className="border-b border-line pb-2 pr-3 font-semibold">Company</th>
              <th className="border-b border-line pb-2 pr-3 font-semibold">AI score</th>
              <th className="border-b border-line pb-2 pr-3 font-semibold">Temp</th>
              <th className="border-b border-line pb-2 font-semibold">CRM</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((lead) => {
              const temperature = lead.temperature ?? "cold";
              const score = lead.score ?? 0;

              return (
                <tr
                  key={lead.id}
                  onClick={() => onSelect(lead)}
                  className={[
                    "cursor-pointer align-top transition-colors",
                    lead.id === highlightId
                      ? "animate-fade-up bg-accent-soft/60"
                      : "hover:bg-[#fafbff]",
                  ].join(" ")}
                >
                  <td className="border-b border-line py-3 pr-3">
                    {/* A real button so the row is reachable by keyboard, not just by mouse. */}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(lead);
                      }}
                      className="rounded text-left text-[13.5px] font-semibold text-ink outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      {lead.name}
                    </button>
                    <p className="text-[12px] text-muted">{lead.email}</p>
                    <p className="mt-0.5 text-[11px] text-muted/80">{relativeTime(lead.created_at)}</p>
                  </td>

                  <td className="border-b border-line py-3 pr-3 text-[13px] text-ink">
                    {lead.company || <span className="text-muted">—</span>}
                  </td>

                  <td className="border-b border-line py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold tabular-nums text-ink">{score}</span>
                      <span className="text-[11px] text-muted">/100</span>
                      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-line">
                        <span
                          className={`block h-full rounded-full ${SCORE_BAR[temperature]}`}
                          style={{ width: `${score}%` }}
                        />
                      </span>
                    </div>
                    {lead.ai_reason && (
                      <p className="mt-1 line-clamp-2 max-w-[280px] text-[12px] leading-snug text-muted">
                        {lead.ai_reason}
                      </p>
                    )}
                  </td>

                  <td className="border-b border-line py-3 pr-3">
                    <span className={`pill ${TEMPERATURE_STYLES[temperature]}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {temperature}
                    </span>
                  </td>

                  <td className="border-b border-line py-3">
                    <div className="flex flex-col items-start gap-1">
                      {lead.status === "synced" ? (
                        <span className="pill bg-good/10 text-good">
                          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                          synced
                        </span>
                      ) : (
                        <span className="pill bg-[#f1f2f7] text-muted">
                          <Clock className="h-3.5 w-3.5" strokeWidth={2.5} />
                          captured
                        </span>
                      )}
                      {lead.outcome && (
                        <span className={`pill ${OUTCOME_STYLES[lead.outcome]}`}>
                          {OUTCOME_LABELS[lead.outcome]}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-[13px] text-muted">
                  No leads match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
