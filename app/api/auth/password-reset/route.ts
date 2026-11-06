import { createPasswordReset } from "@/lib/database";
import { emailConfiguration, sendMail } from "@/lib/mail";

/*
 * The response is identical whether or not the email address has an account,
 * so password reset cannot be used to discover registered accounts.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: unknown };
    if (typeof body.email !== "string") {
      return Response.json({ error: "Enter your email address." }, { status: 400 });
    }
    try {
      emailConfiguration();
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Email delivery is not configured on this server." }, { status: 503 });
    }
    const token = createPasswordReset(body.email);
    if (token) {
      const { baseUrl } = emailConfiguration();
      const resetUrl = new URL(`/reset-password?token=${encodeURIComponent(token)}`, baseUrl).toString();
      try {
        await sendMail({
          to: body.email.trim(),
          subject: "Reset your SplitMoni password",
          text: `You requested a password reset for your SplitMoni account. Set a new password: ${resetUrl}\n\nThis link expires in one hour and can be used once. If you did not request a reset, you can safely ignore this email.`,
          html: `<p>You requested a password reset for your SplitMoni account.</p><p><a href="${resetUrl}">Choose a new password</a></p><p>This link expires in one hour and can be used once. If you did not request a reset, you can safely ignore this email.</p>`,
        });
      } catch (error) {
        console.error("Password reset confirmation:", error instanceof Error ? error.message : error);
        return Response.json({ error: "Could not deliver the password reset email. Please try again." }, { status: 502 });
      }
    }
    return Response.json({ ok: true, message: "If an account exists for that email address, a reset link has been sent. The link expires in one hour." });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not request a password reset." }, { status: 400 });
  }
}
