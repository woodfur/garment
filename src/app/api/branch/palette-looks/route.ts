import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { persistPreviewImage, renderPaletteLookImage } from "@/lib/preview-render";
import { baseFigureUrlFor } from "@/lib/mannequin-config";
import {
  buildPaletteLookName,
  createPaletteMoodBoard,
  uploadPaletteMoodBoard,
  validatePalette,
} from "@/lib/palette-compose";
import type { Gender } from "@/types/database";

// gpt-image-2 at high quality takes well over a minute for a full-body render.
export const maxDuration = 300;

type PaletteLooksQuery = {
  select(columns: string): PaletteLooksQuery;
  eq(column: string, value: string): PaletteLooksQuery;
  single(): Promise<{ data: unknown; error: Error | null }>;
  insert(value: Record<string, unknown>): PaletteLooksQuery;
  update(value: Record<string, unknown>): PaletteLooksQuery;
};

type PaletteLooksDb = {
  from(table: string): PaletteLooksQuery;
};

function isGender(value: unknown): value is Gender {
  return value === "male" || value === "female";
}

export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const admin = createAdminClient();
  const db = admin as unknown as PaletteLooksDb;
  let combinationId: string | null = null;

  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;
    const departmentId = typeof body.department_id === "string" ? body.department_id : "";
    const gender = isGender(body.gender) ? body.gender : null;
    const palette = validatePalette(body.palette);

    if (!departmentId) return NextResponse.json({ error: "Department is required" }, { status: 400 });
    if (!gender) return NextResponse.json({ error: "Gender is required" }, { status: 400 });

    const { data: department } = await db
      .from("departments")
      .select("id, name")
      .eq("id", departmentId)
      .eq("branch_id", auth.branchId)
      .single() as { data: { id: string; name: string } | null };

    if (!department) return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    const lookName = buildPaletteLookName(name, department.name);

    const { data: combination, error: comboErr } = await db
      .from("combinations")
      .insert({
        name: lookName,
        description,
        department_id: departmentId,
        gender,
        branch_id: auth.branchId,
        created_by: auth.userId,
        preview_status: "processing",
        canvas_data: {
          mode: "palette",
          palette,
        },
      })
      .select("id, name, description, department_id, gender, canvas_data, preview_url, preview_status, created_at")
      .single() as { data: { id: string } | null; error: Error | null };

    if (comboErr || !combination) throw comboErr ?? new Error("Failed to create palette look");
    combinationId = combination.id;

    const personImage = await renderPaletteLookImage({
      departmentName: department.name,
      gender,
      palette,
      baseFigureUrl: baseFigureUrlFor(gender, false),
    });
    const personImageUrl = await persistPreviewImage(personImage, combination.id, gender);
    const board = await createPaletteMoodBoard({
      personImage,
      palette,
      title: lookName,
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
        [gender === "male" ? "male_composite_url" : "female_composite_url"]: personImageUrl,
      })
      .eq("id", combinationId)
      .select("id, name, description, department_id, gender, canvas_data, preview_url, preview_status, created_at")
      .single() as { data: unknown | null; error: Error | null };

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
