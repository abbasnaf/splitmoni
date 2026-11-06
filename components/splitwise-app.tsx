"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ExpenseList } from "@/components/expense-list";
import { AuditHistory } from "@/components/audit-history";
import { ExpenseHistory } from "@/components/expense-history";
import { RecurringExpenseManager } from "@/components/recurring-expense-manager";
import { GroupManagement } from "@/components/group-management";
import { AccountSettings } from "@/components/account-settings";
import { ThemeToggle } from "@/components/theme-provider";
import { sortExpensesByDate, useStoredExpenses } from "@/lib/expense-store";
import {
  useGroupInvites,
  useStoredGroups,
  useStoredUsers,
} from "@/lib/group-store";
import { activeGroup } from "@/lib/mock-data";
import { confirmStoredSettlement, makeSettlementId, recordStoredSettlement, useStoredSettlements } from "@/lib/settlement-store";
import {
  calculateGroupBalances,
  calculateSplitAmounts,
  formatMoney,
  getNetBalanceForUser,
  getUserById,
  simplifyDebts,
  type User,
} from "@/lib/split-engine";

export type AppView =
  | "dashboard"
  | "groups"
  | "group-detail"
  | "balances"
  | "activity"
  | "settings";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const navItems = [
  { label: "Overview", href: "/dashboard", view: "dashboard", icon: "home" },
  { label: "Expenses", href: "/activity", view: "activity", icon: "receipt" },
  { label: "Balances", href: "/balances", view: "balances", icon: "balance" },
] as const;

type NavIconName = "home" | "receipt" | "balance" | "group" | "plus" | "settings" | "chevron";

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, string> = {
    home: "M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6",
    receipt: "M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8zM9 8h6M9 12h6M9 16h3",
    balance: "M12 3v18M5 6h14M7 6l-4 7h8zM17 6l-4 7h8zM7 21h10",
    group: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    plus: "M12 5v14M5 12h14",
    settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-1.7 2.94-.08-.02a1.7 1.7 0 0 0-1.8.72l-.04.08h-3.4l-.04-.08a1.7 1.7 0 0 0-1.8-.72l-.08.02-1.7-2.94.06-.06A1.7 1.7 0 0 0 9.6 15l-.08-.04v-3.4l.08-.04A1.7 1.7 0 0 0 9.26 9.7L9.2 9.64l1.7-2.94.08.02a1.7 1.7 0 0 0 1.8-.72l.04-.08h3.4l.04.08a1.7 1.7 0 0 0 1.8.72l.08-.02 1.7 2.94-.06.06A1.7 1.7 0 0 0 19.4 12l.08.04v3.4z",
    chevron: "m7 10 5 5 5-5",
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0"><path d={paths[name]} /></svg>;
}

function getMoneyTone(value: number) {
  if (value > 0) return "text-sw-green-light";
  if (value < 0) return "text-sw-orange";
  return "text-slate-300";
}

function getReadableBalanceLabel(balance: number, currency: string) {
  if (balance > 0) return `You are owed ${formatMoney(balance, currency)}`;
  if (balance < 0) return `You owe ${formatMoney(Math.abs(balance), currency)}`;
  return "Settled";
}

