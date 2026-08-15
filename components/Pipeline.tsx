"use client";

import { Check, Database, Loader2, Sparkles, Send, Inbox } from "lucide-react";

export const PIPELINE_STEPS = [
  { key: "captured", label: "Captured", Icon: Inbox },
  { key: "enriched", label: "Enriched", Icon: Database },
  { key: "scored", label: "AI scored", Icon: Sparkles },
  { key: "synced", label: "Synced", Icon: Send },
] as const;

/**
 * `active` is the index of the step currently running.
 * -1 = idle, 0..3 = in flight, 4 = every step complete.
 */
export default function Pipeline({ active }: { active: number }) {
  return (
    <div className="rounded-xl border border-line bg-[#fbfbfe] p-3">
      <div className="flex items-center">
        {PIPELINE_STEPS.map((step, index) => {
          const done = active > index;
          const running = active === index;
          const idle = active < 0;
          const { Icon } = step;

          return (
            <div key={step.key} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={[
                    "flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300",
                    done
                      ? "border-good bg-good text-white"
                      : running
                        ? "animate-pulse-ring border-accent bg-accent text-white"
                        : "border-line bg-white text-muted",
                  ].join(" ")}
                >
                  {done ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : running ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
                  ) : (
                    <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
                  )}
                </div>
                <span
                  className={[
                    "whitespace-nowrap text-[11px] font-medium transition-colors",
                    done ? "text-good" : running ? "text-accent" : idle ? "text-muted" : "text-muted/70",
                  ].join(" ")}
                >
                  {step.label}
                </span>
              </div>

              {index < PIPELINE_STEPS.length - 1 && (
                <div className="mx-1.5 -mt-5 h-[2px] flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-good transition-all duration-500 ease-out"
                    style={{ width: done ? "100%" : "0%" }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
