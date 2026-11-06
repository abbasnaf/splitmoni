export type ExpenseAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: string;
  canDelete: boolean;
};

async function attachmentResponse(response: Response) {
  const result = await response.json() as { attachments?: ExpenseAttachment[]; error?: string };
  if (!response.ok || !result.attachments) {
    throw new Error(result.error ?? "Could not update receipt files.");
  }
  return result.attachments;
}

export async function listExpenseAttachments(expenseId: string) {
  const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}/attachments`, { cache: "no-store" });
  return attachmentResponse(response);
}

export async function uploadExpenseAttachments(expenseId: string, files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file, file.name));
  const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}/attachments`, {
    method: "POST",
    body: formData,
  });
  return attachmentResponse(response);
}

export async function removeExpenseAttachment(expenseId: string, attachmentId: string) {
  const response = await fetch(
    `/api/expenses/${encodeURIComponent(expenseId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE" },
  );
  return attachmentResponse(response);
}
