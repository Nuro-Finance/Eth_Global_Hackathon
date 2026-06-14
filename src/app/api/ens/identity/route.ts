import { NextResponse } from "next/server";
import { ensUserIdFromRequest } from "@/lib/ens/apiAuth";
import { getEnsIdentity } from "@/lib/ens/registry";

export async function GET() {
  const userId = await ensUserIdFromRequest();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await getEnsIdentity(userId));
}
