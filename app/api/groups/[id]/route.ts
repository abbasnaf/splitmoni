import { getSignedInUser } from "@/lib/auth";
import { readAppState, updateGroup } from "@/lib/database";

export async function PATCH(request: Request, context: RouteContext<"/api/groups/[id]">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const body = await request.json() as { name?: unknown; currency?: unknown; transferTo?: unknown; archive?: unknown };
    if (body.name !== undefined && typeof body.name !== "string") return Response.json({ error: "Group name must be text." }, { status: 400 });
    if (body.currency !== undefined && typeof body.currency !== "string") return Response.json({ error: "Currency must be text." }, { status: 400 });
    if (body.transferTo !== undefined && typeof body.transferTo !== "string") return Response.json({ error: "Choose an active group member." }, { status: 400 });
    if (body.archive !== undefined && typeof body.archive !== "boolean") return Response.json({ error: "Archive must be true or false." }, { status: 400 });
    const { id } = await context.params;
    const changes: { name?: string; currency?: string; transferTo?: string; archive?: boolean } = {};
    if (typeof body.name === "string") changes.name = body.name;
    if (typeof body.currency === "string") changes.currency = body.currency;
    if (typeof body.transferTo === "string") changes.transferTo = body.transferTo;
    if (typeof body.archive === "boolean") changes.archive = body.archive;
    updateGroup(id, user.id, changes);
    const group = readAppState(user.id).groups.find((item) => item.id === id);
    if (!group) return Response.json({ error: "Group not found." }, { status: 404 });
    return Response.json({ group });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update group." }, { status: 400 });
  }
}
