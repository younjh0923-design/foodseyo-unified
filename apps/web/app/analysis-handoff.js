export const PENDING_ANALYSIS_STORAGE_KEY = "foodseyo.pending-analysis.v1";

const isPendingAnalysis = (value) =>
  value !== null &&
  typeof value === "object" &&
  typeof value.analysisToken === "string" &&
  value.analysisToken.length > 0 &&
  value.analysisToken.length <= 200_000 &&
  value.restaurantScreen !== null &&
  typeof value.restaurantScreen === "object" &&
  typeof value.restaurantScreen.title === "string" &&
  typeof value.restaurantScreen.description === "string" &&
  Array.isArray(value.restaurantScreen.candidates) &&
  (value.language === "en" || value.language === "ko");

export function storePendingAnalysis(storage, value) {
  if (!isPendingAnalysis(value)) return false;
  storage.setItem(PENDING_ANALYSIS_STORAGE_KEY, JSON.stringify(value));
  return true;
}

export function takePendingAnalysis(storage) {
  const serialized = storage.getItem(PENDING_ANALYSIS_STORAGE_KEY);
  storage.removeItem(PENDING_ANALYSIS_STORAGE_KEY);
  if (!serialized) return null;

  try {
    const value = JSON.parse(serialized);
    return isPendingAnalysis(value) ? value : null;
  } catch {
    return null;
  }
}
