"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { makeExpenseId, removeExpense, upsertExpense, useStoredExpenses } from "@/lib/expense-store";
import { useStoredGroups, useStoredUsers } from "@/lib/group-store";
import { ReceiptAttachments } from "@/components/receipt-attachments";
import { ExpenseComments } from "@/components/expense-comments";
import {
  calculateSplitAmounts,
  EXPENSE_CATEGORIES,
  formatMoney,
  type Expense,
  type Group,
  type SplitMethod,
  type User,
} from "@/lib/split-engine";
import { uploadExpenseAttachments } from "@/lib/receipt-store";

const splitMethods: Array<{ value: SplitMethod; label: string; hint: string }> = [
  { value: "equal", label: "Equally", hint: "Same amount for everyone" },
  { value: "unequal", label: "Exact amounts", hint: "Set each person's share" },
  { value: "percentage", label: "Percentage", hint: "Split by percent of total" },
  { value: "shares", label: "Shares", hint: "Weight the split by shares" },
];

const fieldClass =
  "w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-white outline-none transition focus:border-sw-green";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const subscribeToClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function useIsClient() {
  return useSyncExternalStore(
    subscribeToClient,
    getClientSnapshot,
    getServerSnapshot,
  );
}

function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function numberValue(value: string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMinor(value: string) {
  return Math.round(numberValue(value) * 100);
}

function toMajor(minorAmount: number) {
  return (minorAmount / 100).toFixed(2).replace(/\.00$/, "");
}

function unequalDefaults(totalMinor: number, memberIds: string[]) {
  if (memberIds.length === 0) {
    return {};
  }

  const perPerson = Math.floor(totalMinor / memberIds.length);
  const remainder = totalMinor - perPerson * memberIds.length;

  return Object.fromEntries(
    memberIds.map((memberId, index) => [
      memberId,
      toMajor(perPerson + (index < remainder ? 1 : 0)),
    ]),
  );
}

function percentageDefaults(memberIds: string[]) {
  if (memberIds.length === 0) {
    return {};
  }

  const base = Math.floor(100 / memberIds.length);
  const remainder = 100 - base * memberIds.length;

  return Object.fromEntries(
    memberIds.map((memberId, index) => [
      memberId,
      String(base + (index < remainder ? 1 : 0)),
    ]),
  );
}

function shareDefaults(memberIds: string[]) {
  return Object.fromEntries(memberIds.map((memberId) => [memberId, "1"]));
}

function initialUnequalValues(expense: Expense | null, group: Group) {
  if (expense) {
    return Object.fromEntries(
      group.members.map((memberId) => [
        memberId,
        toMajor(expense.splits[memberId] ?? 0),
      ]),
    );
  }

  return unequalDefaults(0, group.members);
}

function initialPercentageValues(expense: Expense | null, group: Group) {
  if (expense) {
    return Object.fromEntries(
      group.members.map((memberId) => [
        memberId,
        String(expense.splits[memberId] ?? 0),
      ]),
    );
  }

  return percentageDefaults(group.members);
}

function initialShareValues(expense: Expense | null, group: Group) {
  if (expense) {
    return Object.fromEntries(
      group.members.map((memberId) => [
        memberId,
        String(expense.splits[memberId] ?? 0),
      ]),
    );
  }

  return shareDefaults(group.members);
}

export function ExpenseComposer({
  groupId,
  expenseId,
  duplicateExpenseId,
}: {
  groupId?: string;
  expenseId?: string;
  duplicateExpenseId?: string;
}) {
  const groups = useStoredGroups();
  const users = useStoredUsers();
  const expenses = useStoredExpenses();
  const ready = useIsClient();

  if (!ready) {
    return <ExpenseComposerSkeleton />;
  }

  const expense = expenseId
    ? expenses.find((item) => item.id === expenseId) ?? null
    : null;
  const templateExpense = !expenseId && duplicateExpenseId
    ? expenses.find((item) => item.id === duplicateExpenseId) ?? null
    : null;

  if (expenseId && !expense) {
    return <ExpenseNotFound />;
  }
  if (duplicateExpenseId && !templateExpense) {
    return <ExpenseNotFound />;
  }

  const preferredGroupId = expense?.groupId ?? templateExpense?.groupId ?? groupId;
  const preferredGroup = groups.find((group) => group.id === preferredGroupId);
  if (preferredGroup?.archivedAt) {
    return <ArchivedGroupExpense groupName={preferredGroup.name} expenseId={expense?.id ?? null} />;
  }
  const activeGroups = groups.filter((group) => !group.archivedAt);
  const initialGroup =
    activeGroups.find((group) => group.id === preferredGroupId) ?? activeGroups[0] ?? null;

  if (!initialGroup) {
    return <NoGroups />;
  }

  return (
    <ExpenseForm
      key={expense?.id ?? templateExpense?.id ?? `new-${initialGroup.id}`}
      groups={activeGroups}
      users={users}
      initialGroup={initialGroup}
      expense={expense}
      templateExpense={templateExpense}
    />
  );
}

function ExpenseForm({
  groups,
  users,
  initialGroup,
  expense,
  templateExpense,
}: {
  groups: Group[];
  users: User[];
  initialGroup: Group;
  expense: Expense | null;
  templateExpense: Expense | null;
}) {
  const router = useRouter();
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroup.id);
  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? initialGroup;
  const memberIds = selectedGroup.members;

  const sourceExpense = expense ?? templateExpense;
  const [title, setTitle] = useState(sourceExpense?.title ?? "");
  const [description, setDescription] = useState(sourceExpense?.description ?? "");
  const [amount, setAmount] = useState(sourceExpense ? toMajor(sourceExpense.amount) : "");
  const [date, setDate] = useState(sourceExpense?.date ?? todayISO());
  const [paidBy, setPaidBy] = useState(
    sourceExpense && initialGroup.members.includes(sourceExpense.paidBy)
      ? sourceExpense.paidBy
      : initialGroup.members[0] ?? "",
  );
  const [category, setCategory] = useState(sourceExpense?.category ?? "other");
  const [merchant, setMerchant] = useState(sourceExpense?.merchant ?? "");
  const [location, setLocation] = useState(sourceExpense?.location ?? "");
  const [splitType, setSplitType] = useState<SplitMethod>(
    sourceExpense?.splitType ?? "equal",
  );
  const [unequalValues, setUnequalValues] = useState<Record<string, string>>(
    () => initialUnequalValues(sourceExpense, initialGroup),
  );
  const [percentageValues, setPercentageValues] = useState<
    Record<string, string>
  >(() => initialPercentageValues(sourceExpense, initialGroup));
  const [shareValues, setShareValues] = useState<Record<string, string>>(
    () => initialShareValues(sourceExpense, initialGroup),
  );
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [createdExpenseId, setCreatedExpenseId] = useState<string | null>(null);
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<"day" | "week" | "month">("month");
  const [recurrenceInterval, setRecurrenceInterval] = useState("1");
  const [recurringRuleId, setRecurringRuleId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amountMinor = toMinor(amount);
  const currency = selectedGroup.currency;

  const preview = useMemo(() => {
    if (memberIds.length === 0) {
      return {};
    }

    const splits =
      splitType === "unequal"
        ? Object.fromEntries(
            memberIds.map((memberId) => [
              memberId,
              toMinor(unequalValues[memberId] ?? "0"),
            ]),
          )
        : splitType === "percentage"
          ? Object.fromEntries(
              memberIds.map((memberId) => [
                memberId,
                numberValue(percentageValues[memberId]),
              ]),
            )
          : splitType === "shares"
            ? Object.fromEntries(
                memberIds.map((memberId) => [
                  memberId,
                  numberValue(shareValues[memberId]),
                ]),
              )
            : {};

    return calculateSplitAmounts(
      { amount: amountMinor, splitType, splits },
      memberIds,
    );
  }, [
    amountMinor,
    memberIds,
    percentageValues,
    shareValues,
    splitType,
    unequalValues,
  ]);

  const assignedMinor = Object.values(preview).reduce(
    (total, value) => total + value,
    0,
  );
  const remainingMinor = amountMinor - assignedMinor;
  const percentageTotal = memberIds.reduce(
    (total, memberId) => total + numberValue(percentageValues[memberId]),
    0,
  );
  const shareTotal = memberIds.reduce(
    (total, memberId) => total + numberValue(shareValues[memberId]),
    0,
  );
  const payer = users.find((user) => user.id === paidBy);

  function handleGroupChange(nextGroupId: string) {
    const nextGroup =
      groups.find((group) => group.id === nextGroupId) ?? initialGroup;

    setSelectedGroupId(nextGroup.id);
    setPaidBy(nextGroup.members[0] ?? "");
    setUnequalValues(unequalDefaults(amountMinor, nextGroup.members));
    setPercentageValues(percentageDefaults(nextGroup.members));
    setShareValues(shareDefaults(nextGroup.members));
    setError("");
  }

  function handleSplitTypeChange(nextSplitType: SplitMethod) {
    setSplitType(nextSplitType);
    setError("");

    if (
      nextSplitType === "unequal" &&
      Object.values(unequalValues).every((value) => numberValue(value) === 0) &&
      amountMinor > 0
    ) {
      setUnequalValues(unequalDefaults(amountMinor, memberIds));
    }

    if (
      nextSplitType === "percentage" &&
      Object.values(percentageValues).every(
        (value) => numberValue(value) === 0,
      )
    ) {
      setPercentageValues(percentageDefaults(memberIds));
    }

    if (
      nextSplitType === "shares" &&
      Object.values(shareValues).every((value) => numberValue(value) === 0)
    ) {
      setShareValues(shareDefaults(memberIds));
    }
  }

  function handleResetSplit() {
    if (splitType === "unequal") {
      setUnequalValues(unequalDefaults(amountMinor, memberIds));
    } else if (splitType === "percentage") {
      setPercentageValues(percentageDefaults(memberIds));
    } else if (splitType === "shares") {
      setShareValues(shareDefaults(memberIds));
    }

    setError("");
  }

  function validate() {
    if (!title.trim()) {
      return "Give this expense a name.";
    }

    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      return "Enter an amount greater than zero.";
    }

    if (!date) {
      return "Choose a date for this expense.";
    }

    if (memberIds.length === 0) {
      return "Add at least one member to this group first.";
    }

    if (!memberIds.includes(paidBy)) {
      return "Choose a group member who paid.";
    }

    if (splitType === "unequal") {
      const values = memberIds.map((memberId) =>
        toMinor(unequalValues[memberId] ?? "0"),
      );

      if (values.some((value) => value < 0)) {
        return "Split amounts cannot be negative.";
      }

      const total = values.reduce((sum, value) => sum + value, 0);
      if (total !== amountMinor) {
        return `The split adds up to ${formatMoney(total, currency)}, but the expense is ${formatMoney(amountMinor, currency)}.`;
      }
    }

    if (splitType === "percentage") {
      const values = memberIds.map((memberId) =>
        numberValue(percentageValues[memberId]),
      );

      if (values.some((value) => value < 0)) {
        return "Percentages cannot be negative.";
      }

      const total = values.reduce((sum, value) => sum + value, 0);
      if (Math.abs(total - 100) > 0.01) {
        return `Percentages add up to ${total}%. They need to total 100%.`;
      }
    }

    if (splitType === "shares") {
      const values = memberIds.map((memberId) =>
        numberValue(shareValues[memberId]),
      );

      if (values.some((value) => value < 0)) {
        return "Shares cannot be negative.";
      }

      if (values.reduce((sum, value) => sum + value, 0) <= 0) {
        return "Add at least one share.";
      }
    }

    return null;
  }

  function splitsForSave() {
    if (splitType === "unequal") {
      return Object.fromEntries(
        memberIds.map((memberId) => [
          memberId,
          toMinor(unequalValues[memberId] ?? "0"),
        ]),
      );
    }

    if (splitType === "percentage") {
      return Object.fromEntries(
        memberIds.map((memberId) => [
          memberId,
          numberValue(percentageValues[memberId]),
        ]),
      );
    }

    if (splitType === "shares") {
      return Object.fromEntries(
        memberIds.map((memberId) => [
          memberId,
          numberValue(shareValues[memberId]),
        ]),
      );
    }

    return {};
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }

    const expenseKey = expense?.id ?? createdExpenseId ?? makeExpenseId(title);
    const nextExpense: Expense = {
      id: expenseKey,
      groupId: selectedGroup.id,
      title: title.trim(),
      description: description.trim(),
      amount: amountMinor,
      paidBy,
      date,
      splitType,
      splits: splitsForSave(),
      category,
      merchant: merchant.trim(),
      location: location.trim(),
    };

    setSaving(true);
    try {
      await upsertExpense(nextExpense);
      setCreatedExpenseId(expenseKey);
      if (receiptFiles.length) {
        await uploadExpenseAttachments(expenseKey, receiptFiles);
        setReceiptFiles([]);
      }
      if (recurringEnabled) {
        const ruleId = recurringRuleId ?? makeExpenseId("recurring");
        setRecurringRuleId(ruleId);
        const response = await fetch(`/api/groups/${encodeURIComponent(selectedGroup.id)}/recurring-expenses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: ruleId,
            expenseId: expenseKey,
            frequency: recurrenceFrequency,
            interval: Number(recurrenceInterval),
          }),
        });
        if (!response.ok) {
          const result = await response.json() as { error?: string };
          throw new Error(result.error ?? "Could not create recurring schedule.");
        }
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save expense.");
      setSaving(false);
      return;
    }
    router.push(`/groups/${selectedGroup.id}`);
    setSaving(false);
  }

  async function handleDelete() {
    if (!expense) {
      return;
    }

    await removeExpense(expense.id);
    router.push(`/groups/${expense.groupId}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl shadow-slate-950/30 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-sw-green-light">
            {expense ? "Manage expense" : templateExpense ? "Duplicate expense" : "New expense"}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white">
            {expense ? "Edit expense" : templateExpense ? "Review expense copy" : "Add expense"}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-400">
            {expense
              ? "Update the details below. Balances and settlements recalculate automatically."
              : templateExpense
                ? "Review the copied details and save to add a separate expense. Receipts and history are not copied."
                : "Log a shared cost and choose how it should be divided."}
          </p>
        </div>

        <span className="rounded-full border border-sw-green/40 bg-sw-green/10 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-sw-green-light">
          {selectedGroup.name} · {selectedGroup.currency}
        </span>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-white">Details</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
            <span>Expense name</span>
            <input
              value={title}
              onChange={(event) => {
                setError("");
                setTitle(event.target.value);
              }}
              maxLength={80}
              aria-label="Expense name"
              className={fieldClass}
              placeholder="Dinner, hotel, fuel…"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-300">
            <span>Amount</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                {currency}
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setError("");
                  setAmount(event.target.value);
                }}
                className={`${fieldClass} pl-14`}
                placeholder="0.00"
                aria-label="Amount"
              />
            </div>
          </label>

          <label className="space-y-2 text-sm text-slate-300">
            <span>Date</span>
            <input
              type="date"
              value={date}
              onChange={(event) => {
                setError("");
                setDate(event.target.value);
              }}
              className={fieldClass}
              aria-label="Date"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-300">
            <span>Group</span>
            <select
              value={selectedGroup.id}
              onChange={(event) => handleGroupChange(event.target.value)}
              disabled={Boolean(expense)}
              className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-60`}
              aria-label="Group"
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.currency})
                </option>
              ))}
            </select>
            {expense ? (
              <span className="block text-xs text-slate-500">
                Group is fixed while editing an expense.
              </span>
            ) : null}
          </label>

          <label className="space-y-2 text-sm text-slate-300">
            <span>Paid by</span>
            <select
              value={paidBy}
              onChange={(event) => {
                setError("");
                setPaidBy(event.target.value);
              }}
              className={fieldClass}
              aria-label="Paid by"
            >
              {memberIds.map((memberId) => {
                const member = users.find((user) => user.id === memberId);
                return (
                  <option key={memberId} value={memberId}>
                    {member?.name ?? memberId}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => {
                setError("");
                setDescription(event.target.value);
              }}
              maxLength={240}
              rows={2}
              className={fieldClass}
              placeholder="Optional note about this expense"
              aria-label="Description"
            />
          </label>

          <label className="space-y-2 text-sm text-slate-300">
            <span>Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className={fieldClass} aria-label="Category">
              {EXPENSE_CATEGORIES.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
            </select>
          </label>

          <label className="space-y-2 text-sm text-slate-300">
            <span>Merchant (optional)</span>
            <input value={merchant} onChange={(event) => setMerchant(event.target.value)} maxLength={100} className={fieldClass} placeholder="Cafe, store, or service" aria-label="Merchant" />
          </label>

          <label className="space-y-2 text-sm text-slate-300">
            <span>Location (optional)</span>
            <input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={120} className={fieldClass} placeholder="Neighborhood or city" aria-label="Location" />
          </label>

          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={recurringEnabled} onChange={(event) => setRecurringEnabled(event.target.checked)} className="accent-sw-green" />
              Repeat this expense
            </label>
            {recurringEnabled ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs text-slate-400">
                  <span>Frequency</span>
                  <select value={recurrenceFrequency} onChange={(event) => setRecurrenceFrequency(event.target.value as typeof recurrenceFrequency)} className={fieldClass} aria-label="Recurrence frequency">
                    <option value="day">Daily</option>
                    <option value="week">Weekly</option>
                    <option value="month">Monthly</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-xs text-slate-400">
                  <span>Every (1–12)</span>
                  <input type="number" min={1} max={12} step={1} value={recurrenceInterval} onChange={(event) => setRecurrenceInterval(event.target.value)} className={fieldClass} aria-label="Repeat interval" />
                </label>
              </div>
            ) : null}
            <p className="text-xs text-slate-500">The first scheduled occurrence follows this expense date. Due runs are created once when the group is opened; missed dates are skipped.</p>
          </div>
        </div>
      </section>

      <ReceiptAttachments
        expenseId={expense?.id ?? createdExpenseId}
        files={receiptFiles}
        onFilesChange={setReceiptFiles}
        disabled={saving}
      />
      {expense?.id ?? createdExpenseId ? <ExpenseComments expenseId={expense?.id ?? createdExpenseId!} /> : null}

      <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Split</h2>
            <p className="mt-1 text-sm text-slate-400">
              Choose how much each member owes.
            </p>
          </div>

          {splitType !== "equal" ? (
            <button
              type="button"
              onClick={handleResetSplit}
              className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-sw-green/70 hover:text-sw-green-light"
            >
              Reset to even split
            </button>
          ) : null}
        </div>

        <div role="group" aria-label="Choose a split method" className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {splitMethods.map((method) => (
            <button
              key={method.value}
              type="button"
              aria-pressed={splitType === method.value}
              onClick={() => handleSplitTypeChange(method.value)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left transition",
                splitType === method.value
                  ? "border-sw-green bg-sw-green/10"
                  : "border-slate-700 bg-slate-950/50 hover:border-slate-500",
              )}
            >
              <span
                className={cn(
                  "text-sm font-semibold",
                  splitType === method.value ? "text-sw-green-light" : "text-white",
                )}
              >
                {method.label}
              </span>
              <span className="mt-1 block text-xs text-slate-400">
                {method.hint}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {memberIds.map((memberId) => {
            const member = users.find((user) => user.id === memberId);
            const memberName = member?.name ?? memberId;

            return (
              <div
                key={memberId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sw-green/15 text-sm font-semibold text-sw-green-light">
                    {memberName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{memberName}</p>
                    <p className="truncate text-xs text-slate-500">
                      {memberId === paidBy
                        ? "Paid this expense"
                        : member?.email ?? "Group member"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {splitType === "equal" ? (
                    <span className="w-24 text-right font-semibold text-sw-green-light">
                      {formatMoney(preview[memberId] ?? 0, currency)}
                    </span>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step={splitType === "shares" ? "0.5" : "0.01"}
                          inputMode="decimal"
                          value={
                            splitType === "unequal"
                              ? unequalValues[memberId] ?? "0"
                              : splitType === "percentage"
                                ? percentageValues[memberId] ?? "0"
                                : shareValues[memberId] ?? "0"
                          }
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setError("");

                            if (splitType === "unequal") {
                              setUnequalValues((current) => ({
                                ...current,
                                [memberId]: nextValue,
                              }));
                            } else if (splitType === "percentage") {
                              setPercentageValues((current) => ({
                                ...current,
                                [memberId]: nextValue,
                              }));
                            } else {
                              setShareValues((current) => ({
                                ...current,
                                [memberId]: nextValue,
                              }));
                            }
                          }}
                          aria-label={`${memberName} ${splitType === "unequal" ? "amount" : splitType === "percentage" ? "percentage" : "shares"}`}
                          className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-right text-white outline-none transition focus:border-sw-green"
                        />
                        <span className="w-12 text-xs text-slate-500">
                          {splitType === "unequal"
                            ? currency
                            : splitType === "percentage"
                              ? "%"
                              : "shares"}
                        </span>
                      </div>
                      <span className="w-24 text-right text-sm font-semibold text-sw-green-light">
                        {formatMoney(preview[memberId] ?? 0, currency)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Expense total
            </p>
            <p className="mt-1 text-lg font-semibold text-white">
              {formatMoney(amountMinor, currency)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Assigned
            </p>
            <p
              className={cn(
                "mt-1 text-lg font-semibold",
                splitType === "unequal" && remainingMinor !== 0
                  ? "text-sw-orange"
                  : "text-sw-green-light",
              )}
            >
              {formatMoney(assignedMinor, currency)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Paid by
            </p>
            <p className="mt-1 text-lg font-semibold text-white">
              {payer?.name ?? "Choose a member"}
            </p>
          </div>
        </div>

        {splitType === "unequal" && remainingMinor !== 0 && amountMinor > 0 ? (
          <p
            className={cn(
              "mt-3 text-sm",
              remainingMinor > 0 ? "text-sw-orange" : "text-rose-300",
            )}
          >
            {remainingMinor > 0
              ? `${formatMoney(remainingMinor, currency)} left to assign.`
              : `${formatMoney(Math.abs(remainingMinor), currency)} over the expense total.`}
          </p>
        ) : null}

        {splitType === "percentage" && amountMinor > 0 ? (
          <div className={cn("mt-3 text-sm", Math.abs(percentageTotal - 100) > 0.01 ? "text-sw-orange" : "text-slate-400")}>
            <p>Percentages total {Number(percentageTotal.toFixed(2))}%.</p>
            {Math.abs(remainingMinor) > 0 ? (
              <p className="mt-1">
                {remainingMinor > 0
                  ? `${formatMoney(remainingMinor, currency)} is not assigned yet.`
                  : `${formatMoney(Math.abs(remainingMinor), currency)} is over the expense total.`}
              </p>
            ) : null}
          </div>
        ) : null}

        {splitType === "shares" && amountMinor > 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            {Number(shareTotal.toFixed(2))}{" "}
            {shareTotal === 1 ? "share" : "shares"} assigned.
          </p>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-sw-green px-5 py-2.5 font-semibold text-white transition hover:bg-sw-green-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : expense ? "Save changes" : "Add expense"}
        </button>
        <Link
          href={`/groups/${selectedGroup.id}`}
          className="rounded-full border border-slate-700 bg-slate-950/50 px-5 py-2.5 font-medium text-slate-200 transition hover:border-slate-500"
        >
          Cancel
        </Link>
      </div>

      {expense ? (
        <section className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-white">Danger zone</h2>
          <p className="mt-1 text-sm text-slate-400">
            Deleting this expense updates every balance and settlement.
          </p>

          {confirmingDelete ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400"
              >
                Yes, delete expense
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="mt-3 rounded-full border border-rose-500/40 px-4 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/10"
            >
              Delete expense
            </button>
          )}
        </section>
      ) : null}
    </form>
  );
}

export function ExpenseComposerSkeleton() {
  return (
    <div className="animate-pulse space-y-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
      <div className="h-3 w-24 rounded-full bg-slate-800" />
      <div className="h-9 w-56 rounded-xl bg-slate-800" />
      <div className="grid gap-4 pt-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-16 rounded-xl bg-slate-800/70"
          />
        ))}
      </div>
      <p className="text-sm text-slate-500">Loading expense details…</p>
    </div>
  );
}

function ExpenseNotFound() {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
      <p className="text-xs uppercase tracking-[0.28em] text-sw-green-light">
        Expense
      </p>
      <h1 className="mt-2 text-2xl font-bold text-white">Expense not found</h1>
      <p className="mt-2 text-sm text-slate-400">
        It may have been deleted. Head back to activity to see the current
        ledger.
      </p>
      <Link
        href="/activity"
        className="mt-5 inline-flex rounded-full bg-sw-green px-4 py-2 text-sm font-medium text-white transition hover:bg-sw-green-dark"
      >
        Back to activity
      </Link>
    </div>
  );
}

function ArchivedGroupExpense({ groupName, expenseId }: { groupName: string; expenseId: string | null }) {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
        <p className="text-xs uppercase tracking-[0.28em] text-sw-green-light">Read-only group</p>
        <h1 className="mt-2 text-2xl font-bold text-white">{groupName} is archived</h1>
        <p className="mt-2 text-sm text-slate-400">Archived groups keep their history but do not allow expense changes.</p>
        <Link href="/groups" className="mt-5 inline-flex rounded-full bg-sw-green px-4 py-2 text-sm font-medium text-white transition hover:bg-sw-green-dark">
          Back to groups
        </Link>
      </div>
      {expenseId ? (
        <>
          <ReceiptAttachments expenseId={expenseId} files={[]} onFilesChange={() => {}} disabled />
          <ExpenseComments expenseId={expenseId} readOnly />
        </>
      ) : null}
    </div>
  );
}

function NoGroups() {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
      <p className="text-xs uppercase tracking-[0.28em] text-sw-green-light">
        Expense
      </p>
      <h1 className="mt-2 text-2xl font-bold text-white">
        Create a group first
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        Expenses belong to a shared group, so add one before logging a cost.
      </p>
      <Link
        href="/groups/new"
        className="mt-5 inline-flex rounded-full bg-sw-green px-4 py-2 text-sm font-medium text-white transition hover:bg-sw-green-dark"
      >
        Create a group
      </Link>
    </div>
  );
}
