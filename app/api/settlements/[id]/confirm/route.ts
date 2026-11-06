import { getSignedInUser } from "@/lib/auth";
import { confirmSettlement } from "@/lib/database";

export async function POST(_request: Request, context: RouteContext<"/api/settlements/[id]/confirm">) {
  const user = await getSignedInUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const { id } = await context.params;
    confirmSettlement(id, user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not confirm repayment." }, { status: 400 });
  }
}
