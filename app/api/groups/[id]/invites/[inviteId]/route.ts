import { listGroupInvitations, resendInvitation, revokeInvitation } from "@/lib/database";
import { getSignedInUser } from "@/lib/auth";
import { assertInvitationEmailConfigured, sendGroupInvitation } from "@/lib/invitation-email";

export async function POST(_request: Request, context: RouteContext<"/api/groups/[id]/invites/[inviteId]">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id, inviteId } = await context.params;
    listGroupInvitations(id, user.id);
    assertInvitationEmailConfigured();
    const result = resendInvitation(id, inviteId, user.id);
    await sendGroupInvitation({ ...result.delivery, groupName: result.groupName });
    const invites = listGroupInvitations(id, user.id);
    return Response.json({ invites });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not resend invitation." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/groups/[id]/invites/[inviteId]">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id, inviteId } = await context.params;
    const invites = revokeInvitation(id, inviteId, user.id);
    return Response.json({ invites });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not revoke invitation." }, { status: 400 });
  }
}
