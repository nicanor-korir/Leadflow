"use client";

import { useEffect, useRef, useState } from "react";
import { Cpu, Loader2, Mail, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import {
  OUTCOMES,
  OUTCOME_LABELS,
  budgetLabel,
  relativeTime,
  teamSizeLabel,
  timelineLabel,
  type Lead,
  type Outcome,
} from "@/lib/types";

const TEMPERATURE_STYLES: Record<string, string> = {
  hot: "bg-hot/10 text-hot",
  warm: "bg-warm/10 text-[#b45309]",
  cold: "bg-cold/10 text-cold",
};

const SCORE_BAR: Record<string, string> = { hot: "bg-hot", warm: "bg-warm", cold: "bg-cold" };

export default function LeadDrawer({
  lead,
  onClose,
  onUpdated,
}: {
  lead: Lead | null;
  onClose: () => void;
  onUpdated: (lead: Lead) => void;
}) {
  const [busy, setBusy] = useState<"rescore" | "outcome" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const open = lead !== null;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNote(null);
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Stop the page behind the panel scrolling while it's open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, lead?.id, onClose]);

  if (!lead) return null;

  const temperature = lead.temperature ?? "cold";
  const score = lead.score ?? 0;

  async function rescore() {
    if (!lead) return;
    setBusy("rescore");
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/rescore`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Re-score failed (${res.status})`);
      onUpdated(payload.lead as Lead);
      setNote(
        payload.source === "gemini"
          ? "Re-scored with Gemini."
          : "Gemini was unavailable — scored with the built-in rubric."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-score failed.");
    } finally {
      setBusy(null);
    }
  }

  async function setOutcome(next: Outcome | null) {
    if (!lead) return;
    setBusy("outcome");
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: next }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Update failed (${res.status})`);
      onUpdated(payload.lead as Lead);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-ink/25"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Lead details for ${lead.name}`}
        className="relative flex h-full w-full max-w-[440px] animate-fade-up flex-col overflow-y-auto border-l border-line bg-card shadow-lift"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-card px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-semibold text-ink">{lead.name}</h2>
            <a
              href={`mailto:${lead.email}`}
              className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline"
            >
              <Mail className="h-3.5 w-3.5" />
              {lead.email}
            </a>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close lead details"
            className="rounded-lg p-1.5 text-muted transition hover:bg-[#f1f2f7] hover:text-ink"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          <section className="rounded-xl border border-line bg-[#fbfbfe] p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">AI score</p>
                <p className="mt-1 text-[32px] font-semibold leading-none tabular-nums text-ink">
                  {score}
                  <span className="ml-1 text-[14px] font-medium text-muted">/100</span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`pill ${TEMPERATURE_STYLES[temperature]}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {temperature}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                  {lead.score_source === "gemini" ? (
                    <>
                      <Cpu className="h-3 w-3" /> scored by Gemini
                    </>
                  ) : lead.score_source === "rubric" ? (
                    <>
                      <SlidersHorizontal className="h-3 w-3" /> scored by rubric
                    </>
                  ) : (
                    "source unknown"
                  )}
                </span>
              </div>
            </div>

            <span className="mt-3 block h-1.5 w-full overflow-hidden rounded-full bg-line">
              <span
                className={`block h-full rounded-full ${SCORE_BAR[temperature]}`}
                style={{ width: `${score}%` }}
              />
            </span>

            {lead.ai_reason && (
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{lead.ai_reason}</p>
            )}

            <button
              type="button"
              onClick={rescore}
              disabled={busy !== null}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-[13px] font-semibold text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "rescore" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {busy === "rescore" ? "Re-scoring…" : "Re-score with AI"}
            </button>
          </section>

          <Detail label="Company" value={lead.company || "—"} />
          <Detail label="Team size" value={teamSizeLabel(lead.team_size)} />
          <Detail label="Monthly budget" value={budgetLabel(lead.budget)} />
          <Detail label="Timeline" value={timelineLabel(lead.timeline)} />
          <Detail
            label="Captured"
            value={`${relativeTime(lead.created_at)} · ${new Date(lead.created_at).toLocaleString()}`}
          />
          <Detail label="CRM status" value={lead.status ?? "captured"} />

          {lead.message && (
            <div>
              <p className="field-label">What they said</p>
              <p className="rounded-xl border border-line bg-[#fbfbfe] p-3 text-[13px] leading-relaxed text-ink">
                {lead.message}
              </p>
            </div>
          )}

          <div>
            <p className="field-label">Outcome</p>
            <p className="mb-2 text-[12px] leading-snug text-muted">
              Recording what actually happened is what makes the score measurable — without it
              nobody can tell whether a 90 really beats a 50.
            </p>
            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map((option) => {
                const active = lead.outcome === option;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setOutcome(active ? null : option)}
                    aria-pressed={active}
                    className={[
                      "rounded-xl border px-3 py-2 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? option === "won"
                          ? "border-good bg-good/10 text-good"
                          : option === "lost"
                            ? "border-hot bg-hot/10 text-hot"
                            : "border-line bg-[#f1f2f7] text-ink"
                        : "border-line bg-white text-muted hover:border-accent hover:text-accent",
                    ].join(" ")}
                  >
                    {OUTCOME_LABELS[option]}
                  </button>
                );
              })}
            </div>
            {lead.outcome && (
              <p className="mt-2 text-[11.5px] text-muted">Click again to clear.</p>
            )}
          </div>

          {note && (
            <p role="status" className="rounded-xl border border-good/25 bg-good/5 px-3 py-2.5 text-[12.5px] text-good">
              {note}
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-hot/25 bg-hot/5 px-3 py-2.5 text-[12.5px] text-hot">
              {error}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
      <span className="shrink-0 text-[12.5px] text-muted">{label}</span>
      <span className="text-right text-[13px] font-medium text-ink">{value}</span>
    </div>
  );
}
