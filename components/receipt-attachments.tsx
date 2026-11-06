"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  listExpenseAttachments,
  removeExpenseAttachment,
  type ExpenseAttachment,
} from "@/lib/receipt-store";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export function ReceiptAttachments({
  expenseId,
  files,
  onFilesChange,
  disabled = false,
}: {
  expenseId: string | null;
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(expenseId));
  const [removingId, setRemovingId] = useState("");

  useEffect(() => {
    if (!expenseId) return;
    let active = true;
    listExpenseAttachments(expenseId)
      .then((result) => {
        if (active) setAttachments(result);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load receipt files.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [expenseId]);

  const chooseFiles = (selected: FileList | null) => {
    if (!selected?.length) return;
    const newFiles = Array.from(selected);
    const occupied = attachments.length + files.length;
    if (occupied + newFiles.length > 5) {
      setError("An expense can have up to 5 receipt files.");
      return;
    }
    if (newFiles.some((file) => !allowedTypes.has(file.type) || file.size === 0 || file.size > MAX_FILE_SIZE)) {
      setError("Choose JPEG, PNG, WebP, or PDF files no larger than 5 MB each.");
      return;
    }
    if ([...files, ...newFiles].reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) {
      setError("The total upload size cannot exceed 20 MB.");
      return;
    }
    setError("");
    onFilesChange([...files, ...newFiles]);
  };

  const removeAttachment = async (attachment: ExpenseAttachment) => {
    if (!expenseId) return;
    setRemovingId(attachment.id);
    setError("");
    try {
      setAttachments(await removeExpenseAttachment(expenseId, attachment.id));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove receipt.");
    } finally {
      setRemovingId("");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Receipts</h2>
        <p className="mt-1 text-sm text-slate-400">Attach up to 5 JPEG, PNG, WebP, or PDF files (5 MB each). Group members can view them.</p>
      </div>

      <label className="mt-4 block space-y-2 text-sm text-slate-300">
        <span>Add receipt files</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          disabled={disabled || attachments.length + files.length >= 5}
          onChange={(event) => {
            chooseFiles(event.target.files);
            event.target.value = "";
          }}
          className="block w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-200 disabled:opacity-50"
        />
      </label>

      {files.length ? (
        <ul className="mt-3 space-y-2" aria-label="Receipts ready to upload">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm">
              <span className="min-w-0 truncate text-slate-300">{file.name} <span className="text-xs text-slate-500">· {(file.size / (1024 * 1024)).toFixed(1)} MB · ready to upload</span></span>
              <button type="button" disabled={disabled} onClick={() => onFilesChange(files.filter((_, fileIndex) => fileIndex !== index))} className="shrink-0 text-xs font-medium text-rose-300 hover:text-rose-200 disabled:opacity-50">
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {loading ? <p className="mt-4 text-sm text-slate-500">Loading saved receipts...</p> : null}
      {attachments.length ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Saved receipts">
          {attachments.map((attachment) => {
            const url = `/api/expenses/${encodeURIComponent(expenseId ?? "")}/attachments/${encodeURIComponent(attachment.id)}`;
            return (
              <li key={attachment.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
                {attachment.mimeType.startsWith("image/") ? (
                  <a href={url} target="_blank" rel="noreferrer" className="block bg-slate-950">
                    <Image src={url} alt={`Receipt: ${attachment.name}`} width={640} height={320} unoptimized className="h-40 w-full object-contain" />
                  </a>
                ) : (
                  <div className="flex h-24 items-center justify-center bg-slate-950 text-sm font-semibold uppercase tracking-widest text-slate-500">PDF receipt</div>
                )}
                <div className="flex items-center justify-between gap-2 p-3 text-sm">
                  <a href={url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sw-green-light hover:underline">{attachment.name}</a>
                  {attachment.canDelete ? (
                    <button
                      type="button"
                      disabled={Boolean(removingId) || disabled}
                      onClick={() => {
                        if (window.confirm(`Remove receipt "${attachment.name}"?`)) void removeAttachment(attachment);
                      }}
                      className="shrink-0 text-xs font-medium text-rose-300 hover:text-rose-200 disabled:opacity-50"
                    >
                      {removingId === attachment.id ? "Removing..." : "Remove"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {error ? <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}
