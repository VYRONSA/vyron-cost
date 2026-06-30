import {
  DASHBOARD_WIDGETS,
  getUpgradePackageLabel,
  isPremiumLocked,
  type FeatureKey,
} from "@/platform/managers/package-manager";
import type { PlatformWidgetState } from "@/platform/types";

export { DASHBOARD_WIDGETS };

export type CommandCentreContext = {
  packageName: string;
};

export function getWidgets(context: CommandCentreContext): PlatformWidgetState[] {
  return DASHBOARD_WIDGETS.map((widget) => {
    const locked = isPremiumLocked(context.packageName, widget.feature);
    return {
      id: widget.id,
      label: widget.label,
      href: widget.href,
      feature: widget.feature,
      locked,
      visible: true,
      upgradePackage: getUpgradePackageLabel(widget.feature),
    };
  });
}

export function getWidgetState(
  context: CommandCentreContext,
  widgetId: string
): PlatformWidgetState | null {
  return getWidgets(context).find((widget) => widget.id === widgetId) || null;
}

export function isWidgetLocked(context: CommandCentreContext, feature: FeatureKey): boolean {
  return isPremiumLocked(context.packageName, feature);
}
