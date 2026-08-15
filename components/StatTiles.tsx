"use client";

import { Flame, Gauge, RefreshCcw, Users } from "lucide-react";
import type { Lead } from "@/lib/types";

export default function StatTiles({ leads }: { leads: Lead[] }) {
  const total = leads.length;
  const hot = leads.filter((lead) => lead.temperature === "hot").length;
  const scored = leads.filter((lead) => typeof lead.score === "number");
  const average = scored.length
    ? Math.round(scored.reduce((sum, lead) => sum + (lead.score ?? 0), 0) / scored.length)
    : 0;
  const synced = leads.filter((lead) => lead.status === "synced").length;

  const tiles = [
    { label: "Total leads", value: total, Icon: Users, tint: "text-accent bg-accent-soft" },
    { label: "Hot 🔥", value: hot, Icon: Flame, tint: "text-hot bg-hot/10" },
    { label: "Avg AI score", value: average, Icon: Gauge, tint: "text-warm bg-warm/10" },
    { label: "Synced to CRM", value: synced, Icon: RefreshCcw, tint: "text-good bg-good/10" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(({ label, value, Icon, tint }) => (
        <div key={label} className="rounded-xl border border-line bg-[#fbfbfe] p-3.5">
          <div className="flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tint}`}>
              <Icon className="h-[15px] w-[15px]" strokeWidth={2.2} />
            </span>
            <span className="text-[12px] font-medium text-muted">{label}</span>
          </div>
          <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight text-ink tabular-nums">
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}
