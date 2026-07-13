/** App-wide mannequin character URLs — generated once via Replicate Flux Dev and stored in the mannequins bucket. */
export const MANNEQUIN_MALE_URL   = process.env.NEXT_PUBLIC_MANNEQUIN_MALE_URL ?? "";
export const MANNEQUIN_FEMALE_URL = process.env.NEXT_PUBLIC_MANNEQUIN_FEMALE_URL ?? "";
export const MANNEQUIN_FEMALE_TWO_PIECE_URL =
  process.env.NEXT_PUBLIC_MANNEQUIN_FEMALE_TWO_PIECE_URL ?? MANNEQUIN_FEMALE_URL;
