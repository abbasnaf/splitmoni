"use client";

import { useState } from "react";
import {
  addGroupInvites,
  readGroupInvites,
  readStoredGroups,
  writeGroupInvites,
  writeStoredGroups,
  writeStoredUsers,
  type GroupInvite,
} from "@/lib/group-store";
import type { Group, User } from "@/lib/split-engine";

function saveInvites(groupId: string, invites: GroupInvite[]) {
  const allInvites = readGroupInvites();
  allInvites[groupId] = invites;
  writeGroupInvites(allInvites);
}

function saveGroup(group: Group) {
  writeStoredGroups(readStoredGroups().map((stored) => stored.id === group.id ? group : stored));
}

export function GroupManagement({
  group,
  users,
  invites,
  isOwner,
  hasLedger,
}: {
  group: Group;
  users: User[];
  invites: GroupInvite[];
  isOwner: boolean;
  hasLedger: boolean;
}) {
  const [emailInput, setEmailInput] = useState("");
  const [name, setName] = useState(group.name);
  const [currency, setCurrency] = useState(group.currency);
  const [transferTo, setTransferTo] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The change could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const submitInvites = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runAction(async () => {
      if (!emailInput.trim()) throw new Error("Enter at least one email to invite.");
      await addGroupInvites(group.id, emailInput);
      setEmailInput("");
      setMessage("Invitation emails sent.");
    });
  };

  const changeInvitation = async (invite: GroupInvite, action: "resend" | "revoke") => {
    await runAction(async () => {
      const response = await fetch(`/api/groups/${encodeURIComponent(group.id)}/invites/${encodeURIComponent(invite.id)}`, {
        method: action === "resend" ? "POST" : "DELETE",
      });
      const result = await response.json() as { invites?: GroupInvite[]; error?: string };
      if (!response.ok || !result.invites) throw new Error(result.error ?? `Could not ${action} invitation.`);
      saveInvites(group.id, result.invites);
      setMessage(action === "resend" ? "Invitation email sent." : "Invitation revoked.");
    });
  };

  const updateGroup = async (changes: { name?: string; currency?: string; transferTo?: string; archive?: boolean }) => {
    await runAction(async () => {
      const response = await fetch(`/api/groups/${encodeURIComponent(group.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const result = await response.json() as { group?: Group; error?: string };
      if (!response.ok || !result.group) throw new Error(result.error ?? "Could not update group.");
      saveGroup(result.group);
      setName(result.group.name);
      setCurrency(result.group.currency);
      setTransferTo("");
      setMessage("Group settings updated.");
    });
  };

  const removeMember = async (memberId: string) => {
    await runAction(async () => {
      const response = await fetch(`/api/groups/${encodeURIComponent(group.id)}/members/${encodeURIComponent(memberId)}`, { method: "DELETE" });
      const result = await response.json() as { group?: Group; users?: User[]; error?: string };
      if (!response.ok || !result.group || !result.users) throw new Error(result.error ?? "Could not remove group member.");
      saveGroup(result.group);
      writeStoredUsers(result.users);
      setMessage("Member removed.");
    });
  };

  if (!isOwner) return null;

  return (
    <section className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
      <div>
        <h3 className="text-xl font-semibold text-white">Group settings</h3>
        <p className="mt-1 text-sm text-slate-400">Owner controls for invitations, membership, and group status.</p>
      </div>

      <form onSubmit={submitInvites} className="space-y-3">
        <label className="block space-y-2 text-sm text-slate-300">
          <span>Invite members by email</span>
          <textarea
            value={emailInput}
            onChange={(event) => setEmailInput(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-sw-green"
            placeholder="friend@example.com, buddy@example.com"
          />
        </label>
        <button type="submit" disabled={busy || Boolean(group.archivedAt)} className="rounded-full bg-sw-green px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          Send invitations
        </button>
      </form>

      {invites.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-200">Invitation status</h4>
          {invites.map((invite) => (
            <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm">
              <div>
                <p className="text-slate-200">{invite.email}</p>
                <p className="mt-1 text-xs capitalize text-slate-400">{invite.status}{invite.expiresAt && invite.status === "pending" ? ` · expires ${new Date(invite.expiresAt).toLocaleDateString()}` : ""}</p>
              </div>
              <div className="flex gap-2">
                {["pending", "expired"].includes(invite.status) && !group.archivedAt ? (
                  <button type="button" disabled={busy} onClick={() => void changeInvitation(invite, "resend")} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-sw-green/70 disabled:opacity-50">Resend</button>
                ) : null}
                {invite.status === "pending" && !group.archivedAt ? (
                  <button type="button" disabled={busy} onClick={() => void changeInvitation(invite, "revoke")} className="rounded-full border border-rose-900/70 px-3 py-1 text-xs text-rose-300 hover:border-rose-500 disabled:opacity-50">Revoke</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void updateGroup({ name, currency });
        }}
        className="grid gap-3 border-t border-slate-800 pt-5 md:grid-cols-[1fr_140px_auto]"
      >
        <label className="space-y-2 text-sm text-slate-300">
          <span>Group name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required disabled={Boolean(group.archivedAt)} className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-sw-green disabled:opacity-50" />
        </label>
        <label className="space-y-2 text-sm text-slate-300">
          <span>Currency</span>
          <select value={currency} onChange={(event) => setCurrency(event.target.value)} disabled={hasLedger || Boolean(group.archivedAt)} className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-sw-green disabled:opacity-50">
            <option value="INR">INR</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </label>
        <button type="submit" disabled={busy || Boolean(group.archivedAt)} className="self-end rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-sw-green/70 disabled:opacity-50">Save</button>
        {hasLedger ? <p className="text-xs text-slate-500 md:col-span-3">Currency is locked after an expense or repayment has been recorded.</p> : null}
      </form>

      {!group.archivedAt && group.members.length > 1 ? (
        <div className="grid gap-3 border-t border-slate-800 pt-5 md:grid-cols-[1fr_auto]">
          <label className="space-y-2 text-sm text-slate-300">
            <span>Transfer ownership</span>
            <select value={transferTo} onChange={(event) => setTransferTo(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white">
              <option value="">Select a member</option>
              {group.members.filter((memberId) => memberId !== group.createdBy).map((memberId) => {
                const member = users.find((item) => item.id === memberId);
                return member ? <option key={member.id} value={member.id}>{member.name}</option> : null;
              })}
            </select>
          </label>
          <button type="button" disabled={busy || !transferTo} onClick={() => {
            if (window.confirm("Transfer ownership? The new owner will control group settings.")) void updateGroup({ transferTo });
          }} className="self-end rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 disabled:opacity-50">Transfer owner</button>
        </div>
      ) : null}

      {!group.archivedAt && !hasLedger && group.members.length > 1 ? (
        <div className="border-t border-slate-800 pt-5">
          <h4 className="text-sm font-semibold text-slate-200">Remove a member</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {group.members.filter((memberId) => memberId !== group.createdBy).map((memberId) => {
              const member = users.find((item) => item.id === memberId);
              return member ? (
                <button key={member.id} type="button" disabled={busy} onClick={() => {
                  if (window.confirm(`Remove ${member.name} from this group?`)) void removeMember(member.id);
                }} className="rounded-full border border-rose-900/70 px-3 py-1.5 text-xs text-rose-300 hover:border-rose-500 disabled:opacity-50">
                  Remove {member.name}
                </button>
              ) : null;
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-5">
        <p className="text-sm text-slate-400">{group.archivedAt ? "Archived groups are read-only." : "Archiving keeps all history and prevents further ledger changes."}</p>
        <button type="button" disabled={busy} onClick={() => {
          const archive = !group.archivedAt;
          if (window.confirm(archive ? "Archive this group? Its history will remain available but read-only." : "Restore this group for new activity?")) void updateGroup({ archive });
        }} className="rounded-full border border-rose-900/70 px-4 py-2 text-sm text-rose-300 hover:border-rose-500 disabled:opacity-50">
          {group.archivedAt ? "Restore group" : "Archive group"}
        </button>
      </div>

      {message ? <p role="status" className="text-sm text-sw-green-light">{message}</p> : null}
    </section>
  );
}
