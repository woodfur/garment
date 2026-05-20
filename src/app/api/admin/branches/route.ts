import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidateTag } from "next/cache";
import type { Branch } from "@/types/database";

export async function POST(request: Request) {
  try {
    const { name, slug, view_code } = await request.json();

    if (!name || !slug || !view_code) {
      return NextResponse.json({ error: "Name, slug, and view code are required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Check for duplicate slug or view_code
    const { data: existing } = (await supabase
      .from("branches")
      .select("id")
      .or(`slug.eq.${slug},view_code.eq.${view_code}`)
      .maybeSingle()) as unknown as { data: Pick<Branch, "id"> | null };

    if (existing) {
      return NextResponse.json({ error: "A branch with that slug or view code already exists" }, { status: 409 });
    }

    const { data: branch, error } = (await (supabase as any)
      .from("branches")
      .insert({ name, slug, view_code })
      .select()
      .single()) as unknown as { data: Branch | null; error: unknown };

    if (error) throw error;

    // Invalidate dashboard-stats and branches-list caches immediately
    revalidateTag("branches", "default");

    return NextResponse.json({ branch }, { status: 201 });
  } catch (err) {
    console.error("Create branch error:", err);
    return NextResponse.json({ error: "Failed to create branch" }, { status: 500 });
  }
}
