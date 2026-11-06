"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-provider";

export function AuthHome({
  redirectTo = "/dashboard",
  initialEmail = "",
  invitationMessage,
  onAuthenticated,
}: {
  redirectTo?: string;
  initialEmail?: string;
  invitationMessage?: string;
  onAuthenticated?: (user: { id: string; name: string; email: string; defaultCurrency: string }) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const authenticate = async (action: "login" | "register", credentials?: { email: string; password: string }) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name, email: credentials?.email ?? email, password: credentials?.password ?? password }),
      });
      const result = await response.json() as { user?: { id: string; name: string; email: string; defaultCurrency: string }; error?: string };
      if (!response.ok || !result.user) throw new Error(result.error ?? "Could not sign in.");
      window.localStorage.setItem("splitmoni.current-user", JSON.stringify(result.user));
      if (onAuthenticated) onAuthenticated(result.user);
      else router.push(redirectTo);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void authenticate(mode === "signup" ? "register" : "login");
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center p-4">
      <ThemeToggle className="theme-toggle-floating" />
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-6">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500 text-white text-2xl font-bold">₹</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-black mb-2">Split<span className="text-blue-500">Moni</span></h1>
          <p className="text-gray-600">Share expenses with friends and family</p>
        </div>

        <div className="card bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
          {invitationMessage ? <p className="mb-5 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{invitationMessage}</p> : null}
          <div className="flex mb-6 border-b border-gray-200">
            <button
              type="button"
              className={`px-4 py-2 font-medium ${mode === "login" ? "text-blue-500 border-b-2 border-blue-500" : "text-gray-500"}`}
              onClick={() => setMode("login")}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`px-4 py-2 font-medium ${mode === "signup" ? "text-blue-500 border-b-2 border-blue-500" : "text-gray-500"}`}
              onClick={() => setMode("signup")}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-blue-500 focus:border-blue-500 w-full"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-blue-500 focus:border-blue-500 w-full"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-blue-500 focus:border-blue-500 w-full"
              />
            </div>

            {mode === "login" ? (
              <p className="-mt-2 text-right text-sm">
                <Link href="/forgot-password" className="text-blue-500 hover:underline">Forgot password?</Link>
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {busy ? "Processing..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>
        </div>

        <div className="text-center text-sm text-gray-600">
          <p>By signing up, you agree to our Terms and Privacy Policy</p>
        </div>
      </div>
    </div>
  );
}
