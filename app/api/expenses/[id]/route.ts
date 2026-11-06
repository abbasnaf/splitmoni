import { deleteExpense } from "@/lib/database";
import { getSignedInUser } from "@/lib/auth";


export async function DELETE(_request: Request, context: RouteContext<"/api/expenses/[id]">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id } = await context.params;
    deleteExpense(id, user.id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete expense." }, { status: 400 });
  }
}
