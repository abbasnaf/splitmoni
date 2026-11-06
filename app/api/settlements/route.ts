import { recordSettlement, type RecordedSettlement } from "@/lib/database";
import { getSignedInUser } from "@/lib/auth";


export async function POST(request: Request) {
  try {
    const user = await getSignedInUser();
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const settlement = await request.json() as Omit<RecordedSettlement, "status" | "date">;
    recordSettlement(settlement, user.id);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not record settlement." }, { status: 400 });
  }
}
