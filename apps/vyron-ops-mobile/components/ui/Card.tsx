import { View, type ViewProps } from "react-native";
import { cn } from "@/utils/cn";

type VyronCardProps = ViewProps & {
  glass?: boolean;
  className?: string;
};

export function VyronCard({ glass = false, className, children, ...props }: VyronCardProps) {
  return (
    <View
      className={cn(
        "rounded-vyron border border-vyron-border bg-vyron-card p-5 shadow-vyron",
        glass && "bg-vyron-cardGlass",
        className
      )}
      {...props}
    >
      {children}
    </View>
  );
}
