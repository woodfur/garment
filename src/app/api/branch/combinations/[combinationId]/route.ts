import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { revalidateTag } from "next/cache";

type Params = { params: Promise<{ combinationId: string }> };

type CombinationRecord = {
  id: string;
  branch_id: string;
  preview_url: string | null;
  male_gif_url: string | null;
  female_gif_url: string | null;
  male_composite_url: string | null;
  female_composite_url: string | null;
};

async function verifyCombination(combinationId: string, branchId: string): Promise<CombinationRecord | null> {
  const admin = createAdminClient();
  // GAP-4 FIX: Select all storage URL columns so DELETE handler can clean up all files.
  const { data } = await (admin as any)
    .from("combinations")
    .select("id, branch_id, preview_url, male_gif_url, female_gif_url, male_composite_url, female_composite_url")
    .eq("id", combinationId)
    .single() as { data: CombinationRecord | null };
  return data?.branch_id === branchId ? data : null;
}

export async function GET(_request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { combinationId } = await params;
  const combo = await verifyCombination(combinationId, auth.branchId);
  if (!combo) return NextResponse.json({ error: "Combination not found" }, { status: 404 });

  try {
    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from("combinations")
      .select(`
        id, name, description, department_ids, all_departments, gender, canvas_data, preview_url, created_at,
        preview_status, male_gif_url, female_gif_url, male_composite_url, female_composite_url,
        combination_items(
          id, uniform_id, layer_order, x, y, scale_x, scale_y, rotation,
          uniforms(id, name, category, image_url, bg_removed)
        )
      `)
      .eq("id", combinationId)
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/branch/combinations/[id]]", err);
    return NextResponse.json({ error: "Failed to fetch combination" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { combinationId } = await params;
  const combo = await verifyCombination(combinationId, auth.branchId);
  if (!combo) return NextResponse.json({ error: "Combination not found" }, { status: 404 });

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      // A blank name would leave the look unidentifiable in every list and on the
      // public share card, so it is rejected rather than silently stored.
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      if (name.length > 120) return NextResponse.json({ error: "Name must be 120 characters or fewer" }, { status: 400 });
      updates.name = name;
    }
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.gender !== undefined) {
      if (body.gender !== "male" && body.gender !== "female") {
        return NextResponse.json({ error: "Gender must be male or female" }, { status: 400 });
      }
      updates.gender = body.gender;
    }
    if (body.canvas_data !== undefined) updates.canvas_data = body.canvas_data;
    if (body.preview_url !== undefined) updates.preview_url = body.preview_url;

    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from("combinations")
      .update(updates)
      .eq("id", combinationId)
      .select()
      .single();

    if (error) throw error;
    revalidateTag(`dashboard-lists-${auth.branchId}`, "default");
    return NextResponse.json(data);
  } catch (err) {
    console.error("[PATCH /api/branch/combinations/[id]]", err);
    return NextResponse.json({ error: "Failed to update combination" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { combinationId } = await params;
  const combo = await verifyCombination(combinationId, auth.branchId);
  if (!combo) return NextResponse.json({ error: "Combination not found" }, { status: 404 });

  try {
    const admin = createAdminClient();

    // GAP-4 FIX: Delete ALL storage files — not just preview_url, but also gif/composite assets.
    // Previously only preview_url was deleted, leaking up to 4 files per combination.
    const storageUrls = [
      combo.preview_url,
      combo.male_gif_url,
      combo.female_gif_url,
      combo.male_composite_url,
      combo.female_composite_url,
    ].filter(Boolean) as string[];

    const pathsToRemove = storageUrls
      .map((url) => url.split("/combination-previews/")[1])
      .filter(Boolean);

    if (pathsToRemove.length > 0) {
      await admin.storage.from("combination-previews").remove(pathsToRemove);
    }

    const db = admin as any;

    // Delete orphaned replicate_jobs for this combination
    // (FK has ON DELETE CASCADE, but being explicit prevents accumulation if cascade changes)
    await db.from("replicate_jobs").delete().eq("combination_id", combinationId);

    const { error } = await db.from("combinations").delete().eq("id", combinationId);
    if (error) throw error;

    revalidateTag(`dashboard-lists-${auth.branchId}`, "default");
    revalidateTag(`dashboard-stats-${auth.branchId}`, "default");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/branch/combinations/[id]]", err);
    return NextResponse.json({ error: "Failed to delete combination" }, { status: 500 });
  }
}
