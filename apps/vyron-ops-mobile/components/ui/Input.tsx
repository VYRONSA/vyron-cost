import { Text, TextInput, View, type TextInputProps } from "react-native";
import { cn } from "@/utils/cn";

type VyronInputProps = TextInputProps & {
  label?: string;
  className?: string;
};

export function VyronInput({ label, className, ...props }: VyronInputProps) {
  return (
    <View className="gap-2">
      {label ? <Text className="text-xs font-bold uppercase tracking-widest text-vyron-subtle">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#64748B"
        className={cn(
          "min-h-[56px] rounded-vyron border border-vyron-border bg-vyron-surface px-4 text-base font-medium text-vyron-text",
          className
        )}
        {...props}
      />
    </View>
  );
}
