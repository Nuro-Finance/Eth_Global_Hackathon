import { NextRequest, NextResponse } from "next/server";
import { DESIGN_MODE } from "@/config/design-mode";
import { ensUserIdFromRequest } from "@/lib/ens/apiAuth";
import { getEnsIdentity } from "@/lib/ens/mockRegistry";

export async function GET(request: NextRequest) {
  if (!DESIGN_MODE) {
    return NextResponse.json({ error: "ENS identity available in design mode only for now" }, { status: 501 });
  }

  const userId = ensUserIdFromRequest(request);
  return NextResponse.json(getEnsIdentity(userId));
}
