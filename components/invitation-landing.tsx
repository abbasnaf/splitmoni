"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthHome } from "@/components/auth-home";

type Invitation = {
  groupName: string;
  email: string;
  status: "pending" | "accepted" | "declined" | "expired" | "revoked";
  archived: boolean;
};

type Account = { id: string; email: string; name: string; defaultCurrency: string };

export function InvitationLanding({ token }: { token: string }) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/invitations/${encodeURIComponent(token)}`, { cache: "no-store" }),
      fetch("/api/auth", { cache: "no-store" }),
    ]).then(async ([inviteResponse, accountResponse]) => {
      const inviteResult = await inviteResponse.json() as { invitation?: Invitation; error?: string };
      if (!inviteResponse.ok || !inviteResult.invitation) throw new Error(inviteResult.error ?? "Could not load this invitation.");
      const accountResult = accountResponse.ok
        ? await accountResponse.json() as { user?: Account }
        : null;
      if (active) {
        setInvitation(inviteResult.invitation);
        setAccount(accountResult?.user ?? null);
      }
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Could not load this invitation.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  const respond = async (action: "accept" | "decline") => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json() as { groupId?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not respond to invitation.");
      if (action === "accept" && result.groupId) router.push(`/groups/${encodeURIComponent(result.groupId)}`);
      else router.push("/dashboard");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not respond to invitation.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setError("");
    try {
      const response = await fetch("/api/auth", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not sign out. Please try again.");
      window.localStorage.removeItem("splitmoni.current-user");
      setAccount(null);
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Could not sign out. Please try again.");
    }
  };

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">Loading invitation...</main>;
  }
  if (!invitation) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-rose-300">{error || "This invitation is unavailable."}</main>;
  }
  if (!account) {
    return (
      <AuthHome
        redirectTo={`/invitations/${encodeURIComponent(token)}`}
        initialEmail={invitation.email}
        invitationMessage={`Sign in or create an account using ${invitation.email} to respond to this invitation to ${invitation.groupName}.`}
        onAuthenticated={setAccount}
      />
    );
  }

  const canRespond = invitation.status === "pending" && !invitation.archived;
  const emailMatches = account.email.toLowerCase() === invitation.email.toLowerCase();
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <section className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sw-green-light">Group invitation</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{invitation.groupName}</h1>
        <p className="mt-3 text-slate-400">Invitation for <span className="text-slate-200">{invitation.email}</span></p>
        {canRespond && emailMatches ? (
          <div className="mt-7 flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={() => void respond("accept")} className="rounded-full bg-sw-green px-5 py-2.5 font-medium text-white disabled:opacity-50">
              {busy ? "Please wait..." : "Accept invitation"}
            </button>
            <button type="button" disabled={busy} onClick={() => void respond("decline")} className="rounded-full border border-slate-700 px-5 py-2.5 font-medium text-slate-200 disabled:opacity-50">
              Decline
            </button>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
            {invitation.status === "expired" ? "This invitation has expired. Ask the group owner to send a new one." :
              invitation.status === "accepted" ? "This invitation has already been accepted." :
                invitation.status === "declined" ? "This invitation has already been declined." :
                  invitation.archived ? "This group has been archived, so this invitation can no longer be accepted." :
                    !emailMatches ? "You’re signed in with a different email. Sign out and use the invited email address." :
                      "This invitation is no longer available."}
          </div>
        )}
        {canRespond && !emailMatches ? (
          <button type="button" onClick={() => void signOut()} className="mt-4 text-sm font-medium text-sw-green-light hover:underline">Sign out to switch accounts</button>
        ) : null}
        {error ? <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </section>
    </main>
  );
}
