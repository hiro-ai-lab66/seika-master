import type { InspectionEntry } from '../types';

export const upsertInspectionSnapshot = (
  inspections: InspectionEntry[],
  savedEntry: InspectionEntry
): InspectionEntry[] => {
  const existingIndex = inspections.findIndex((entry) => entry.date === savedEntry.date);
  if (existingIndex === -1) {
    return [savedEntry, ...inspections];
  }

  return inspections.map((entry, index) => index === existingIndex ? savedEntry : entry);
};
