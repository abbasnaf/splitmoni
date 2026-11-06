"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-provider";

export function EmailConfirmation() {
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/email/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: new URLSearchParams(window.location.search).get("token") ?? "" }),
    })
      .then(async (response) => {
        const result = await response.json() as { ok?: boolean; message?: string; error?: string };
        if (!response.ok) throw new Error(result.error ?? "This email link is invalid or has expired.");
        setState("success");
        setMessage(result.message ?? "Your email address has been confirmed.");
      })
      .catch((error: unknown) => {
        setState("error");
        setMessage(error instanceof Error ? error.message : "This email link is invalid or has expired.");
      });
  }, []);

  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center p-4">
      <ThemeToggle className="theme-toggle-floating" />
      <div className="w-full max-w-md">
        <div className="card bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6 text-center">
          <div className="flex justify-center mb-6">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500 text-white text-2xl font-bold">₹</span>
          </div>
          <h1 className="text-2xl font-bold text-black mb-3">Email confirmation</h1>
          {state === "loading" ? <p className="text-gray-600">Checking this link…</p> : null}
          {state === "success" ? <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">{message}</div> : null}
          {state === "error" ? <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{message}</div> : null}
          <Link href="/" className="mt-6 inline-block text-sm text-blue-500 hover:underline">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
