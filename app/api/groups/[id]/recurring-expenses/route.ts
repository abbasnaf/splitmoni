import { getSignedInUser } from "@/lib/auth";
import { createRecurringExpense, listRecurringExpenses } from "@/lib/database";

export async function GET(_request: Request, context: RouteContext<"/api/groups/[id]/recurring-expenses">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id } = await context.params;
    return Response.json({ recurringExpenses: listRecurringExpenses(id, user.id) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load recurring expenses." }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext<"/api/groups/[id]/recurring-expenses">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id: groupId } = await context.params;
    const body = await request.json() as { id?: unknown; expenseId?: unknown; frequency?: unknown; interval?: unknown };
    if (
      typeof body.id !== "string" || body.id.length > 100 ||
      typeof body.expenseId !== "string" ||
      typeof body.frequency !== "string" ||
      typeof body.interval !== "number"
    ) return Response.json({ error: "Enter a valid recurrence schedule." }, { status: 400 });
    createRecurringExpense(body.id, groupId, body.expenseId, user.id, body.frequency as "day" | "week" | "month", body.interval);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save recurring expense." }, { status: 400 });
  }
}
