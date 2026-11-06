import { addInvitations, listGroupInvitations } from "@/lib/database";
import { getSignedInUser } from "@/lib/auth";
import { assertInvitationEmailConfigured, sendGroupInvitation } from "@/lib/invitation-email";

export async function POST(request: Request, context: RouteContext<"/api/groups/[id]/invites">) {
  try {
    const user = await getSignedInUser();
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const { id } = await context.params;
    const body = await request.json() as { emails?: string[] };
    if (!Array.isArray(body.emails) || body.emails.some((email) => typeof email !== "string")) {
      return Response.json({ error: "Enter a list of email addresses." }, { status: 400 });
    }
    listGroupInvitations(id, user.id);
    assertInvitationEmailConfigured();
    const result = addInvitations(id, body.emails, user.id);
    const failures: string[] = [];
    for (const delivery of result.deliveries) {
      try {
        await sendGroupInvitation({ ...delivery, groupName: result.groupName });
      } catch {
        failures.push(delivery.email);
      }
    }
    if (failures.length) {
      return Response.json({
        invites: result.invites,
        error: `Some invitation emails could not be delivered (${failures.length}). They remain pending; resend them after checking email settings.`,
      }, { status: 502 });
    }
    return Response.json({ invites: result.invites, sent: result.deliveries.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not add invitations." }, { status: 400 });
  }
}

export async function GET(_request: Request, context: RouteContext<"/api/groups/[id]/invites">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id } = await context.params;
    return Response.json({ invites: listGroupInvitations(id, user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load invitations." }, { status: 400 });
  }
}
