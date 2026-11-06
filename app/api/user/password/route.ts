import { getSessionToken, getSignedInUser } from "@/lib/auth";
import { changePassword } from "@/lib/database";

export async function PUT(request: Request) {
  try {
    const user = await getSignedInUser();
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const body = await request.json() as { currentPassword?: unknown; newPassword?: unknown };
    if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
      return Response.json({ error: "Enter your current password and a new password." }, { status: 400 });
    }
    const token = await getSessionToken();
    changePassword(user.id, body.currentPassword, body.newPassword, token ?? undefined);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not change your password." }, { status: 400 });
  }
}
