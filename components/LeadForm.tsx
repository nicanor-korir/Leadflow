"use client";

import { useState } from "react";
import { AlertCircle, Zap } from "lucide-react";
import Pipeline from "./Pipeline";
import { BUDGETS, TEAM_SIZES, TIMELINES, type Lead } from "@/lib/types";

const EMPTY = {
  name: "",
  email: "",
  company: "",
  team_size: 10,
  budget: 2000,
  timeline: 1,
  message: "",
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function LeadForm({ onCreated }: { onCreated: (lead: Lead) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setStep(0);

    // The request runs while the pipeline strip animates, so the animation
    // never makes the demo feel slower than the API actually is.
    const request = fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    try {
      await wait(420);
      setStep(1);
      await wait(420);

      const [response] = await Promise.all([request, wait(320)]);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);

      setStep(2);
      await wait(520);
      setStep(3);
      await wait(420);
      setStep(4);

      onCreated(payload.lead as Lead);
      setForm(EMPTY);

      await wait(1100);
      setStep(-1);
    } catch (submitError) {
      // Swallow the unhandled rejection if the fetch itself is what failed.
      request.catch(() => {});
      setError(submitError instanceof Error ? submitError.message : "Something went wrong.");
      setStep(-1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5 sm:p-6">
      <header className="mb-4">
        <h2 className="text-[15px] font-semibold text-ink">New lead</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          Submit the form and watch it get qualified end to end.
        </p>
      </header>

      <Pipeline active={step} />

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label className="field-label" htmlFor="name">
            Full name
          </label>
          <input
            id="name"
            className="field"
            required
            maxLength={120}
            placeholder="Priya Raman"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="email">
            Work email
          </label>
          <input
            id="email"
            type="email"
            className="field"
            required
            maxLength={200}
            placeholder="priya@company.com"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </div>

        <div>
          <label className="field-label" htmlFor="company">
            Company
          </label>
          <input
            id="company"
            className="field"
            maxLength={160}
            placeholder="Northwind Logistics"
            value={form.company}
            onChange={(e) => update("company", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="team_size">
              Team size
            </label>
            <select
              id="team_size"
              className="field"
              value={form.team_size}
              onChange={(e) => update("team_size", Number(e.target.value))}
            >
              {TEAM_SIZES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="budget">
              Monthly budget
            </label>
            <select
              id="budget"
              className="field"
              value={form.budget}
              onChange={(e) => update("budget", Number(e.target.value))}
            >
              {BUDGETS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="timeline">
            Timeline
          </label>
          <select
            id="timeline"
            className="field"
            value={form.timeline}
            onChange={(e) => update("timeline", Number(e.target.value))}
          >
            {TIMELINES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="message">
            What are you trying to fix?
          </label>
          <textarea
            id="message"
            className="field resize-none"
            rows={3}
            maxLength={2000}
            placeholder="We copy and paste leads into our CRM by hand — it's slow and we lose hot ones."
            value={form.message}
            onChange={(e) => update("message", e.target.value)}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-hot/25 bg-hot/5 px-3 py-2.5 text-[13px] text-hot"
          >
            <AlertCircle className="mt-px h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={busy}>
          <Zap className="h-4 w-4" fill="currentColor" strokeWidth={0} />
          {busy ? "Qualifying…" : "Submit & qualify"}
        </button>
      </form>
    </section>
  );
}
