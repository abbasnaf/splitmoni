import { getSignedInUser } from "@/lib/auth";
import { getInvitation, respondToInvitation } from "@/lib/database";

export async function GET(_request: Request, context: RouteContext<"/api/invitations/[token]">) {
  const { token } = await context.params;
  const invite = getInvitation(token);
  if (!invite) return Response.json({ error: "This invitation link is invalid or has already been used." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json({
    invitation: {
      groupName: invite.groupName,
      email: invite.email,
      status: invite.archived && invite.status === "pending" ? "revoked" : invite.status,
      archived: invite.archived,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: RouteContext<"/api/invitations/[token]">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in with the invited email address to respond." }, { status: 401 });
  try {
    const body = await request.json() as { action?: unknown };
    if (body.action !== "accept" && body.action !== "decline") {
      return Response.json({ error: "Choose whether to accept or decline this invitation." }, { status: 400 });
    }
    const { token } = await context.params;
    const groupId = respondToInvitation(token, user.id, body.action);
    return Response.json({ groupId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not respond to invitation." }, { status: 400 });
  }
}
