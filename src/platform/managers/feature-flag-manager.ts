import {
  FEATURE_KEYS,
  hasFeature,
  type FeatureKey,
} from "@/platform/managers/package-manager";

export { FEATURE_KEYS, type FeatureKey };

const ENV_FLAG_PREFIX = "VYRON_FEATURE_";

function readEnvFeatureOverride(feature: FeatureKey): boolean | null {
  if (typeof process === "undefined") return null;
  const envKey = `${ENV_FLAG_PREFIX}${feature.toUpperCase()}`;
  const value = process.env[envKey];
  if (value === "1" || value?.toLowerCase() === "true") return true;
  if (value === "0" || value?.toLowerCase() === "false") return false;
  return null;
}

/** Package-backed feature flag check. Never use raw strings — pass FeatureKey only. */
export function isFeatureEnabled(packageName: string, feature: FeatureKey): boolean {
  const envOverride = readEnvFeatureOverride(feature);
  if (envOverride !== null) return envOverride;
  return hasFeature(packageName, feature);
}

export function listEnabledFeatures(packageName: string): FeatureKey[] {
  return FEATURE_KEYS.filter((feature) => isFeatureEnabled(packageName, feature));
}
