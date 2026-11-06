import { generateDueRecurringExpensesForUser, readAppState } from "@/lib/database";
import { connection } from "next/server";
import { getSignedInUser } from "@/lib/auth";


export async function GET() {
  await connection();
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  generateDueRecurringExpensesForUser(user.id);
  return Response.json(readAppState(user.id), { headers: { "Cache-Control": "no-store" } });
}
