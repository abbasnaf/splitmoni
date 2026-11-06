"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAppState } from "@/components/shared-state-bootstrap";
import { EXPENSES_STORAGE_KEY } from "@/lib/expense-store";
import { GROUP_INVITES_KEY, GROUPS_STORAGE_KEY, USERS_STORAGE_KEY } from "@/lib/group-store";
import { SETTLEMENTS_STORAGE_KEY } from "@/lib/settlement-store";
import type { User } from "@/lib/split-engine";

const CURRENCY_SUGGESTIONS = ["INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD"];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const inputClassName = "w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-white outline-none focus:border-sw-green";
const labelClassName = "block space-y-2 text-sm text-slate-400";
const buttonClassName = "rounded-full bg-sw-green px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sw-green-dark disabled:cursor-not-allowed disabled:opacity-50";

function ProfileSection({ currentUser }: { currentUser: User }) {
  const [name, setName] = useState(currentUser.name);
  const [defaultCurrency, setDefaultCurrency] = useState(currentUser.defaultCurrency);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = name !== currentUser.name || defaultCurrency !== currentUser.defaultCurrency;

  const handleProfileFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, defaultCurrency }),
      });
      const result = await response.json() as { user?: User; error?: string };
      if (!response.ok || !result.user) throw new Error(result.error ?? "Could not save your profile.");
      await fetchAppState();
      setStatus("Profile saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
      <h2 className="text-xl font-semibold text-white">Profile</h2>
      <p className="mt-1 text-sm text-slate-400">Signed in as {currentUser.email}.</p>
      <form onSubmit={handleProfileFormSubmit} className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-end">
        <label className={labelClassName}>
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            autoComplete="name"
            className={inputClassName}
          />
        </label>
        <label className={labelClassName}>
          <span>Default currency</span>
          <input
            type="text"
            value={defaultCurrency}
            onChange={(event) => setDefaultCurrency(event.target.value.toUpperCase())}
            maxLength={3}
            list="settings-currency-options"
            autoComplete="off"
            className={inputClassName}
          />
          <datalist id="settings-currency-options">
            {CURRENCY_SUGGESTIONS.map((currency) => <option key={currency} value={currency} />)}
          </datalist>
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={busy || !dirty || !name.trim() || !defaultCurrency.trim()} className={buttonClassName}>
            {busy ? "Saving…" : "Save profile"}
          </button>
          {status ? <p aria-live="polite" className="text-sm text-slate-400">{status}</p> : null}
        </div>
      </form>
    </div>
  );
}

function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const handlePasswordFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatus("New passwords do not match.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not change your password.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus("Password updated. Other signed-in sessions were signed out.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not change your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 md:col-span-2">
      <h2 className="text-xl font-semibold text-white">Password and sessions</h2>
      <p className="mt-1 text-sm text-slate-400">Changing your password signs out every other signed-in session and keeps this one active.</p>
      <form onSubmit={handlePasswordFormSubmit} className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className={labelClassName}>
          <span>Current password</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            autoComplete="current-password"
            className={inputClassName}
          />
        </label>
        <label className={labelClassName}>
          <span>New password</span>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            className={inputClassName}
          />
        </label>
        <label className={labelClassName}>
          <span>Confirm new password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            className={inputClassName}
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-3">
          <button type="submit" disabled={busy || !currentPassword || !newPassword || !confirmPassword} className={buttonClassName}>
            {busy ? "Updating…" : "Change password"}
          </button>
          {status ? <p aria-live="polite" className="text-sm text-slate-400">{status}</p> : null}
        </div>
      </form>
    </div>
  );
}

