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
import { sanitizePaletteNotes } from "@/lib/palette-prompt";
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
    // Palette looks are not department-scoped: they describe colours, so they apply to
    // every department automatically, including ones added later. Nothing is asked for
    // in the form and nothing is read off the request.
    const scope = { department_ids: [] as string[], all_departments: true };
    const notes = sanitizePaletteNotes(body.notes);
    const palette = validatePalette(body.palette);


    const lookName = buildPaletteLookName(name, palette);

    const { data: combination, error: comboErr } = await db
      .from("combinations")
      .insert({
        name: lookName,
        description,
        department_ids: scope.department_ids,
        all_departments: scope.all_departments,
        // Deliberately null: a palette is a colour scheme for a whole department, so the
        // look carries a figure for each gender and slots into either schedule assignment.
        gender: null,
        branch_id: auth.branchId,
        created_by: auth.userId,
        preview_status: "processing",
        canvas_data: {
          mode: "palette",
          palette,
          // Kept so the look records the direction it was generated from.
          ...(notes ? { notes } : {}),
        },
      })
      .select("id, name, description, department_ids, all_departments, gender, canvas_data, preview_url, preview_status, created_at")
      .single() as { data: { id: string } | null; error: Error | null };

    if (comboErr || !combination) throw comboErr ?? new Error("Failed to create palette look");
    combinationId = combination.id;

    // Both figures from the same palette, in parallel. Departments have men and women, so
    // a colour scheme needs both; rendering one would leave the other slot unfillable.
    const genders: Gender[] = ["female", "male"];
    const rendered = await Promise.all(
      genders.map(async (figure) => ({
        gender: figure,
        image: await renderPaletteLookImage({
          gender: figure,
          palette,
          notes,
          baseFigureUrl: baseFigureUrlFor(figure, false),
        }),
      }))
    );

    const persisted = await Promise.all(
      rendered.map(async (entry) => ({
        gender: entry.gender,
        url: await persistPreviewImage(entry.image, combination.id, entry.gender),
      }))
    );

    const board = await createPaletteMoodBoard({
      personImages: rendered.map((entry) => entry.image),
      palette,
      title: lookName,
      subtitle: "All departments",
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
        male_composite_url: persisted.find((entry) => entry.gender === "male")?.url ?? null,
        female_composite_url: persisted.find((entry) => entry.gender === "female")?.url ?? null,
      })
      .eq("id", combinationId)
      .select("id, name, description, department_ids, all_departments, gender, canvas_data, preview_url, preview_status, created_at")
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
