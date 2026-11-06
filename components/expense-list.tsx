"use client";

import Link from "next/link";
import { useState } from "react";
import { removeExpense } from "@/lib/expense-store";
import { calculateSplitAmounts, formatMoney, type Expense, type SplitMethod, type User } from "@/lib/split-engine";

const splitLabels: Record<SplitMethod, string> = {
  equal: "Split equally",
  unequal: "Exact amounts",
  percentage: "By percentage",
  shares: "By shares",
};

const monthLabelFormat = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
});

function monthLabel(date: string) {
  const [year, month] = date.split("-").map(Number);
  if (!year || !month) return date;
  return monthLabelFormat.format(new Date(year, month - 1, 1));
}

function MemberAvatar({ name }: { name: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-slate-300">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ExpenseList({
  expenses,
  users,
  currency,
  detailed = false,
  viewerId,
  memberIds,
  readOnly = false,
  emptyMessage = "No expenses yet.",
}: {
  expenses: Expense[];
  users: User[];
  currency: string;
  detailed?: boolean;
  viewerId?: string;
  memberIds?: string[];
  readOnly?: boolean;
  emptyMessage?: string;
}) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const viewer = viewerId ?? users[0]?.id;

  if (expenses.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {expenses.map((expense, index) => {
        const payer = users.find((user) => user.id === expense.paidBy);
        const payerName = payer?.name ?? "Someone";
        const viewerShare = viewer
          ? calculateSplitAmounts(expense, memberIds ?? Object.keys(expense.splits))[viewer] ?? 0
          : 0;
        const viewerPaid = viewer === expense.paidBy;
        const viewerLent = expense.amount - viewerShare;

        const month = monthLabel(expense.date);
        const previousMonth = index > 0 ? monthLabel(expenses[index - 1].date) : "";
        const monthHeader =
          detailed && month !== previousMonth ? (
            <p
              className={
                "px-1 pb-1 pt-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-500 first:pt-0"
              }
            >
              {month}
            </p>
          ) : null;

        let viewerLine = (
          <p className="text-xs font-medium text-slate-500">Not your expense</p>
        );
        if (viewerPaid && viewerLent > 0) {
          viewerLine = (
            <p className="text-xs font-semibold text-sw-green-light">
              You lent {formatMoney(viewerLent, currency)}
            </p>
          );
        } else if (viewerPaid) {
          viewerLine = (
            <p className="text-xs font-semibold text-sw-green-light">
              You paid {formatMoney(expense.amount, currency)}
            </p>
          );
        } else if (viewerShare > 0) {
          viewerLine = (
            <p className="text-xs font-semibold text-sw-orange">
              You owe {formatMoney(viewerShare, currency)}
            </p>
          );
        }

        return (
          <div key={expense.id}>
            {monthHeader}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition hover:border-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <MemberAvatar name={payerName} />
                  <div className="min-w-0">
                    <Link
                      href={`/expenses/${expense.id}/edit`}
                      className="block truncate font-semibold text-white transition hover:text-sw-green-light"
                      aria-label={readOnly ? `View ${expense.title} and receipts` : `Edit ${expense.title}`}
                    >
                      {expense.title}
                    </Link>
                    {detailed && expense.description ? (
                      <p className="mt-1 text-sm text-slate-400">
                        {expense.description}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm text-slate-400">
                      {payerName} paid · {expense.date}
                    </p>
                    <p className="mt-1 text-xs capitalize text-slate-500">
                      {expense.category ?? "other"}{expense.merchant ? ` · ${expense.merchant}` : ""}{expense.location ? ` · ${expense.location}` : ""}
                    </p>
                    {detailed ? (
                      <span className="mt-2 inline-block rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
                        {splitLabels[expense.splitType]}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-white">
                    {formatMoney(expense.amount, currency)}
                  </p>
                  {viewerLine}
                </div>
              </div>

              {!readOnly ? <div className="mt-2 flex items-center justify-end gap-1.5 text-xs">
                {pendingDelete === expense.id ? (
                  <>
                    <span className="mr-1 text-slate-400">
                      Delete this expense?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void removeExpense(expense.id);
                        setPendingDelete(null);
                      }}
                      className="rounded-full bg-rose-500 px-3 py-1.5 font-medium text-white transition hover:bg-rose-400"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(null)}
                      className="rounded-full border border-slate-700 px-3 py-1.5 font-medium text-slate-200 transition hover:border-slate-500"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href={`/expenses/${expense.id}/edit`}
                      className="rounded-full px-2.5 py-1.5 font-medium text-slate-400 transition hover:bg-slate-800 hover:text-sw-green-light"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/expenses/new?duplicateId=${encodeURIComponent(expense.id)}`}
                      className="rounded-full px-2.5 py-1.5 font-medium text-slate-400 transition hover:bg-slate-800 hover:text-sw-green-light"
                    >
                      Duplicate
                    </Link>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(expense.id)}
                      className="rounded-full px-2.5 py-1.5 font-medium text-slate-400 transition hover:bg-slate-800 hover:text-rose-300"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