function EmailSection({ currentUser }: { currentUser: User }) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const handleEmailFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/user/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: password, newEmail }),
      });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not request the email change.");
      setNewEmail("");
      setPassword("");
      setStatus(result.message ?? "Check the new email address for a confirmation link.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not request the email change.");
    } finally {
      setBusy(false);
    }
  };

  const handleSendVerification = async () => {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/user/email", { method: "PUT" });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not request email verification.");
      setStatus(result.message ?? "Check your inbox for a verification link.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not request email verification.");
    } finally {
      setBusy(false);
    }
  };

  const verified = Boolean(currentUser.emailVerifiedAt);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Email address</h2>
          <p className="mt-1 text-sm text-slate-400">Signed in as {currentUser.email}.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", verified ? "bg-sw-green/10 text-sw-green-light" : "bg-amber-100 text-amber-800")}>
            {verified ? "Verified" : "Not verified"}
          </span>
          {!verified ? (
            <button type="button" onClick={() => void handleSendVerification()} disabled={busy} className="rounded-full border border-sw-green/40 px-3 py-1.5 text-xs font-semibold text-sw-green-light transition hover:bg-sw-green hover:text-white disabled:opacity-50">
              {busy ? "Sending…" : "Send verification email"}
            </button>
          ) : null}
        </div>
      </div>
      <form onSubmit={handleEmailFormSubmit} className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className={labelClassName}>
          <span>New email address</span>
          <input
            type="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            required
            autoComplete="email"
            className={inputClassName}
          />
          <span className="block text-xs text-slate-500">A confirmation link is sent to the new address. Changing it may require re-verification, sign-ins stay active.</span>
        </label>
        <label className={labelClassName}>
          <span>Current password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            className={inputClassName}
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={busy || !newEmail.trim() || !password} className={buttonClassName}>
            {busy ? "Sending…" : "Change email"}
          </button>
          {status ? <p aria-live="polite" className="text-sm text-slate-400">{status}</p> : null}
        </div>
      </form>
    </div>
  );
}

function clearSignedInData() {
  for (const key of [
    "splitmoni.current-user",
    USERS_STORAGE_KEY,
    GROUPS_STORAGE_KEY,
    GROUP_INVITES_KEY,
    EXPENSES_STORAGE_KEY,
    SETTLEMENTS_STORAGE_KEY,
  ]) {
    window.localStorage.removeItem(key);
  }
}

function DangerZoneSection() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const handleDeleteFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/user", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: password }),
      });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not delete your account.");
      clearSignedInData();
      router.replace("/");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete your account.");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-red-900/60 bg-red-950/20 p-5 md:col-span-2">
      <h2 className="text-xl font-semibold text-white">Delete account</h2>
      <p className="mt-1 text-sm text-slate-400">
        Groups you own alone are deleted with their records. Shared groups are handed to a remaining member and your membership becomes an anonymized &quot;Deleted account&quot; record so past balances stay correct. This cannot be undone; all your sessions are signed out.
      </p>
      <form onSubmit={handleDeleteFormSubmit} className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto] sm:items-end">
        <label className={labelClassName}>
          <span>Current password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            className={inputClassName}
          />
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-400 sm:pb-2">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-600 bg-slate-950 accent-red-600"
          />
          <span>I understand this permanently deletes my account.</span>
        </label>
        <div className="flex items-center gap-3 sm:col-span-3">
          <button
            type="submit"
            disabled={busy || !password || !confirmed}
            className="rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete account permanently"}
          </button>
          {status ? <p aria-live="polite" className="text-sm text-slate-400">{status}</p> : null}
        </div>
      </form>
    </div>
  );
}

export function AccountSettings({ currentUser }: { currentUser: User }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ProfileSection currentUser={currentUser} />
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <h2 className="text-xl font-semibold text-white">Preferences</h2>
        <ul className="mt-5 space-y-2 text-sm text-slate-300">
          <li>• Settlement reminders</li>
          <li>• Group notifications</li>
          <li>• Smart summaries</li>
          <li>• Expense comments</li>
        </ul>
      </div>
      <EmailSection key={currentUser.id} currentUser={currentUser} />
      <SecuritySection />
      <DangerZoneSection />
    </div>
  );
}
