import { getSignedInUser } from "@/lib/auth";
import { setRecurringExpensePaused } from "@/lib/database";

export async function PATCH(request: Request, context: RouteContext<"/api/recurring-expenses/[id]">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await request.json() as { paused?: unknown };
    if (typeof body.paused !== "boolean") return Response.json({ error: "Choose whether to pause or resume this schedule." }, { status: 400 });
    setRecurringExpensePaused(id, user.id, body.paused);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update recurring expense." }, { status: 400 });
  }
}
