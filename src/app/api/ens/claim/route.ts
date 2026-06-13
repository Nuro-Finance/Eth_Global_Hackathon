import { NextRequest, NextResponse } from "next/server";
import { DESIGN_MODE } from "@/config/design-mode";
import { ensUserIdFromRequest } from "@/lib/ens/apiAuth";
import { claimEnsName } from "@/lib/ens/registry";
import type { EnsRecordKind, EnsVisibility } from "@/lib/ens/types";

export async function POST(request: NextRequest) {
  if (!DESIGN_MODE) {
    return NextResponse.json({ error: "ENS claim available in design mode only for now" }, { status: 501 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const kind = (body.kind ?? "agent") as EnsRecordKind;
    const slug = String(body.slug ?? "");
    const visibility = (body.visibility ?? "private") as EnsVisibility;
    const address = typeof body.address === "string" ? body.address : undefined;
    const userId = ensUserIdFromRequest(request);

    const result = await claimEnsName({ userId, kind, slug, visibility, address });
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Claim failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
