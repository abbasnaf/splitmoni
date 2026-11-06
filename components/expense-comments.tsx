"use client";

import { useEffect, useState } from "react";

type ExpenseComment = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  canManage: boolean;
};

async function responseError(response: Response, fallback: string) {
  const result = await response.json() as { error?: string };
  return result.error ?? fallback;
}

export function ExpenseComments({ expenseId, readOnly = false }: { expenseId: string; readOnly?: boolean }) {
  const [comments, setComments] = useState<ExpenseComment[]>([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/expenses/${encodeURIComponent(expenseId)}/comments`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response, "Could not load comments."));
        return response.json() as Promise<{ comments: ExpenseComment[] }>;
      })
      .then((result) => {
        if (active) setComments(result.comments);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load comments.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [expenseId]);

  async function submitComment(body: string, commentId?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        commentId
          ? `/api/expenses/${encodeURIComponent(expenseId)}/comments/${encodeURIComponent(commentId)}`
          : `/api/expenses/${encodeURIComponent(expenseId)}/comments`,
        {
          method: commentId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      if (!response.ok) throw new Error(await responseError(response, "Could not save comment."));
      const result = await response.json() as { comment: ExpenseComment };
      setComments((current) => commentId
        ? current.map((comment) => comment.id === commentId ? result.comment : comment)
        : [...current, result.comment]);
      setDraft("");
      setEditingId(null);
      setEditingBody("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save comment.");
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(commentId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response, "Could not delete comment."));
      setComments((current) => current.filter((comment) => comment.id !== commentId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete comment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 sm:p-5" aria-labelledby="expense-comments-heading">
      <h2 id="expense-comments-heading" className="text-lg font-semibold text-white">Comments</h2>
      {loading ? <p className="mt-3 text-sm text-slate-400">Loading comments…</p> : null}
      {!loading && comments.length === 0 ? <p className="mt-3 text-sm text-slate-400">No comments yet.</p> : null}
      <div className="mt-3 space-y-3">
        {comments.map((comment) => (
          <article key={comment.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-200">{comment.authorName}</p>
              <time className="text-xs text-slate-500" dateTime={comment.updatedAt}>{new Date(comment.updatedAt).toLocaleString()}</time>
            </div>
            {editingId === comment.id ? (
              <div className="mt-2 space-y-2">
                <textarea value={editingBody} onChange={(event) => setEditingBody(event.target.value)} maxLength={2000} rows={3} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sw-green" aria-label="Edit comment" />
                <div className="flex justify-end gap-2">
                  <button type="button" disabled={busy} onClick={() => { setEditingId(null); setEditingBody(""); }} className="rounded-full px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50">Cancel</button>
                  <button type="button" disabled={busy || !editingBody.trim()} onClick={() => void submitComment(editingBody, comment.id)} className="rounded-full bg-sw-green px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-50">Save</button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{comment.body}</p>
                {comment.canManage && !readOnly ? <div className="mt-2 flex justify-end gap-3 text-xs">
                  <button type="button" disabled={busy} onClick={() => { setEditingId(comment.id); setEditingBody(comment.body); }} className="text-slate-400 hover:text-sw-green-light disabled:opacity-50">Edit</button>
                  <button type="button" disabled={busy} onClick={() => void removeComment(comment.id)} className="text-slate-400 hover:text-rose-300 disabled:opacity-50">Delete</button>
                </div> : null}
              </>
            )}
          </article>
        ))}
      </div>
      {!readOnly ? (
        <form className="mt-4 space-y-2" onSubmit={(event) => { event.preventDefault(); void submitComment(draft); }}>
          <label htmlFor={`expense-comment-${expenseId}`} className="sr-only">Add a comment</label>
          <textarea id={`expense-comment-${expenseId}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={3} placeholder="Add a note for the group…" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-sw-green" />
          <div className="flex items-center justify-between gap-3">
            <p aria-live="polite" className="text-xs text-rose-300">{error}</p>
            <button type="submit" disabled={busy || !draft.trim()} className="rounded-full bg-sw-green px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-sw-green-light disabled:cursor-not-allowed disabled:opacity-50">Post comment</button>
          </div>
        </form>
      ) : null}
      {readOnly && error ? <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p> : null}
      {!readOnly && error ? <p role="alert" className="sr-only">{error}</p> : null}
    </section>
  );
}
