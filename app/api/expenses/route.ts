import { saveExpense } from "@/lib/database";
import type { Expense } from "@/lib/split-engine";
import { getSignedInUser } from "@/lib/auth";


export async function POST(request: Request) {
  try {
    const user = await getSignedInUser();
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const expense = await request.json() as Expense;
    saveExpense(expense, user.id);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save expense." }, { status: 400 });
  }
}
