"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import LeadDrawer from "./LeadDrawer";
import LeadForm from "./LeadForm";
import LeadTable from "./LeadTable";
import StatTiles from "./StatTiles";
import type { Lead } from "@/lib/types";

export default function Dashboard({
  initialLeads,
  initialError,
}: {
  initialLeads: Lead[];
  initialError: string | null;
}) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [highlightId, setHighlightId] = useState<number | undefined>();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the id rather than the object so the drawer re-renders from the
  // list whenever a lead is updated elsewhere.
  const selected = leads.find((lead) => lead.id === selectedId) ?? null;

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Both handlers must keep a stable identity: the drawer resets its transient
  // status message whenever they change, so inline closures would wipe the
  // "Re-scored with Gemini" note the moment the lead list updated.
  const closeDrawer = useCallback(() => setSelectedId(null), []);

  const applyUpdate = useCallback((updated: Lead) => {
    setLeads((previous) => previous.map((lead) => (lead.id === updated.id ? updated : lead)));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/leads", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setLeads(payload.leads ?? []);
    } catch {
      // A failed background refresh shouldn't disturb the demo — the optimistic
      // row from the POST response is already on screen.
    }
  }, []);

  const handleCreated = useCallback(
    (lead: Lead) => {
      // Show the new row immediately, then reconcile with the server ordering.
      setLeads((previous) => [lead, ...previous.filter((item) => item.id !== lead.id)]);
      setHighlightId(lead.id);

      setToast(`✅ ${lead.name} scored ${lead.score}/100 — ${lead.temperature} synced`);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 4200);

      void refresh();
    },
    [refresh]
  );

  return (
    <>
      {initialError && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-warm/30 bg-warm/5 px-4 py-3 text-[13px] text-[#92400e]">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Could not reach the database.</p>
            <p className="mt-0.5">{initialError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <LeadForm onCreated={handleCreated} />

        <section className="card p-5 sm:p-6">
          <header className="mb-4 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Sales dashboard</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                Every lead, scored and ranked. Highest intent first.
              </p>
            </div>
            <span className="hidden text-[12px] text-muted sm:block">Live from Neon</span>
          </header>

          <StatTiles leads={leads} />
          <div className="mt-5">
            <LeadTable
              leads={leads}
              highlightId={highlightId}
              onSelect={(lead) => setSelectedId(lead.id)}
            />
          </div>
        </section>
      </div>

      <LeadDrawer lead={selected} onClose={closeDrawer} onUpdated={applyUpdate} />

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 animate-toast-in
                     rounded-xl border border-line bg-white px-4 py-3 text-[13.5px] font-medium text-ink shadow-lift"
        >
          {toast}
        </div>
      )}
    </>
  );
}
