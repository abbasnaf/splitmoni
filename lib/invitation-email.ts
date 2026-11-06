import "server-only";
import { emailConfiguration, escapeHtml, sendMail } from "@/lib/mail";

type InvitationEmail = {
  email: string;
  groupName: string;
  token: string;
};

export function assertInvitationEmailConfigured() {
  emailConfiguration();
}

export async function sendGroupInvitation({ email, groupName, token }: InvitationEmail) {
  const { baseUrl } = emailConfiguration();
  const inviteUrl = new URL(`/invitations/${encodeURIComponent(token)}`, baseUrl).toString();
  const safeGroupName = escapeHtml(groupName);
  await sendMail({
    to: email,
    subject: `Join ${groupName} on SplitMoni`,
    text: `You have been invited to join "${groupName}" on SplitMoni. Accept or decline this invitation: ${inviteUrl}\n\nThis link expires in 7 days.`,
    html: `<p>You have been invited to join <strong>${safeGroupName}</strong> on SplitMoni.</p><p><a href="${inviteUrl}">Review invitation</a></p><p>This link expires in 7 days. You must sign in with ${escapeHtml(email)} to accept.</p>`,
  });
}
