"use client";

import { useEffect, useState } from "react";

type AuditEvent = {
  id: string;
  subjectType: string;
  subjectId: string;
  action: string;
  actorName: string | null;
  summary: string;
  createdAt: string;
};

const actionLabels: Record<string, string> = {
  expense_created: "Expense added",
  expense_updated: "Expense edited",
  expense_deleted: "Expense deleted",
  settlement_recorded: "Repayment recorded",
  settlement_confirmed: "Repayment confirmed",
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function AuditHistory({ groupId }: { groupId: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Parent remounts this component per group (key), so state starts fresh.
    fetch(`/api/groups/${groupId}/audit`, { headers: { "Cache-Control": "no-store" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load audit history.");
        const data = (await response.json()) as { events: AuditEvent[] };
        if (!cancelled) {
          setEvents(data.events);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load audit history.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
      <h3 className="text-xl font-semibold text-white">Audit history</h3>
      <p className="mt-1 text-sm text-slate-400">Who changed expenses and repayments, and when.</p>
      <div className="mt-4">
        {loading ? (
          <p aria-live="polite" className="text-sm text-slate-400">Loading audit history…</p>
        ) : error ? (
          <p aria-live="polite" className="text-sm text-slate-400">{error}</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-500">No changes recorded yet.</p>
        ) : (
          <ol className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm">
                <span className="text-slate-200">
                  <span className="font-semibold text-white">{event.actorName ?? "Deleted account"}</span>{" "}
                  {event.summary}
                </span>
                <span className="text-xs text-slate-500">
                  {actionLabels[event.action] ?? event.action} · {formatTimestamp(event.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
