"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Search } from "lucide-react";
import type { Lead } from "@/lib/types";

const FILTERS = ["all", "hot", "warm", "cold"] as const;
type Filter = (typeof FILTERS)[number];

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

export default function LeadTable({ leads, highlightId }: { leads: Lead[]; highlightId?: number }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (filter !== "all" && lead.temperature !== filter) return false;
      if (!needle) return true;
      return [lead.name, lead.email, lead.company, lead.message]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [leads, query, filter]);

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-[260px] sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="field py-2 pl-9 text-[13px]"
            placeholder="Search leads…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search leads"
          />
        </div>

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
      </div>

      <div className="scroll-slim -mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
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
                  className={[
                    "align-top transition-colors",
                    lead.id === highlightId ? "animate-fade-up bg-accent-soft/60" : "hover:bg-[#fafbff]",
                  ].join(" ")}
                >
                  <td className="border-b border-line py-3 pr-3">
                    <p className="text-[13.5px] font-semibold text-ink">{lead.name}</p>
                    <p className="text-[12px] text-muted">{lead.email}</p>
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
                      <p className="mt-1 max-w-[280px] text-[12px] leading-snug text-muted">
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
