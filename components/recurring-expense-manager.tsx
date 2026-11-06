"use client";

import { useCallback, useEffect, useState } from "react";

type RecurringExpense = {
  id: string;
  title: string;
  frequency: "day" | "week" | "month";
  interval: number;
  nextRun: string;
  pausedAt: string | null;
};

function recurrenceLabel(rule: RecurringExpense) {
  const unit = rule.frequency === "day" ? "day" : rule.frequency === "week" ? "week" : "month";
  return `Every ${rule.interval === 1 ? "" : `${rule.interval} `}${unit}${rule.interval === 1 ? "" : "s"}`;
}

export function RecurringExpenseManager({ groupId, readOnly = false }: { groupId: string; readOnly?: boolean }) {
  const [rules, setRules] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/recurring-expenses`, { cache: "no-store" });
    const result = await response.json() as { recurringExpenses?: RecurringExpense[]; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Could not load recurring expenses.");
    setRules(result.recurringExpenses ?? []);
  }, [groupId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/groups/${encodeURIComponent(groupId)}/recurring-expenses`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { recurringExpenses?: RecurringExpense[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load recurring expenses.");
        if (active) setRules(result.recurringExpenses ?? []);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load recurring expenses.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [groupId]);

  async function toggle(rule: RecurringExpense) {
    setBusyId(rule.id);
    setError("");
    try {
      const response = await fetch(`/api/recurring-expenses/${encodeURIComponent(rule.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !rule.pausedAt }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not update recurring expense.");
      await refresh();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update recurring expense.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 sm:p-5" aria-labelledby={`recurring-heading-${groupId}`}>
      <h2 id={`recurring-heading-${groupId}`} className="text-lg font-semibold text-white">Recurring expenses</h2>
      <p className="mt-1 text-sm text-slate-400">Due expenses are created once when this group is opened. Missed dates are skipped rather than backfilled.</p>
      {loading ? <p className="mt-3 text-sm text-slate-500">Loading schedules…</p> : null}
      {!loading && rules.length === 0 ? <p className="mt-3 text-sm text-slate-500">No recurring schedules yet.</p> : null}
      <ul className="mt-3 space-y-2">
        {rules.map((rule) => (
          <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <div>
              <p className="text-sm font-medium text-slate-200">{rule.title}</p>
              <p className="mt-1 text-xs text-slate-500">{recurrenceLabel(rule)} · next run {rule.nextRun}{rule.pausedAt ? " · paused" : ""}</p>
            </div>
            {!readOnly ? <button type="button" disabled={busyId === rule.id} onClick={() => void toggle(rule)} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-sw-green hover:text-sw-green-light disabled:opacity-50">{busyId === rule.id ? "Saving…" : rule.pausedAt ? "Resume" : "Pause"}</button> : null}
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}
