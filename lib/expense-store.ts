import { useSyncExternalStore } from "react";
import { expenses as seedExpenses } from "@/lib/mock-data";
import type { Expense } from "@/lib/split-engine";

export const EXPENSES_STORAGE_KEY = "splitmoni.expenses";
const EMPTY_EXPENSES: Expense[] = [];

export function readStoredExpenses(): Expense[] {
  if (typeof window === "undefined") {
    return seedExpenses;
  }

  const item = window.localStorage.getItem(EXPENSES_STORAGE_KEY);
  if (!item) {
    window.localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(seedExpenses));
    return seedExpenses;
  }

  try {
    const parsed = JSON.parse(item) as unknown;
    return Array.isArray(parsed) ? (parsed as Expense[]) : seedExpenses;
  } catch {
    window.localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(seedExpenses));
    return seedExpenses;
  }
}

export function writeStoredExpenses(expenses: Expense[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(expenses));
  expensesSnapshot = expenses;
  emitExpenseChange();
}

export async function upsertExpense(expense: Expense) {
  const response = await fetch("/api/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(expense),
  });
  if (!response.ok) {
    const result = await response.json() as { error?: string };
    throw new Error(result.error ?? "Could not save expense.");
  }
  const expenses = readStoredExpenses();
  const exists = expenses.some((item) => item.id === expense.id);

  const nextExpenses = exists
    ? expenses.map((item) => (item.id === expense.id ? expense : item))
    : [...expenses, expense];

  writeStoredExpenses(nextExpenses);
  return nextExpenses;
}

export async function removeExpense(expenseId: string) {
  const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Could not delete expense.");
  const nextExpenses = readStoredExpenses().filter(
    (expense) => expense.id !== expenseId,
  );

  writeStoredExpenses(nextExpenses);
  return nextExpenses;
}

export function getExpenseById(expenseId: string) {
  return readStoredExpenses().find((expense) => expense.id === expenseId) ?? null;
}

export function makeExpenseId(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "expense";
  return `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function sortExpensesByDate(expenses: Expense[]) {
  return expenses
    .map((expense, index) => ({ expense, index }))
    .sort((left, right) => {
      const dateOrder = right.expense.date.localeCompare(left.expense.date);
      return dateOrder !== 0 ? dateOrder : right.index - left.index;
    })
    .map(({ expense }) => expense);
}

// This variable must exist before it's used in writeStoredExpenses()
let expensesSnapshot: Expense[] | null = null;

const expenseListeners = new Set<() => void>();

function emitExpenseChange() {
  expenseListeners.forEach((listener) => listener());
}

export function subscribeToExpenses(listener: () => void) {
  expenseListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      expenseListeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== EXPENSES_STORAGE_KEY) {
      return;
    }

    expensesSnapshot = null;
    listener();
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    expenseListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function getExpensesSnapshot(snapshotId?: string) {
  if (typeof window === "undefined") {
    return EMPTY_EXPENSES;
  }

  let currentSnapshot: Expense[];
  if (expensesSnapshot !== null) {
    currentSnapshot = expensesSnapshot;
  } else {
    const stored = window.localStorage.getItem(EXPENSES_STORAGE_KEY);
    try {
      currentSnapshot = stored ? JSON.parse(stored) : seedExpenses;
    } catch {
      currentSnapshot = seedExpenses;
    }
    expensesSnapshot = currentSnapshot;
  }

  return currentSnapshot;
}

export function getServerExpensesSnapshot() {
  return EMPTY_EXPENSES;
}

export function useStoredExpenses(snapshotId?: string) {
  return useSyncExternalStore(
    subscribeToExpenses,
    getExpensesSnapshot,
    getServerExpensesSnapshot,
  );
}