export function SplitwiseApp({
  view,
  groupId = activeGroup.id,
}: {
  view: AppView;
  groupId?: string;
}) {
  const router = useRouter();
  const groups = useStoredGroups();
  const users = useStoredUsers();
  const expenses = useStoredExpenses();
  const settlements = useStoredSettlements();
  const selectedGroup = groups.find((group) => group.id === groupId) ?? groups[0] ?? activeGroup;
  const invitesByGroup = useGroupInvites();
  const [settlementMessage, setSettlementMessage] = useState("");
  const [settlingId, setSettlingId] = useState("");
  const [settlementTo, setSettlementTo] = useState("");
  const [settlementAmount, setSettlementAmount] = useState("");
  const currentInvites = invitesByGroup[selectedGroup.id] ?? [];
  const groupExpenses = sortExpensesByDate(
    expenses.filter((expense) => expense.groupId === selectedGroup.id),
  );
  const groupSettlements = settlements.filter((settlement) => settlement.groupId === selectedGroup.id);
  const balances = calculateGroupBalances(selectedGroup, groupExpenses, groupSettlements);
  const balancesWithPending = calculateGroupBalances(
    selectedGroup,
    groupExpenses,
    groupSettlements.map((settlement) => settlement.status === "pending" ? { ...settlement, status: "confirmed" as const } : settlement),
  );
  const settlementSuggestions = simplifyDebts(balances);
  const currentUserId = typeof window === "undefined"
    ? users[0]?.id
    : (JSON.parse(window.localStorage.getItem("splitmoni.current-user") ?? "null") as { id?: string } | null)?.id;
  const currentUser = users.find((user) => user.id === currentUserId) ?? users[0];
  const currentUserBalance = currentUser
    ? getNetBalanceForUser(balances, currentUser.id)
    : 0;
  const currentUserAvailableDebt = Math.max(-getNetBalanceForUser(balancesWithPending, currentUser.id), 0);
  const currentUserCreditors = balancesWithPending
    .filter((balance) => balance.amount > 0 && balance.userId !== currentUser.id)
    .map((balance) => ({ userId: balance.userId, amount: balance.amount, user: getUserById(users, balance.userId) }))
    .filter((item): item is { userId: string; amount: number; user: User } => Boolean(item.user));
  const selectedCreditorId = currentUserCreditors.some((item) => item.userId === settlementTo)
    ? settlementTo
    : currentUserCreditors[0]?.userId ?? "";
  const selectedCreditor = currentUserCreditors.find((item) => item.userId === selectedCreditorId);
  const maximumSettlement = Math.min(currentUserAvailableDebt, selectedCreditor?.amount ?? 0);

  const [currentMonth, setCurrentMonth] = useState("");
  useEffect(() => {
    // Derived from the clock client-side after hydration so prerendered output stays stable.
    const timer = setTimeout(() => {
      const now = new Date();
      setCurrentMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const overviewByCurrency = new Map<string, { youOwe: number; owedToYou: number; net: number; yourShare: number }>();
  for (const group of groups) {
    const totals = overviewByCurrency.get(group.currency) ?? { youOwe: 0, owedToYou: 0, net: 0, yourShare: 0 };
    const groupExpensesForOverview = expenses.filter((expense) => expense.groupId === group.id);
    const groupBalance = calculateGroupBalances(
      group,
      groupExpensesForOverview,
      settlements.filter((settlement) => settlement.groupId === group.id),
    );
    const net = getNetBalanceForUser(groupBalance, currentUser.id);
    totals.net += net;
    totals.youOwe += Math.max(-net, 0);
    totals.owedToYou += Math.max(net, 0);
    groupExpensesForOverview.forEach((expense) => {
      if (expense.date.slice(0, 7) !== currentMonth) return;
      totals.yourShare += calculateSplitAmounts(expense, group.members)[currentUser.id] ?? 0;
    });
    overviewByCurrency.set(group.currency, totals);
  }
  if (overviewByCurrency.size === 0) {
    overviewByCurrency.set(currentUser.defaultCurrency, { youOwe: 0, owedToYou: 0, net: 0, yourShare: 0 });
  }
  const overviewCards = [
    { label: "You owe", key: "youOwe", tone: "text-sw-orange" },
    { label: "Owed to you", key: "owedToYou", tone: "text-sw-green-light" },
    { label: "Net balance", key: "net", tone: "" },
    { label: "Your share this month", key: "yourShare", tone: "text-white" },
  ] as const;

  const handleRecordSettlement = async (from: string, to: string, amount: number) => {
    const id = makeSettlementId(selectedGroup.id, from, to);
    setSettlingId(id);
    try {
      await recordStoredSettlement({ id, groupId: selectedGroup.id, from, to, amount });
      setSettlementMessage("Repayment recorded. The recipient must confirm it before balances change.");
      return true;
    } catch (error) {
      setSettlementMessage(error instanceof Error ? error.message : "Could not record repayment.");
      return false;
    } finally {
      setSettlingId("");
    }
  };

  const handleSettlementFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(settlementAmount);
    const amountMinor = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amountMinor <= 0) {
      setSettlementMessage("Enter a repayment amount greater than zero.");
      return;
    }
    if (!selectedCreditorId) {
      setSettlementMessage("There is no outstanding amount to pay this member.");
      return;
    }
    const saved = await handleRecordSettlement(currentUser.id, selectedCreditorId, amountMinor);
    if (saved) setSettlementAmount("");
  };

  const handleConfirmSettlement = async (id: string) => {
    setSettlingId(id);
    try {
      await confirmStoredSettlement(id);
      setSettlementMessage("Repayment confirmed. Balances are settled.");
    } catch (error) {
      setSettlementMessage(error instanceof Error ? error.message : "Could not confirm repayment.");
    } finally {
      setSettlingId("");
    }
  };

  const pendingConfirmations = groupSettlements.filter(
    (settlement) => settlement.status === "pending" && settlement.to === currentUser.id,
  );

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    window.localStorage.removeItem("splitmoni.current-user");
    router.replace("/");
  };

  const renderGroupList = () => (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => {
        const groupBalance = calculateGroupBalances(
          group,
          expenses.filter((expense) => expense.groupId === group.id),
          settlements.filter((settlement) => settlement.groupId === group.id),
        );
        const userBalance = getNetBalanceForUser(groupBalance, currentUser.id);

        return (
          <Link
            key={group.id}
            href={`/groups/${group.id}`}
            className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-slate-950/30 transition hover:border-sw-green/60"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{group.name}</h3>
              <span className="rounded-full border border-sw-green/40 bg-sw-green/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-sw-green-light">
                {group.members.length} members
              </span>
            </div>
            <p className="mb-4 text-sm text-slate-400">Shared ledger · {group.currency}</p>
            <div className="flex justify-between text-sm text-slate-300">
              <span>My balance</span>
              <span className={getMoneyTone(userBalance)}>{getReadableBalanceLabel(userBalance, group.currency)}</span>
            </div>
          </Link>
        );
      })}
      <Link
        href="/groups/new"
        className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-sw-green/60 bg-sw-green/5 p-5 text-center text-sw-green-light transition hover:border-sw-green hover:bg-sw-green/20 hover:bg-sw-green/10"
      >
        + Create new group
      </Link>
    </div>
  );

  const renderDashboard = () => (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-sw-green-light">Your shared expenses</p>
        <h1 className="dashboard-title mt-1 text-3xl font-bold text-white">Welcome back, {currentUser.name}</h1>
        <p className="mt-2 text-sm text-slate-400">A clear view of balances, recent activity, and your share across every group.</p>
      </div>

      <div className="mobile-summary-grid grid grid-cols-2 gap-3 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-400">{card.label}</p>
            <div className="mt-3 space-y-1.5">
              {Array.from(overviewByCurrency.entries()).map(([currency, totals]) => {
                const amount = totals[card.key];
                const prefix = card.key === "net" && amount > 0 ? "+" : card.key === "net" && amount < 0 ? "−" : "";
                const tone = card.key === "net" ? getMoneyTone(amount) : card.tone;
                return <p key={currency} className={cn("text-xl font-bold", tone)}>{prefix}{formatMoney(Math.abs(amount), currency)}</p>;
              })}
            </div>
            {overviewByCurrency.size > 1 ? <p className="mt-2 text-xs text-slate-500">Totals are shown separately by currency.</p> : null}
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">Recent activity</h2>
            <div className="flex items-center gap-3 text-sm">
              {!selectedGroup.archivedAt ? (
                <Link
                  href={`/expenses/new?groupId=${selectedGroup.id}`}
                  className="text-sw-green-light hover:text-white"
                >
                  Add expense
                </Link>
              ) : null}
              <Link href="/activity" className="text-sw-green-light hover:text-white">
                View all
              </Link>
            </div>
          </div>
          <ExpenseHistory
            groups={groups}
            expenses={expenses}
            settlements={settlements}
            users={users}
            viewerId={currentUser.id}
            compact
            limit={6}
          />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Groups</h2>
            <Link href="/groups/new" className="text-sm text-sw-green-light hover:text-white">
              New group
            </Link>
          </div>
          <div className="space-y-3">
            {groups.map((group) => {
              const groupBalance = calculateGroupBalances(group, expenses.filter((expense) => expense.groupId === group.id), settlements.filter((settlement) => settlement.groupId === group.id));
              const balance = getNetBalanceForUser(groupBalance, currentUser.id);
              return (
                <Link key={group.id} href={`/groups/${group.id}`} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3 transition hover:border-sw-green/50">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{group.name}</p>
                    <p className="text-xs text-slate-400">{group.members.length} members · {group.currency}</p>
                  </div>
                  <span className={cn("ml-3 shrink-0 text-right text-sm font-medium", getMoneyTone(balance))}>{getReadableBalanceLabel(balance, group.currency)}</span>
                </Link>
              );
            })}
            {groups.length === 0 ? <p className="text-sm text-slate-500">Create a group to start tracking shared expenses.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );

  const renderBalances = () => (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Balances</h2>
          {!selectedGroup.archivedAt ? (
            <Link href={`/expenses/new?groupId=${selectedGroup.id}`} className="rounded-full bg-sw-green px-4 py-2 text-sm font-medium text-white">
              Add expense
            </Link>
          ) : null}
        </div>
        <div className="space-y-3">
          {balances.map((balance) => {
            const user = getUserById(users, balance.userId);
            if (!user) return null;

            return (
              <div key={balance.userId} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <div>
                  <p className="font-medium text-white">{user.name}</p>
                  <p className="text-xs text-slate-400">{user.email}</p>
                </div>
                <span className={cn("font-semibold", getMoneyTone(balance.amount))}>
                  {balance.amount > 0 ? `+${formatMoney(balance.amount, selectedGroup.currency)}` : formatMoney(balance.amount, selectedGroup.currency)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <h2 className="text-xl font-semibold text-white">Record a repayment</h2>
        <p className="mt-1 text-sm text-slate-400">Record an off-app payment. The recipient confirms it before the group balance changes.</p>
        {selectedGroup.archivedAt ? (
          <p className="mt-4 rounded-xl bg-slate-950/50 p-3 text-sm text-slate-500">This archived group is read-only.</p>
        ) : currentUserAvailableDebt > 0 && currentUserCreditors.length > 0 ? (
          <form onSubmit={handleSettlementFormSubmit} className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="block space-y-2 text-sm text-slate-500">
              <span>Paid to</span>
              <select value={selectedCreditorId} onChange={(event) => setSettlementTo(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-white outline-none focus:border-sw-green">
                {currentUserCreditors.map((creditor) => <option key={creditor.userId} value={creditor.userId}>{creditor.user.name} · owed {formatMoney(creditor.amount, selectedGroup.currency)}</option>)}
              </select>
            </label>
            <label className="block space-y-2 text-sm text-slate-500">
              <span>Amount ({selectedGroup.currency})</span>
              <input type="number" min="0.01" max={(maximumSettlement / 100).toFixed(2)} step="0.01" inputMode="decimal" value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)} placeholder="0.00" className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-white outline-none focus:border-sw-green" />
              <span className="block text-xs text-slate-400">Up to {formatMoney(maximumSettlement, selectedGroup.currency)} available</span>
            </label>
            <button type="submit" disabled={Boolean(settlingId) || !settlementAmount} className="rounded-full bg-sw-green px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sw-green-dark disabled:cursor-not-allowed disabled:opacity-50">
              {settlingId ? "Saving…" : "Record payment"}
            </button>
          </form>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-950/50 p-3 text-sm text-slate-500">You have no unrecorded amount to pay in this group.</p>
        )}
        {settlementMessage ? <p aria-live="polite" className="mt-3 text-sm text-slate-500">{settlementMessage}</p> : null}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Simplified repayment plan</h2>
            <p className="mt-1 text-sm text-slate-400">Matches the largest amounts owed and due to reduce back-and-forth.</p>
          </div>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-500">{settlementSuggestions.length} {settlementSuggestions.length === 1 ? "payment" : "payments"}</span>
        </div>
        <div className="space-y-3">
          {settlementSuggestions.length === 0 ? (
            <p className="text-sm text-slate-400">Everyone is settled.</p>
          ) : (
            settlementSuggestions.map((settlement, index) => (
              <div key={`${settlement.from}-${settlement.to}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <div>
                  <p className="font-medium text-white">
                    {getUserById(users, settlement.from)?.name} → {getUserById(users, settlement.to)?.name}
                  </p>
                  <p className="text-xs text-slate-400">Suggested transfer</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sw-green-light">{formatMoney(settlement.amount, selectedGroup.currency)}</span>
                  <button
                    type="button"
                    disabled={Boolean(selectedGroup.archivedAt) || Boolean(settlingId) || settlement.from !== currentUser.id || groupSettlements.some((item) => item.from === settlement.from && item.to === settlement.to && item.status === "pending" && item.amount >= settlement.amount)}
                    onClick={() => void handleRecordSettlement(settlement.from, settlement.to, settlement.amount)}
                    className="rounded-full border border-sw-green/40 px-3 py-1.5 text-xs font-semibold text-sw-green-light transition hover:bg-sw-green hover:text-white disabled:opacity-50"
                  >
                    {settlingId ? "Saving…" : groupSettlements.some((item) => item.from === settlement.from && item.to === settlement.to && item.status === "pending" && item.amount >= settlement.amount) ? "Awaiting confirmation" : settlement.from === currentUser.id ? "I paid" : "Payer records this"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <p className="mt-2 text-xs text-slate-400">A repayment remains pending until its recipient confirms it.</p>
        {pendingConfirmations.length ? (
          <div className="mt-5 border-t border-slate-800 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Confirm repayments</h3>
            <div className="space-y-2">
              {pendingConfirmations.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 p-3 text-sm">
                  <span>{getUserById(users, item.from)?.name} says they paid you {formatMoney(item.amount, selectedGroup.currency)}</span>
                  <button type="button" disabled={Boolean(selectedGroup.archivedAt) || Boolean(settlingId)} onClick={() => void handleConfirmSettlement(item.id)} className="rounded-full bg-sw-green px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Confirm</button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Settlement history</h2>
            <p className="mt-1 text-sm text-slate-400">Recorded repayments for {selectedGroup.name}.</p>
          </div>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-500">{groupSettlements.length}</span>
        </div>
        {groupSettlements.length === 0 ? (
          <p className="rounded-xl bg-slate-950/50 p-4 text-sm text-slate-500">No repayments recorded yet.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {groupSettlements.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-white">{getUserById(users, item.from)?.name} paid {getUserById(users, item.to)?.name}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(item.date))}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-white">{formatMoney(item.amount, selectedGroup.currency)}</span>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", item.status === "confirmed" ? "bg-sw-green/10 text-sw-green-light" : "bg-amber-100 text-amber-800")}>
                    {item.status === "confirmed" ? "Confirmed" : "Awaiting confirmation"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderActivity = () => (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
      <ExpenseHistory
        groups={groups}
        expenses={expenses}
        settlements={settlements}
        users={users}
        viewerId={currentUser.id}
      />
    </div>
  );

  const renderSettings = () => <AccountSettings currentUser={currentUser} />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="app-header sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="app-topbar mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="app-brand flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sw-green text-lg font-black text-slate-950">₹</span>
            <span className="text-xl font-bold tracking-tight text-white">
              Split<span className="text-sw-green-light">Moni</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {!selectedGroup.archivedAt ? (
              <Link
                href={`/expenses/new?groupId=${selectedGroup.id}`}
                className="desktop-add-action inline-flex items-center gap-2 rounded-full bg-sw-green px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sw-green/20 transition hover:bg-sw-green-dark"
              >
                <NavIcon name="plus" />
                Add expense
              </Link>
            ) : null}
            <ThemeToggle />
            <details className="profile-menu relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full p-1 pr-2 transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sw-green">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sw-green/15 text-sm font-bold text-sw-green-light">
                  {currentUser.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-32 truncate text-sm font-medium text-white sm:block">{currentUser.name}</span>
                <NavIcon name="chevron" />
              </summary>
              <div className="profile-menu-panel absolute right-0 top-12 z-30 w-56 rounded-xl border border-slate-800 bg-white p-2 shadow-xl">
                <div className="border-b border-slate-800 px-3 py-2">
                  <p className="truncate text-sm font-semibold text-white">{currentUser.name}</p>
                  <p className="truncate text-xs text-slate-500">{currentUser.email}</p>
                </div>
                <Link href="/settings" className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
                  <NavIcon name="settings" /> Account settings
                </Link>
                <button type="button" onClick={() => void handleLogout()} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800">Sign out</button>
              </div>
            </details>
          </div>
        </div>

      </header>

      <div className="app-layout app-content mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="app-columns grid gap-6 lg:grid-cols-[256px_minmax(0,1fr)]">
          <aside className="workspace-sidebar self-start rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <nav aria-label="Main navigation" className="space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={view === item.view ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                    view === item.view
                      ? "bg-sw-green/10 text-sw-green-light shadow-sm"
                      : "text-slate-500 hover:bg-slate-800 hover:text-slate-200",
                  )}
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-7 border-t border-slate-800 pt-5">
              <div className="mb-2 flex items-center justify-between px-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your groups</p>
                <Link href="/groups/new" aria-label="Create a group" title="Create a group" className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-sw-green-light"><NavIcon name="plus" /></Link>
              </div>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {groups.map((group) => {
                  const groupBalances = calculateGroupBalances(group, expenses.filter((expense) => expense.groupId === group.id), settlements.filter((settlement) => settlement.groupId === group.id));
                  const groupUserBalance = getNetBalanceForUser(groupBalances, currentUser.id);
                  const active = view === "group-detail" && selectedGroup.id === group.id;
                  return (
                    <Link key={group.id} href={`/groups/${group.id}`} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 transition", active ? "bg-slate-800" : "hover:bg-slate-800")}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-sm font-semibold text-amber-800">{group.name.slice(0, 1).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">{group.name}</span>
                        <span className={cn("block truncate text-xs", getMoneyTone(groupUserBalance))}>{getReadableBalanceLabel(groupUserBalance, group.currency)}</span>
                      </span>
                    </Link>
                  );
                })}
                {groups.length === 0 ? <p className="px-3 py-2 text-sm text-slate-500">No groups yet</p> : null}
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-slate-950/60 p-3">
              <p className="text-xs text-slate-500">Current group balance</p>
              <p className={cn("mt-1 text-sm font-semibold", getMoneyTone(currentUserBalance))}>{getReadableBalanceLabel(currentUserBalance, selectedGroup.currency)}</p>
              <Link href="/balances" className="mt-2 inline-block text-xs font-semibold text-sw-green-light hover:underline">View all balances</Link>
            </div>
          </aside>

          <main className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
            {view === "dashboard" && renderDashboard()}
            {view === "groups" && renderGroupList()}
            {view === "group-detail" && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-bold text-white">{selectedGroup.name}</h2>
                      {selectedGroup.archivedAt ? <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">Archived · read-only</span> : null}
                    </div>
                    {!selectedGroup.archivedAt ? (
                      <Link
                        href={`/expenses/new?groupId=${selectedGroup.id}`}
                        className="rounded-full bg-sw-green px-4 py-2 text-sm font-medium text-white"
                      >
                        Add expense
                      </Link>
                    ) : null}
                  </div>
                  <p className="text-slate-400">Track shared costs, balances, and settlements for this group.</p>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                    <h3 className="mb-4 text-xl font-semibold text-white">Members</h3>
                    <div className="space-y-3">
                      {selectedGroup.members.map((memberId) => {
                        const member = getUserById(users, memberId);
                        const memberBalance = getNetBalanceForUser(balances, memberId);
                        if (!member) return null;
                        return (
                          <div key={member.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                            <div>
                              <p className="font-medium text-white">{member.name}</p>
                              <p className="text-xs text-slate-400">{member.email}{member.id === selectedGroup.createdBy ? " · Owner" : ""}</p>
                            </div>
                            <span className={cn("font-semibold", getMoneyTone(memberBalance))}>
                              {memberBalance > 0 ? `+${formatMoney(memberBalance, selectedGroup.currency)}` : formatMoney(memberBalance, selectedGroup.currency)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <GroupManagement
                  key={selectedGroup.id}
                  group={selectedGroup}
                  users={users}
                  invites={currentInvites}
                  isOwner={selectedGroup.createdBy === currentUser.id}
                  hasLedger={selectedGroup.hasLedgerActivity ?? (groupExpenses.length > 0 || groupSettlements.length > 0)}
                />

                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-white">Expenses</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {groupExpenses.length}{" "}
                        {groupExpenses.length === 1 ? "expense" : "expenses"} logged
                      </p>
                    </div>
                    {!selectedGroup.archivedAt ? (
                      <Link
                        href={`/expenses/new?groupId=${selectedGroup.id}`}
                        className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-sw-green/70 hover:text-sw-green-light"
                      >
                        Add expense
                      </Link>
                    ) : null}
                  </div>
                  <ExpenseList
                    expenses={groupExpenses}
                    users={users}
                    currency={selectedGroup.currency}
                    viewerId={currentUser.id}
                    memberIds={selectedGroup.members}
                    readOnly={Boolean(selectedGroup.archivedAt)}
                    emptyMessage={selectedGroup.archivedAt ? "No expenses have been recorded for this group." : "No expenses yet. Add the first cost for this group."}
                  />
                </div>
                <AuditHistory key={selectedGroup.id} groupId={selectedGroup.id} />
                <RecurringExpenseManager groupId={selectedGroup.id} readOnly={Boolean(selectedGroup.archivedAt)} />

                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-white">Simplified repayment plan</h3>
                      <p className="mt-1 text-sm text-slate-400">Fewer payments to settle the group.</p>
                    </div>
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-500">{settlementSuggestions.length} {settlementSuggestions.length === 1 ? "payment" : "payments"}</span>
                  </div>
                  <div className="space-y-3">
                    {settlementSuggestions.length === 0 ? (
                      <p className="text-sm text-slate-400">Settled.</p>
                    ) : (
                      settlementSuggestions.map((settlement, index) => (
                        <div key={`${settlement.from}-${settlement.to}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
                          <span>{getUserById(users, settlement.from)?.name} owes {getUserById(users, settlement.to)?.name} {formatMoney(settlement.amount, selectedGroup.currency)}</span>
                          <button
                            type="button"
                            disabled={Boolean(selectedGroup.archivedAt) || Boolean(settlingId) || settlement.from !== currentUser.id || groupSettlements.some((item) => item.from === settlement.from && item.to === settlement.to && item.status === "pending" && item.amount >= settlement.amount)}
                            onClick={() => void handleRecordSettlement(settlement.from, settlement.to, settlement.amount)}
                            className="rounded-full border border-sw-green/40 px-3 py-1.5 text-xs font-semibold text-sw-green-light transition hover:bg-sw-green hover:text-white disabled:opacity-50"
                          >
                            {settlingId ? "Saving…" : groupSettlements.some((item) => item.from === settlement.from && item.to === settlement.to && item.status === "pending" && item.amount >= settlement.amount) ? "Awaiting confirmation" : settlement.from === currentUser.id ? "I paid" : "Payer records this"}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  {settlementMessage ? <p aria-live="polite" className="mt-3 text-sm text-slate-500">{settlementMessage}</p> : null}
                  {pendingConfirmations.map((item) => (
                    <div key={item.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 p-3 text-sm">
                      <span>{getUserById(users, item.from)?.name} says they paid you {formatMoney(item.amount, selectedGroup.currency)}</span>
                      <button type="button" disabled={Boolean(selectedGroup.archivedAt) || Boolean(settlingId)} onClick={() => void handleConfirmSettlement(item.id)} className="rounded-full bg-sw-green px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Confirm repayment</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {view === "balances" && renderBalances()}
            {view === "activity" && renderActivity()}
            {view === "settings" && renderSettings()}
          </main>
        </div>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <Link href="/dashboard" aria-current={view === "dashboard" ? "page" : undefined} className={cn("mobile-nav-link", view === "dashboard" && "mobile-nav-active")}>
          <NavIcon name="home" /><span>Home</span>
        </Link>
        <Link href="/activity" aria-current={view === "activity" ? "page" : undefined} className={cn("mobile-nav-link", view === "activity" && "mobile-nav-active")}>
          <NavIcon name="receipt" /><span>Expenses</span>
        </Link>
        {!selectedGroup.archivedAt ? (
          <Link href={`/expenses/new?groupId=${selectedGroup.id}`} className="mobile-nav-link mobile-add-link">
            <span className="mobile-add-icon"><NavIcon name="plus" /></span><span>Add</span>
          </Link>
        ) : null}
        <Link href="/balances" aria-current={view === "balances" ? "page" : undefined} className={cn("mobile-nav-link", view === "balances" && "mobile-nav-active")}>
          <NavIcon name="balance" /><span>Balances</span>
        </Link>
        <Link href="/groups" aria-current={view === "groups" || view === "group-detail" ? "page" : undefined} className={cn("mobile-nav-link", (view === "groups" || view === "group-detail") && "mobile-nav-active")}>
          <NavIcon name="group" /><span>Groups</span>
        </Link>
      </nav>
    </div>
  );
}

export function GroupDetailPage({ groupId = activeGroup.id }: { groupId?: string }) {
  return <SplitwiseApp view="group-detail" groupId={groupId} />;
}
