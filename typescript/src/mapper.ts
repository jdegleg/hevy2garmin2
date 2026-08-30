/** Exercise resolution — TS port of hevy2garmin mapper.py::lookup_exercise. */
import { HEVY_TO_GARMIN, TEMPLATE_TO_GARMIN } from "./exercise-map";

export const UNKNOWN_CATEGORY = 65534;
export const UNKNOWN_SUBCATEGORY = 0;

export type CustomMappings = Record<string, [number, number]>;

/** (category, subcategory, displayName) for a Hevy exercise.
 *  Order: custom user map → template_id (language-independent) → English-name table → sentinel. */
export function lookupExercise(
  hevyName: string,
  templateId?: string | null,
  custom?: CustomMappings,
): { category: number; subcategory: number; displayName: string } {
  if (custom && hevyName in custom) {
    const [c, s] = custom[hevyName];
    return { category: c, subcategory: s, displayName: hevyName };
  }
  if (templateId && templateId in TEMPLATE_TO_GARMIN) {
    const [c, s] = TEMPLATE_TO_GARMIN[templateId];
    return { category: c, subcategory: s, displayName: hevyName };
  }
  if (hevyName in HEVY_TO_GARMIN) {
    const [c, s] = HEVY_TO_GARMIN[hevyName];
    return { category: c, subcategory: s, displayName: hevyName };
  }
  return { category: UNKNOWN_CATEGORY, subcategory: UNKNOWN_SUBCATEGORY, displayName: hevyName };
}
