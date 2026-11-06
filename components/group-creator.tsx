"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { makeGroupId, readStoredGroups, writeStoredGroups } from "@/lib/group-store";
import type { Group } from "@/lib/split-engine";

export function GroupCreator() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("Group name is required.");
      return;
    }

    setBusy(true);
    setError("");
    const groupId = makeGroupId(normalizedName);
    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group: { id: groupId, name: normalizedName, currency } }),
      });
      const result = await response.json() as { group?: Group; error?: string };
      if (!response.ok || !result.group) throw new Error(result.error ?? "Could not create group.");

      const createdGroup = result.group;
      writeStoredGroups([createdGroup, ...readStoredGroups().filter((group) => group.id !== createdGroup.id)]);
      router.push(`/groups/${createdGroup.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create group.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-sw-green-light">Create group</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Start a new shared ledger</h1>
        <p className="mt-2 text-sm text-slate-400">You’ll be the group owner. Invite people once the group is created.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-300">
          <span>Group name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-sw-green"
            placeholder="Weekend Trip"
          />
        </label>

        <label className="space-y-2 text-sm text-slate-300">
          <span>Currency</span>
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-sw-green"
          >
            <option value="INR">INR</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </label>
      </div>

      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-sw-green px-5 py-2.5 font-medium text-white transition hover:bg-sw-green-dark disabled:opacity-50"
        >
          {busy ? "Creating..." : "Create group"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/groups")}
          className="rounded-full border border-slate-700 bg-slate-950/50 px-5 py-2.5 font-medium text-slate-200 transition hover:border-slate-500"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
