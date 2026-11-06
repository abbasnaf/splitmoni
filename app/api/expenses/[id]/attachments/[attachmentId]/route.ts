import { getSignedInUser } from "@/lib/auth";
import { getExpenseAttachment, removeExpenseAttachment } from "@/lib/database";

function encodedFilename(name: string) {
  return encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function GET(_request: Request, context: RouteContext<"/api/expenses/[id]/attachments/[attachmentId]">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id, attachmentId } = await context.params;
    const attachment = getExpenseAttachment(id, attachmentId, user.id);
    if (!attachment) return Response.json({ error: "Receipt not found." }, { status: 404 });
    const inline = attachment.mimeType.startsWith("image/");
    return new Response(new Uint8Array(attachment.data), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(attachment.size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedFilename(attachment.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load receipt." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/expenses/[id]/attachments/[attachmentId]">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id, attachmentId } = await context.params;
    return Response.json({ attachments: removeExpenseAttachment(id, attachmentId, user.id) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove receipt." }, { status: 400 });
  }
}
