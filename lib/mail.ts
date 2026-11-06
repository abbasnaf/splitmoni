import "server-only";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export function emailConfiguration() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SPLITMONI_FROM_EMAIL;
  const appUrl = process.env.APP_URL;
  if (!apiKey || !from || !appUrl) {
    throw new Error("Email sending is not configured. Set RESEND_API_KEY, SPLITMONI_FROM_EMAIL, and APP_URL.");
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(appUrl);
  } catch {
    throw new Error("APP_URL must be an absolute URL.");
  }
  if (process.env.NODE_ENV === "production" && baseUrl.protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS in production.");
  }
  return { apiKey, from, baseUrl };
}

export function assertEmailConfigured() {
  emailConfiguration();
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

export async function sendMail(message: MailMessage) {
  const { apiKey, from } = emailConfiguration();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  if (!response.ok) {
    console.error("Email delivery to", message.to, "failed with status:", response.status);
    throw new Error(`Could not deliver the email to ${message.to}. Check the email provider configuration and try again.`);
  }
}
