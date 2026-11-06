import { getSignedInUser } from "@/lib/auth";
import { deleteExpenseComment, updateExpenseComment } from "@/lib/database";

export async function PATCH(request: Request, context: RouteContext<"/api/expenses/[id]/comments/[commentId]">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id, commentId } = await context.params;
    const body = await request.json() as { body?: unknown };
    if (typeof body.body !== "string") return Response.json({ error: "Enter a comment." }, { status: 400 });
    const comment = updateExpenseComment(id, commentId, user.id, body.body);
    return Response.json({ comment }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update comment." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/expenses/[id]/comments/[commentId]">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id, commentId } = await context.params;
    deleteExpenseComment(id, commentId, user.id);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete comment." }, { status: 400 });
  }
}
