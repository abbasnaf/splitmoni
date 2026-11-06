"use client";

import { useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-provider";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not request a password reset.");
      setSent(true);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Could not request a password reset.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center p-4">
      <ThemeToggle className="theme-toggle-floating" />
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-6">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500 text-white text-2xl font-bold">₹</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-black mb-2">Reset your password</h1>
          <p className="text-gray-600">Enter your email address and we will send you a reset link.</p>
        </div>

        <div className="card bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
          {sent ? (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
                If an account exists for that email address, a reset link has been sent. The link expires in one hour.
              </div>
              <p className="text-sm text-gray-600">Check your spam folder if the email does not arrive within a few minutes.</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-blue-500 focus:border-blue-500 w-full"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="text-center text-sm text-gray-600">
          <Link href="/" className="text-blue-500 hover:underline">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
