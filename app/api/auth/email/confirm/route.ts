import { confirmEmailToken } from "@/lib/database";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?: unknown };
    if (typeof body.token !== "string") {
      return Response.json({ error: "This email link is incomplete. Request a new link." }, { status: 400 });
    }
    const message = confirmEmailToken(body.token);
    return Response.json({ ok: true, message });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not confirm the email change." }, { status: 400 });
  }
}
