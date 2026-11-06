import { getSignedInUser } from "@/lib/auth";
import { requestEmailChange, requestEmailVerification } from "@/lib/database";
import { emailConfiguration, sendMail } from "@/lib/mail";

export async function POST(request: Request) {
  try {
    const user = await getSignedInUser();
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const body = await request.json() as { currentPassword?: unknown; newEmail?: unknown };
    if (typeof body.currentPassword !== "string" || typeof body.newEmail !== "string") {
      return Response.json({ error: "Enter your password and the new email address." }, { status: 400 });
    }
    const change = requestEmailChange(user.id, body.currentPassword, body.newEmail);
    try {
      emailConfiguration();
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Email delivery is not configured on this server." }, { status: 503 });
    }
    const { baseUrl } = emailConfiguration();
    const confirmUrl = new URL(`/verify-email?token=${encodeURIComponent(change.token)}`, baseUrl).toString();
    try {
      await sendMail({
        to: change.email,
        subject: "Confirm your new SplitMoni email address",
        text: `A request was made to use ${change.email} as your SplitMoni email address. Confirm it: ${confirmUrl}\n\nThis link expires in one hour and can be used once. If you did not request this, you can safely ignore this email.`,
        html: `<p>A request was made to use <strong>${change.email}</strong> as your SplitMoni email address.</p><p><a href="${confirmUrl}">Confirm this email address</a></p><p>This link expires in one hour and can be used once. If you did not request this, you can safely ignore this email.</p>`,
      });
    } catch (error) {
      console.error("Email change confirmation:", error instanceof Error ? error.message : error);
      return Response.json({ error: "Could not deliver the confirmation email. Please try again." }, { status: 502 });
    }
    return Response.json({ ok: true, message: "Check the new email address for a confirmation link. The link expires in one hour." });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not request the email change." }, { status: 400 });
  }
}

export async function PUT() {
  try {
    const user = await getSignedInUser();
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const verification = requestEmailVerification(user.id);
    try {
      emailConfiguration();
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Email delivery is not configured on this server." }, { status: 503 });
    }
    const { baseUrl } = emailConfiguration();
    const verifyUrl = new URL(`/verify-email?token=${encodeURIComponent(verification.token)}`, baseUrl).toString();
    try {
      await sendMail({
        to: verification.email,
        subject: "Verify your SplitMoni email address",
        text: `Verify your SplitMoni email address (${verification.email}): ${verifyUrl}\n\nThis link expires in one hour and can be used once. If you did not request this, you can safely ignore this email.`,
        html: `<p>Verify your SplitMoni email address <strong>${verification.email}</strong>.</p><p><a href="${verifyUrl}">Verify this email address</a></p><p>This link expires in one hour and can be used once. If you did not request this, you can safely ignore this email.</p>`,
      });
    } catch (error) {
      console.error("Email verification delivery:", error instanceof Error ? error.message : error);
      return Response.json({ error: "Could not deliver the verification email. Please try again." }, { status: 502 });
    }
    return Response.json({ ok: true, message: "Check your inbox for a verification link. The link expires in one hour." });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not request email verification." }, { status: 400 });
  }
}
