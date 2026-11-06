import { resetPassword } from "@/lib/database";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?: unknown; password?: unknown };
    if (typeof body.token !== "string" || typeof body.password !== "string") {
      return Response.json({ error: "Open the password reset link again and choose a new password." }, { status: 400 });
    }
    resetPassword(body.token, body.password);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not reset your password." }, { status: 400 });
  }
}
