import type { Gender } from "@/types/database";

/** App-wide mannequin character URLs — generated once via gpt-image-2 and stored in the mannequins bucket. */
export const MANNEQUIN_MALE_URL   = process.env.NEXT_PUBLIC_MANNEQUIN_MALE_URL ?? "";
export const MANNEQUIN_FEMALE_URL = process.env.NEXT_PUBLIC_MANNEQUIN_FEMALE_URL ?? "";
export const MANNEQUIN_FEMALE_TWO_PIECE_URL =
  process.env.NEXT_PUBLIC_MANNEQUIN_FEMALE_TWO_PIECE_URL ?? MANNEQUIN_FEMALE_URL;

/**
 * Base figure to render a look onto, or null when none is configured.
 *
 * Null is a supported outcome rather than an error: gpt-image-2 can render a figure from
 * the prompt alone, so an unconfigured environment still produces previews — it just
 * loses model consistency between looks.
 */
export function baseFigureUrlFor(gender: Gender, isTwoPiece: boolean): string | null {
  if (gender === "male") return MANNEQUIN_MALE_URL || null;
  return (isTwoPiece ? MANNEQUIN_FEMALE_TWO_PIECE_URL : MANNEQUIN_FEMALE_URL) || null;
}
