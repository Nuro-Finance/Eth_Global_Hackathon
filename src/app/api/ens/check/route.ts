import { NextRequest, NextResponse } from "next/server";
import { DESIGN_MODE } from "@/config/design-mode";
import { ensUserIdFromRequest } from "@/lib/ens/apiAuth";
import { checkEnsSlug } from "@/lib/ens/registry";
import type { EnsRecordKind } from "@/lib/ens/types";
import { normalizeEnsSlug } from "@/lib/ens/slug";

export async function GET(request: NextRequest) {
  if (!DESIGN_MODE) {
    return NextResponse.json({ error: "ENS check available in design mode only for now" }, { status: 501 });
  }

  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") ?? "agent") as EnsRecordKind;
  const slug = normalizeEnsSlug(url.searchParams.get("slug") ?? "");
  const businessSlug = url.searchParams.get("businessSlug") ?? undefined;
  const userId = ensUserIdFromRequest(request);

  const result = await checkEnsSlug({ userId, kind, slug, businessSlug });
  return NextResponse.json(result);
}
