import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { generatePalettePersonImage } from "@/lib/replicate";
import {
  buildPalettePrompt,
  createPaletteMoodBoard,
  uploadPaletteMoodBoard,
  validatePalette,
} from "@/lib/palette-compose";

export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const admin = createAdminClient();
  const db = admin as any;
  let combinationId: string | null = null;

  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;
    const departmentId = typeof body.department_id === "string" ? body.department_id : "";
    const palette = validatePalette(body.palette);

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!departmentId) return NextResponse.json({ error: "Department is required" }, { status: 400 });

    const { data: department } = await db
      .from("departments")
      .select("id, name")
      .eq("id", departmentId)
      .eq("branch_id", auth.branchId)
      .single() as { data: { id: string; name: string } | null };

    if (!department) return NextResponse.json({ error: "Invalid department" }, { status: 400 });

    const { data: combination, error: comboErr } = await db
      .from("combinations")
      .insert({
        name,
        description,
        department_id: departmentId,
        branch_id: auth.branchId,
        created_by: auth.userId,
        preview_status: "processing",
        canvas_data: {
          mode: "palette",
          palette,
        },
      })
      .select("id, name, description, department_id, canvas_data, preview_url, preview_status, created_at")
      .single();

    if (comboErr || !combination) throw comboErr ?? new Error("Failed to create palette look");
    combinationId = combination.id;

    const prompt = buildPalettePrompt({ departmentName: department.name, palette });
    const personImageUrl = await generatePalettePersonImage(prompt);
    const board = await createPaletteMoodBoard({
      personImageUrl,
      palette,
      title: name,
      departmentName: department.name,
    });
    const previewUrl = await uploadPaletteMoodBoard({
      branchId: auth.branchId,
      combinationId: combination.id,
      image: board,
    });

    const { data: updated, error: updateErr } = await db
      .from("combinations")
      .update({
        preview_url: previewUrl,
        preview_status: "ready",
        male_composite_url: personImageUrl,
      })
      .eq("id", combinationId)
      .select("id, name, description, department_id, canvas_data, preview_url, preview_status, created_at")
      .single();

    if (updateErr || !updated) throw updateErr ?? new Error("Failed to save palette preview");

    revalidateTag(`dashboard-lists-${auth.branchId}`, "default");
    revalidateTag(`dashboard-stats-${auth.branchId}`, "default");

    return NextResponse.json(updated, { status: 201 });
  } catch (err) {
    console.error("[POST /api/branch/palette-looks]", err);

    if (combinationId) {
      await db.from("combinations").update({ preview_status: "failed" }).eq("id", combinationId);
    }

    const message = err instanceof Error ? err.message : "Failed to create palette look";
    const status = message.includes("at least two") || message.includes("no more than five") || message.includes("hex")
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
