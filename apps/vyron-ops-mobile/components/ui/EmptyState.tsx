import { Text, View } from "react-native";
import { VyronButton } from "./Button";

type VyronEmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function VyronEmptyState({ title, description, actionLabel, onAction }: VyronEmptyStateProps) {
  return (
    <View className="items-center justify-center gap-4 px-6 py-16">
      <Text className="text-center text-2xl font-bold text-vyron-text">{title}</Text>
      <Text className="max-w-md text-center text-base font-medium text-vyron-muted">{description}</Text>
      {actionLabel && onAction ? <VyronButton label={actionLabel} onPress={onAction} className="w-full max-w-sm" /> : null}
    </View>
  );
}
