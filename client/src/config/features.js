export const FEATURES = {
  tickets: false,
  reports: false,
}

export function isFeatureEnabled(feature) {
  return FEATURES[feature] !== false
}
