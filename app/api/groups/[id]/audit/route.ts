import { getSignedInUser } from "@/lib/auth";
import { listAuditEvents } from "@/lib/database";

export async function GET(_request: Request, context: RouteContext<"/api/groups/[id]/audit">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id } = await context.params;
    return Response.json({ events: listAuditEvents(id, user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load audit history." }, { status: 400 });
  }
}
