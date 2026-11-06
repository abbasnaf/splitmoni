import { getSignedInUser, setSessionCookie } from "@/lib/auth";
import { deleteAccount, updateUserProfile } from "@/lib/database";

export async function PATCH(request: Request) {
  try {
    const user = await getSignedInUser();
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const body = await request.json() as { name?: unknown; defaultCurrency?: unknown };
    if (body.name !== undefined && typeof body.name !== "string") {
      return Response.json({ error: "Enter a name between 2 and 80 characters." }, { status: 400 });
    }
    if (body.defaultCurrency !== undefined && typeof body.defaultCurrency !== "string") {
      return Response.json({ error: "Choose a supported currency." }, { status: 400 });
    }
    const updated = updateUserProfile(user.id, { name: body.name, defaultCurrency: body.defaultCurrency });
    return Response.json({ user: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update your profile." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getSignedInUser();
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const body = await request.json() as { currentPassword?: unknown };
    if (typeof body.currentPassword !== "string" || !body.currentPassword) {
      return Response.json({ error: "Enter your password to confirm account deletion." }, { status: 400 });
    }
    deleteAccount(user.id, body.currentPassword);
    return setSessionCookie(
      Response.json({ ok: true, message: "Your account was deleted. Groups you owned alone were removed; groups with shared history keep an anonymized record." }),
      "",
      0,
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete your account." }, { status: 400 });
  }
}
