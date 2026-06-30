import { Pressable, Text, View } from "react-native";

type NumericKeypadProps = {
  value: string;
  onChange: (value: string) => void;
};

export function NumericKeypad({ value, onChange }: NumericKeypadProps) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

  const pressKey = (key: string) => {
    if (key === "⌫") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === "." && value.includes(".")) return;
    onChange(`${value}${key}`);
  };

  return (
    <View className="flex-row flex-wrap gap-3">
      {keys.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          className="min-h-[64px] min-w-[30%] flex-1 items-center justify-center rounded-vyron border border-vyron-border bg-vyron-surface"
          onPress={() => pressKey(key)}
        >
          <Text className="text-2xl font-bold text-vyron-text">{key}</Text>
        </Pressable>
      ))}
    </View>
  );
}
