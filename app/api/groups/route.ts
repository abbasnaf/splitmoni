import { createGroup } from "@/lib/database";
import { getSignedInUser } from "@/lib/auth";


export async function POST(request: Request) {
  try {
    const user = await getSignedInUser();
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const body = await request.json() as { group?: { id?: unknown; name?: unknown; currency?: unknown } };
    if (!body.group || typeof body.group.id !== "string" || typeof body.group.name !== "string" || typeof body.group.currency !== "string") {
      return Response.json({ error: "Enter a valid group name and currency." }, { status: 400 });
    }
    const newGroup = { id: body.group.id, name: body.group.name, currency: body.group.currency, members: [user.id] };
    createGroup({ group: newGroup }, user.id);
    const group = {
      ...newGroup,
      name: newGroup.name.trim(),
      createdBy: user.id,
      archivedAt: null,
      hasLedgerActivity: false,
    };
    return Response.json({ ok: true, group }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create group." }, { status: 400 });
  }
}
