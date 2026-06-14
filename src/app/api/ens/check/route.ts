import { NextRequest, NextResponse } from "next/server";
import { ensUserIdFromRequest } from "@/lib/ens/apiAuth";
import { checkEnsSlug } from "@/lib/ens/registry";
import type { EnsRecordKind } from "@/lib/ens/types";
import { normalizeEnsSlug } from "@/lib/ens/slug";

export async function GET(request: NextRequest) {
  const userId = await ensUserIdFromRequest();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") ?? "agent") as EnsRecordKind;
  const slug = normalizeEnsSlug(url.searchParams.get("slug") ?? "");
  const businessSlug = url.searchParams.get("businessSlug") ?? undefined;

  const result = await checkEnsSlug({ userId, kind, slug, businessSlug });
  return NextResponse.json(result);
}
