"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { InvitationLanding } from "@/components/invitation-landing";

function PageInner() {
  const params = useParams<{ token: string }>();
  return <InvitationLanding token={params?.token ?? ""} />;
}

export default function Page() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">Loading invitation...</main>}>
      <PageInner />
    </Suspense>
  );
}
