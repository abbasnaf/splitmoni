"use client";

import { useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-provider";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const token = new URLSearchParams(window.location.search).get("token") ?? "";
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not reset your password.");
      setDone(true);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Could not reset your password.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <main className="min-h-screen bg-white text-black flex flex-col items-center justify-center p-4">
        <div className="card bg-white border border-gray-200 rounded-xl shadow-sm p-6 text-center">
          <h1 className="text-2xl font-bold text-black mb-2">Password updated</h1>
          <p className="text-gray-600 mb-6">All signed-in sessions were signed out. Sign in with your new password.</p>
          <Link href="/" className="inline-block bg-blue-500 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-600 transition-colors">Back to sign in</Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center p-4">
      <ThemeToggle className="theme-toggle-floating" />
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-6">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500 text-white text-2xl font-bold">₹</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-black mb-2">Choose a new password</h1>
          <p className="text-gray-600">Set a new password for your SplitMoni account.</p>
        </div>

        <div className="card bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-blue-500 focus:border-blue-500 w-full"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-blue-500 focus:border-blue-500 w-full"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {busy ? "Updating…" : "Set new password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
