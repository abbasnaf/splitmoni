import { authenticateAccount, createAccount, createSession, deleteSession, requestEmailVerification } from "@/lib/database";
import { getSessionToken, getSignedInUser, setSessionCookie } from "@/lib/auth";
import { emailConfiguration, sendMail } from "@/lib/mail";

export async function GET() {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  return Response.json({ user });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; name?: string; email?: string; password?: string };
    const email = body.email ?? "";
    const password = body.password ?? "";
    const user = body.action === "register"
      ? createAccount({ name: body.name ?? "", email, password })
      : authenticateAccount(email, password);
    if (body.action === "register" && !user.emailVerifiedAt) {
      /*
       * Verification emails are best-effort at sign-up; mailer misconfiguration
       * must not block account creation. Users can re-request from settings.
       */
      try {
        const { baseUrl } = emailConfiguration();
        const verification = requestEmailVerification(user.id);
        const verifyUrl = new URL(`/verify-email?token=${encodeURIComponent(verification.token)}`, baseUrl).toString();
        await sendMail({
          to: verification.email,
          subject: "Verify your SplitMoni email address",
          text: `Verify your SplitMoni email address (${verification.email}): ${verifyUrl}\n\nThis link expires in one hour and can be used once. If you did not request this, you can safely ignore this email.`,
          html: `<p>Verify your SplitMoni email address <strong>${verification.email}</strong>.</p><p><a href="${verifyUrl}">Verify this email address</a></p><p>This link expires in one hour and can be used once. If you did not request this, you can safely ignore this email.</p>`,
        });
      } catch (error) {
        console.error("Sign-up verification email not sent:", error instanceof Error ? error.message : error);
      }
    }
    const session = createSession(user.id);
    return setSessionCookie(Response.json({ user }), session.token);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not sign in." }, { status: 400 });
  }
}

export async function DELETE() {
  const token = await getSessionToken();
  if (token) deleteSession(token);
  return setSessionCookie(Response.json({ ok: true }), "", 0);
}
