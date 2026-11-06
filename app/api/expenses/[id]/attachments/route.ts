import { getSignedInUser } from "@/lib/auth";
import { addExpenseAttachments, assertExpenseAttachmentUploadAccess, listExpenseAttachments } from "@/lib/database";

const MAX_REQUEST_SIZE = 21 * 1024 * 1024;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

class PayloadTooLargeError extends Error {}

async function readBoundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("The upload body is empty.");
  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.byteLength;
      if (totalSize > MAX_REQUEST_SIZE) {
        await reader.cancel();
        throw new PayloadTooLargeError("The total upload size cannot exceed 20 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function detectMimeType(data: Uint8Array) {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => data[index] === value)) return "image/png";
  if (data.length >= 12 && String.fromCharCode(...data.slice(0, 4)) === "RIFF" && String.fromCharCode(...data.slice(8, 12)) === "WEBP") return "image/webp";
  if (data.length >= 5 && String.fromCharCode(...data.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

export async function GET(_request: Request, context: RouteContext<"/api/expenses/[id]/attachments">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id } = await context.params;
    return Response.json({ attachments: listExpenseAttachments(id, user.id) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load receipt files." }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext<"/api/expenses/[id]/attachments">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id } = await context.params;
    assertExpenseAttachmentUploadAccess(id, user.id);
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
      return Response.json({ error: "The total upload size cannot exceed 20 MB." }, { status: 413 });
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
      return Response.json({ error: "Upload receipt files using a multipart form." }, { status: 415 });
    }
    const body = await readBoundedBody(request);
    const formData = await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type")! },
      body,
    }).formData();
    const entries = formData.getAll("files");
    if (entries.length === 0 || entries.some((file) => typeof file === "string" || !(file instanceof File))) {
      return Response.json({ error: "Choose one or more receipt files." }, { status: 400 });
    }
    const files = entries.filter((file): file is File => typeof file !== "string" && file instanceof File);
    if (files.length > 5) return Response.json({ error: "An expense can have up to 5 receipt files." }, { status: 400 });

    const uploads: Array<{ name: string; mimeType: string; data: Uint8Array }> = [];
    for (const file of files) {
      if (file.size === 0 || file.size > MAX_FILE_SIZE) {
        return Response.json({ error: "Each receipt must be a non-empty file no larger than 5 MB." }, { status: 400 });
      }
      const data = new Uint8Array(await file.arrayBuffer());
      const mimeType = detectMimeType(data);
      if (!mimeType || (file.type && file.type !== mimeType)) {
        return Response.json({ error: "Receipts must be valid JPEG, PNG, WebP, or PDF files." }, { status: 400 });
      }
      const name = file.name.replace(/[\\/\u0000-\u001f\u007f]/g, "").trim();
      if (!name || name.length > 180) return Response.json({ error: "Receipt filename is invalid or too long." }, { status: 400 });
      uploads.push({ name, mimeType, data });
    }

    const attachments = addExpenseAttachments(id, user.id, uploads);
    return Response.json({ attachments }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return Response.json({ error: error.message }, { status: 413 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Could not save receipt files." }, { status: 400 });
  }
}
