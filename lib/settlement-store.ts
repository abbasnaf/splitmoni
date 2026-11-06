import { useSyncExternalStore } from "react";
import type { SettlementRecord } from "@/lib/split-engine";

export const SETTLEMENTS_STORAGE_KEY = "splitmoni.settlements";
const KEY = SETTLEMENTS_STORAGE_KEY;
const EMPTY_SETTLEMENTS: SettlementRecord[] = [];
const listeners = new Set<() => void>();
let snapshot: SettlementRecord[] | null = null;

export function readStoredSettlements() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as SettlementRecord[];
  } catch {
    return [];
  }
}

export function writeStoredSettlements(value: SettlementRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(value));
  snapshot = value;
  listeners.forEach((listener) => listener());
}

export function makeSettlementId(groupId: string, from: string, to: string) {
  return `repayment-${groupId}-${from}-${to}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function subscribeToSettlements(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      snapshot = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSettlementsSnapshot() {
  if (snapshot === null) snapshot = readStoredSettlements();
  return snapshot;
}

export function useStoredSettlements() {
  return useSyncExternalStore(subscribeToSettlements, getSettlementsSnapshot, () => EMPTY_SETTLEMENTS);
}

export async function recordStoredSettlement(input: Omit<SettlementRecord, "status" | "date">) {
  const response = await fetch("/api/settlements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const result = await response.json() as { error?: string };
    throw new Error(result.error ?? "Could not record settlement.");
  }
  const settlement: SettlementRecord = { ...input, status: "pending", date: new Date().toISOString().slice(0, 10) };
  writeStoredSettlements([...readStoredSettlements(), settlement]);
}

export async function confirmStoredSettlement(id: string) {
  const response = await fetch(`/api/settlements/${encodeURIComponent(id)}/confirm`, { method: "POST" });
  if (!response.ok) {
    const result = await response.json() as { error?: string };
    throw new Error(result.error ?? "Could not confirm repayment.");
  }
  writeStoredSettlements(readStoredSettlements().map((item) => item.id === id ? { ...item, status: "confirmed" } : item));
}
