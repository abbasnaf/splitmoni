import { getSignedInUser } from "@/lib/auth";
import { createExpenseComment, listExpenseComments } from "@/lib/database";

export async function GET(_request: Request, context: RouteContext<"/api/expenses/[id]/comments">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id } = await context.params;
    return Response.json({ comments: listExpenseComments(id, user.id) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load comments." }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext<"/api/expenses/[id]/comments">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await request.json() as { body?: unknown };
    if (typeof body.body !== "string") return Response.json({ error: "Enter a comment." }, { status: 400 });
    const comment = createExpenseComment(id, user.id, body.body);
    return Response.json({ comment }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save comment." }, { status: 400 });
  }
}
