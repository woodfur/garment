import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/api-auth";
import { revalidateTag } from "next/cache";
import type { Branch } from "@/types/database";

export async function POST(request: Request) {
  // GAP-1 FIX: Require super_admin auth — this was completely unprotected
  const result = await requireSuperAdmin();
  if (result instanceof NextResponse) return result;

  try {
    const body = await request.json();
    const { name, slug, view_code } = body as { name?: string; slug?: string; view_code?: string };

    if (!name?.trim() || !slug?.trim() || !view_code?.trim()) {
      return NextResponse.json({ error: "Name, slug, and view code are required" }, { status: 400 });
    }

    // GAP-7 FIX: Validate slug/view_code format before using in filter (prevent filter injection)
    const slugPattern = /^[a-z0-9-]+$/;
    if (!slugPattern.test(slug) || !slugPattern.test(view_code)) {
      return NextResponse.json(
        { error: "Slug and view code must contain only lowercase letters, numbers, and hyphens" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // GAP-7 FIX: Use separate parameterised queries instead of .or() with string interpolation
    const { data: slugExisting } = await supabase.from("branches").select("id").eq("slug", slug).maybeSingle();
    const { data: codeExisting } = await supabase.from("branches").select("id").eq("view_code", view_code).maybeSingle();

    if (slugExisting || codeExisting) {
      return NextResponse.json({ error: "A branch with that slug or view code already exists" }, { status: 409 });
    }

    const { data: branch, error } = (await (supabase as any)
      .from("branches")
      .insert({ name: name.trim(), slug, view_code })
      .select()
      .single()) as unknown as { data: Branch | null; error: unknown };

    if (error) throw error;

    revalidateTag("branches", "default");

    return NextResponse.json({ branch }, { status: 201 });
  } catch (err) {
    console.error("Create branch error:", err);
    return NextResponse.json({ error: "Failed to create branch" }, { status: 500 });
  }
}
