import { useSyncExternalStore } from "react";
import { groups as seedGroups, users as seedUsers } from "@/lib/mock-data";
import type { Group, User } from "@/lib/split-engine";

export const GROUPS_STORAGE_KEY = "splitmoni.groups";
export const GROUP_INVITES_KEY = "splitmoni.group-invites";
export const USERS_STORAGE_KEY = "splitmoni.users";

export interface GroupInvite {
  id: string;
  groupId: string;
  email: string;
  status: "pending" | "accepted" | "declined" | "expired" | "revoked";
  invitedAt: string;
  expiresAt: string | null;
}

const EMPTY_INVITES: Record<string, GroupInvite[]> = {};

/* -------------------------------------------------------------------------- */
/* Groups                                                                     */
/* -------------------------------------------------------------------------- */

export function readStoredGroups(): Group[] {
  if (typeof window === "undefined") {
    return seedGroups;
  }

  const item = window.localStorage.getItem(GROUPS_STORAGE_KEY);
  if (!item) {
    window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(seedGroups));
    return seedGroups;
  }

  try {
    const parsed = JSON.parse(item) as Group[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : seedGroups;
  } catch {
    window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(seedGroups));
    return seedGroups;
  }
}

export function writeStoredGroups(groups: Group[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
  groupsSnapshot = groups;
  emitGroupChange();
}

let groupsSnapshot: Group[] | null = null;
const groupListeners = new Set<() => void>();

function emitGroupChange() {
  groupListeners.forEach((listener) => listener());
}

export function subscribeToGroups(listener: () => void) {
  groupListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      groupListeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== GROUPS_STORAGE_KEY) {
      return;
    }

    groupsSnapshot = null;
    listener();
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    groupListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function getGroupsSnapshot() {
  if (typeof window === "undefined") {
    return seedGroups;
  }

  if (groupsSnapshot === null) {
    groupsSnapshot = readStoredGroups();
  }

  return groupsSnapshot;
}

export function getServerGroupsSnapshot() {
  return seedGroups;
}

export function useStoredGroups() {
  return useSyncExternalStore(
    subscribeToGroups,
    getGroupsSnapshot,
    getServerGroupsSnapshot,
  );
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

export function readStoredUsers(): User[] {
  if (typeof window === "undefined") {
    return seedUsers;
  }

  const item = window.localStorage.getItem(USERS_STORAGE_KEY);
  if (!item) {
    window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(seedUsers));
    return seedUsers;
  }

  try {
    const parsed = JSON.parse(item) as User[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : seedUsers;
  } catch {
    window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(seedUsers));
    return seedUsers;
  }
}

export function writeStoredUsers(users: User[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  usersSnapshot = users;
  emitUserChange();
}

let usersSnapshot: User[] | null = null;
const userListeners = new Set<() => void>();

function emitUserChange() {
  userListeners.forEach((listener) => listener());
}

export function subscribeToUsers(listener: () => void) {
  userListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      userListeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== USERS_STORAGE_KEY) {
      return;
    }

    usersSnapshot = null;
    listener();
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    userListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function getUsersSnapshot() {
  if (typeof window === "undefined") {
    return seedUsers;
  }

  if (usersSnapshot === null) {
    usersSnapshot = readStoredUsers();
  }

  return usersSnapshot;
}

export function getServerUsersSnapshot() {
  return seedUsers;
}

export function useStoredUsers() {
  return useSyncExternalStore(
    subscribeToUsers,
    getUsersSnapshot,
    getServerUsersSnapshot,
  );
}

/* -------------------------------------------------------------------------- */
/* Invites                                                                    */
/* -------------------------------------------------------------------------- */

export function readGroupInvites(): Record<string, GroupInvite[]> {
  if (typeof window === "undefined") {
    return EMPTY_INVITES;
  }

  const item = window.localStorage.getItem(GROUP_INVITES_KEY);
  if (!item) {
    window.localStorage.setItem(GROUP_INVITES_KEY, JSON.stringify({}));
    return {};
  }

  try {
    const parsed = JSON.parse(item) as Record<string, GroupInvite[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    window.localStorage.setItem(GROUP_INVITES_KEY, JSON.stringify({}));
    return {};
  }
}

export function writeGroupInvites(invites: Record<string, GroupInvite[]>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(GROUP_INVITES_KEY, JSON.stringify(invites));
  invitesSnapshot = invites;
  emitInviteChange();
}

let invitesSnapshot: Record<string, GroupInvite[]> | null = null;
const inviteListeners = new Set<() => void>();

function emitInviteChange() {
  inviteListeners.forEach((listener) => listener());
}

export function subscribeToGroupInvites(listener: () => void) {
  inviteListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      inviteListeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== GROUP_INVITES_KEY) {
      return;
    }

    invitesSnapshot = null;
    listener();
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    inviteListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function getGroupInvitesSnapshot() {
  if (typeof window === "undefined") {
    return EMPTY_INVITES;
  }

  if (invitesSnapshot === null) {
    invitesSnapshot = readGroupInvites();
  }

  return invitesSnapshot;
}

export function getServerGroupInvitesSnapshot() {
  return EMPTY_INVITES;
}

export function useGroupInvites() {
  return useSyncExternalStore(
    subscribeToGroupInvites,
    getGroupInvitesSnapshot,
    getServerGroupInvitesSnapshot,
  );
}

export async function addGroupInvites(groupId: string, emails: string | string[]) {
  if (typeof window === "undefined") {
    return [] as GroupInvite[];
  }

  const source = Array.isArray(emails) ? emails : emails.split(/[\n,;]+/);

  const normalized = Array.from(
    new Set(
      source
        .map((email) => email.trim())
        .filter(Boolean),
    ),
  );

  if (normalized.length === 0) {
    return readGroupInvites()[groupId] ?? [];
  }

  const response = await fetch(`/api/groups/${encodeURIComponent(groupId)}/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emails: normalized }),
  });
  const result = await response.json() as { invites?: GroupInvite[]; error?: string };
  if (result.invites) {
    const invites = readGroupInvites();
    invites[groupId] = result.invites;
    writeGroupInvites(invites);
  }
  if (!response.ok) throw new Error(result.error ?? "Could not send invitations.");
  if (!result.invites) throw new Error("The server did not return the updated invitations.");
  return result.invites;
}

export function makeGroupId(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "group"}-${Date.now()}`;
}
