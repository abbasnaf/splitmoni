"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import {
  ExpenseComposer,
  ExpenseComposerSkeleton,
} from "@/components/expense-composer";
import { ThemeToggle } from "@/components/theme-provider";

function PageInner() {
  const params = useParams<{ id: string }>();

  return <ExpenseComposer expenseId={params?.id} />;
}

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <ThemeToggle className="theme-toggle-floating" />
      <div className="mx-auto max-w-4xl">
        <Suspense fallback={<ExpenseComposerSkeleton />}>
          <PageInner />
        </Suspense>
      </div>
    </div>
  );
}
