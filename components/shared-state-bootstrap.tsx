"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { writeStoredExpenses } from "@/lib/expense-store";
import {
  writeGroupInvites,
  writeStoredGroups,
  writeStoredUsers,
  type GroupInvite,
} from "@/lib/group-store";
import { writeStoredSettlements } from "@/lib/settlement-store";
import type { Expense, Group, SettlementRecord, User } from "@/lib/split-engine";

type AppState = {
  currentUser: User;
  users: User[];
  groups: Group[];
  expenses: Expense[];
  settlements: SettlementRecord[];
  invites: Record<string, GroupInvite[]>;
};

export async function fetchAppState() {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (response.status === 401) return { unauthorized: true, state: null };
  if (!response.ok) throw new Error("Could not load SplitMoni data.");
  const state = await response.json() as AppState;
  window.localStorage.setItem("splitmoni.current-user", JSON.stringify(state.currentUser));
  writeStoredUsers(state.users);
  writeStoredGroups(state.groups);
  writeStoredExpenses(state.expenses);
  writeGroupInvites(state.invites);
  writeStoredSettlements(state.settlements);
  return { unauthorized: false, state };
}

export function SharedStateBootstrap() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    let active = true;
    if (pathname === "/" || pathname.startsWith("/invitations/")) return;
    fetchAppState()
      .then((result) => {
        if (active && result.unauthorized) router.replace("/");
      })
      .catch((error: unknown) => console.error("SplitMoni data sync failed:", error));
    return () => { active = false; };
  }, [pathname, router]);

  return null;
}
