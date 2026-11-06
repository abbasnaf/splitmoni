"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  calculateSplitAmounts,
  EXPENSE_CATEGORIES,
  formatMoney,
  type Expense,
  type ExpenseCategory,
  type Group,
  type SettlementRecord,
  type User,
} from "@/lib/split-engine";

type Props = {
  groups: Group[];
  expenses: Expense[];
  settlements: SettlementRecord[];
  users: User[];
  viewerId: string;
  compact?: boolean;
  limit?: number;
};

type HistoryEvent = {
  id: string;
  date: string;
  type: "expense" | "settlement";
  group: Group;
  expense?: Expense;
  settlement?: SettlementRecord;
};

const splitLabels = {
  equal: "Split equally",
  unequal: "Exact amounts",
  percentage: "By percentage",
  shares: "By shares",
} as const;

function monthName(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function dateLabel(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function ExpenseHistory({ groups, expenses, settlements, users, viewerId, compact = false, limit }: Props) {
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "expense" | "settlement">("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | ExpenseCategory>("all");

  const events = useMemo<HistoryEvent[]>(() => {
    const groupById = new Map(groups.map((group) => [group.id, group]));
    return [
      ...expenses.flatMap((expense) => {
        const group = groupById.get(expense.groupId);
        return group ? [{ id: `expense-${expense.id}`, date: expense.date, type: "expense" as const, group, expense }] : [];
      }),
      ...settlements.flatMap((settlement) => {
        const group = groupById.get(settlement.groupId);
        return group ? [{ id: `settlement-${settlement.id}`, date: settlement.date, type: "settlement" as const, group, settlement }] : [];
      }),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [expenses, groups, settlements]);

  const months = Array.from(new Set(events.map((event) => event.date.slice(0, 7)))).sort((a, b) => b.localeCompare(a));
  const filteredEvents = events.filter((event) => {
    if (groupFilter !== "all" && event.group.id !== groupFilter) return false;
    if (typeFilter !== "all" && event.type !== typeFilter) return false;
    if (monthFilter !== "all" && event.date.slice(0, 7) !== monthFilter) return false;
    if (categoryFilter !== "all" && (!event.expense || (event.expense.category ?? "other") !== categoryFilter)) return false;
    const groupName = event.group.name;
    const from = event.expense
      ? users.find((user) => user.id === event.expense?.paidBy)?.name ?? ""
      : users.find((user) => user.id === event.settlement?.from)?.name ?? "";
    const to = event.settlement ? users.find((user) => user.id === event.settlement?.to)?.name ?? "" : "";
    const searchable = `${groupName} ${from} ${to} ${event.expense?.title ?? "repayment"} ${event.expense?.description ?? ""} ${event.expense?.category ?? "other"} ${event.expense?.merchant ?? ""} ${event.expense?.location ?? ""}`.toLowerCase();
    return searchable.includes(query.trim().toLowerCase());
  });
  const visibleEvents = limit ? filteredEvents.slice(0, limit) : filteredEvents;
  const expenseCount = filteredEvents.filter((event) => event.type === "expense").length;
  const settlementCount = filteredEvents.filter((event) => event.type === "settlement").length;

  return (
    <section aria-label={compact ? "Recent activity" : "Expense and settlement history"}>
      {!compact ? (
        <div className="mb-5 space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Expense history</h2>
            <p className="mt-1 text-sm text-slate-400">Browse expenses and repayments across your groups.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_180px_180px]">
            <label className="sr-only" htmlFor="history-search">Search history</label>
            <input id="history-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expenses, people, groups…" className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-sw-green" />
            <label className="sr-only" htmlFor="history-group">Filter by group</label>
            <select id="history-group" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-sw-green">
              <option value="all">All groups</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
            <label className="sr-only" htmlFor="history-type">Filter by activity type</label>
            <select id="history-type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-sw-green">
              <option value="all">All activity</option>
              <option value="expense">Expenses only</option>
              <option value="settlement">Repayments only</option>
            </select>
            <label className="sr-only" htmlFor="history-month">Filter by month</label>
            <select id="history-month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-sw-green sm:col-span-2 lg:col-span-1">
              <option value="all">All dates</option>
              {months.map((month) => <option key={month} value={month}>{monthName(month)}</option>)}
            </select>
            <label className="sr-only" htmlFor="history-category">Filter by category</label>
            <select id="history-category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)} className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-sw-green">
              <option value="all">All categories</option>
              {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}
            </select>
          </div>
          <p aria-live="polite" className="text-xs text-slate-500">{expenseCount} {expenseCount === 1 ? "expense" : "expenses"} · {settlementCount} {settlementCount === 1 ? "repayment" : "repayments"}</p>
        </div>
      ) : null}

      {visibleEvents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-4 py-8 text-center">
          <p className="text-sm text-slate-400">{compact ? "No recent activity yet." : "No activity matches these filters."}</p>
          {!compact && (query || groupFilter !== "all" || typeFilter !== "all" || monthFilter !== "all" || categoryFilter !== "all") ? (
            <button type="button" onClick={() => { setQuery(""); setGroupFilter("all"); setTypeFilter("all"); setMonthFilter("all"); setCategoryFilter("all"); }} className="mt-2 text-sm font-semibold text-sw-green-light hover:underline">Clear filters</button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1">
          {visibleEvents.map((event, index) => {
            const month = event.date.slice(0, 7);
            const previousMonth = index > 0 ? visibleEvents[index - 1].date.slice(0, 7) : "";
            const monthHeader = month !== previousMonth;
            const expense = event.expense;
            const settlement = event.settlement;
            const payer = expense ? users.find((user) => user.id === expense.paidBy) : undefined;
            const share = expense ? calculateSplitAmounts(expense, event.group.members)[viewerId] ?? 0 : 0;
            const isPayer = expense?.paidBy === viewerId;
            const personLine = expense
              ? isPayer
                ? share < expense.amount ? `You lent ${formatMoney(expense.amount - share, event.group.currency)}` : "You paid"
                : share > 0 ? `You owe ${formatMoney(share, event.group.currency)}` : `${payer?.name ?? "Someone"} paid`
              : `${users.find((user) => user.id === settlement?.from)?.name ?? "Someone"} paid ${users.find((user) => user.id === settlement?.to)?.name ?? "someone"}`;

            return (
              <div key={event.id}>
                {monthHeader ? <p className="px-1 pb-2 pt-4 text-xs font-bold uppercase tracking-wider text-slate-500 first:pt-0">{monthName(month)}</p> : null}
                <article className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 sm:p-4">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${expense ? "bg-slate-800 text-slate-500" : "bg-sw-green/10 text-sw-green-light"}`} aria-hidden="true">
                    {expense ? "↗" : "✓"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{expense?.title ?? "Repayment"}</p>
                    <p className="mt-0.5 truncate text-sm text-slate-400">{event.group.name} · {personLine}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{dateLabel(event.date)}{expense ? ` · ${splitLabels[expense.splitType]} · ${expense.category ?? "other"}${expense.merchant ? ` · ${expense.merchant}` : ""}${expense.location ? ` · ${expense.location}` : ""}` : ""}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-white">{formatMoney(expense?.amount ?? settlement?.amount ?? 0, event.group.currency)}</p>
                    {settlement ? <p className={`mt-1 text-xs font-medium ${settlement.status === "confirmed" ? "text-sw-green-light" : "text-amber-700"}`}>{settlement.status === "confirmed" ? "Confirmed" : "Pending"}</p> : null}
                    {expense && !compact && !event.group.archivedAt ? <Link href={`/expenses/${expense.id}/edit`} className="mt-1 inline-block text-xs font-medium text-sw-green-light hover:underline">Edit expense</Link> : null}
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
