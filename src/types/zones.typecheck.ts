import { ZONE_CATEGORIES, ZONE_LAYER_ORDER, ZONE_POSITIONS, STANDARD_ZONES } from "./zones";
import type { BodyZone, UniformCategory } from "./database";

const dressCategory: UniformCategory = "full_body";
const dressZone: BodyZone = "full_body";

void dressCategory;
ZONE_CATEGORIES[dressZone] satisfies UniformCategory;
ZONE_POSITIONS[dressZone].label satisfies string;
STANDARD_ZONES.includes(dressZone) satisfies boolean;
ZONE_LAYER_ORDER.includes(dressZone) satisfies boolean;

export {};
