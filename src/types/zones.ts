import type { BodyZone } from "./database";

export type { Gender, BodyZone, PreviewStatus } from "./database";

/** Hotspot positions as percentage of silhouette image dimensions.
 *  Values are initial estimates — calibrate after reviewing generated character images. */
export const ZONE_POSITIONS: Record<BodyZone, { x: number; y: number; label: string }> = {
  head:                  { x: 50, y: 10,  label: "Head" },
  top:                   { x: 50, y: 32,  label: "Top" },
  outer:                 { x: 50, y: 28,  label: "Outer" },
  bottom:                { x: 50, y: 58,  label: "Bottom" },
  footwear:              { x: 50, y: 88,  label: "Footwear" },
  accessory_neck:        { x: 50, y: 22,  label: "Neck" },
  accessory_wrist_left:  { x: 28, y: 45,  label: "Wrist (L)" },
  accessory_wrist_right: { x: 72, y: 45,  label: "Wrist (R)" },
  accessory_belt:        { x: 50, y: 50,  label: "Belt" },
  accessory_chest_pin:   { x: 40, y: 30,  label: "Chest Pin" },
  accessory_bag:         { x: 75, y: 55,  label: "Bag" },
};

/** Uniform category that maps to each zone */
export const ZONE_CATEGORIES: Record<BodyZone, string> = {
  head:                  "head",
  top:                   "top",
  outer:                 "outer",
  bottom:                "bottom",
  footwear:              "footwear",
  accessory_neck:        "accessory",
  accessory_wrist_left:  "accessory",
  accessory_wrist_right: "accessory",
  accessory_belt:        "accessory",
  accessory_chest_pin:   "accessory",
  accessory_bag:         "accessory",
};

/** Body zones in layering order — outermost items composited last */
export const ZONE_LAYER_ORDER: BodyZone[] = [
  "top",
  "outer",
  "bottom",
  "footwear",
  "head",
  "accessory_neck",
  "accessory_chest_pin",
  "accessory_belt",
  "accessory_wrist_left",
  "accessory_wrist_right",
  "accessory_bag",
];

/** Standard body zones (non-accessory) */
export const STANDARD_ZONES: BodyZone[] = ["head", "top", "outer", "bottom", "footwear"];

/** Accessory zones */
export const ACCESSORY_ZONES: BodyZone[] = [
  "accessory_neck",
  "accessory_wrist_left",
  "accessory_wrist_right",
  "accessory_belt",
  "accessory_chest_pin",
  "accessory_bag",
];
