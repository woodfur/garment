/**
 * Geometry for the palette mood board.
 *
 * Split out from palette-compose.ts purely so it can be tested: that module imports the
 * Supabase client and cannot be loaded by `node --test`. The maths here is what stops
 * figures overlapping each other or running under the swatch column.
 */

export const BOARD_MARGIN = 48;
export const BOARD_GAP = 32;
export const FIGURE_HEIGHT = 1280;
export const SWATCH_WIDTH = 420;

export type MoodBoardLayout = {
  width: number;
  height: number;
  figureWidth: number;
  figureLefts: number[];
  swatchLeft: number;
};

/** Widens to fit however many figures were rendered — one for a single look, two for both genders. */
export function moodBoardLayout(figureCount: number): MoodBoardLayout {
  // One figure keeps the original proportions; several share a narrower width each.
  const figureWidth = figureCount > 1 ? 470 : 690;
  const figuresWidth = figureCount * figureWidth + Math.max(0, figureCount - 1) * BOARD_GAP;

  return {
    width: BOARD_MARGIN * 2 + figuresWidth + BOARD_GAP + SWATCH_WIDTH,
    height: 1400,
    figureWidth,
    figureLefts: Array.from({ length: figureCount }, (_, i) => BOARD_MARGIN + i * (figureWidth + BOARD_GAP)),
    swatchLeft: BOARD_MARGIN + figuresWidth + BOARD_GAP,
  };
}
