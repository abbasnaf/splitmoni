import { getSignedInUser } from "@/lib/auth";
import { readAppState, removeGroupMember } from "@/lib/database";

export async function DELETE(_request: Request, context: RouteContext<"/api/groups/[id]/members/[memberId]">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id, memberId } = await context.params;
    removeGroupMember(id, memberId, user.id);
    const state = readAppState(user.id);
    const group = state.groups.find((item) => item.id === id);
    if (!group) return Response.json({ error: "Group not found." }, { status: 404 });
    return Response.json({ group, users: state.users });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove group member." }, { status: 400 });
  }
}
