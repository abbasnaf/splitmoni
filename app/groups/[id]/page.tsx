"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { GroupDetailPage } from "@/components/splitwise-app";

function PageInner() {
  const params = useParams<{ id: string }>();
  return <GroupDetailPage groupId={params?.id ?? "goa-trip-2026"} />;
}

export default function Page() {
  return (
    <Suspense fallback={<GroupDetailPage groupId="goa-trip-2026" />}>
      <PageInner />
    </Suspense>
  );
}
