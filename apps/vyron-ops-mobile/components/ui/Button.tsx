import { Pressable, Text, type PressableProps } from "react-native";
import { cn } from "@/utils/cn";

type VyronButtonProps = PressableProps & {
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
};

const variantClasses: Record<NonNullable<VyronButtonProps["variant"]>, string> = {
  primary: "bg-vyron-emerald",
  secondary: "bg-vyron-surface border border-vyron-border",
  ghost: "bg-transparent border border-vyron-border",
  danger: "bg-vyron-rose",
};

export function VyronButton({
  label,
  variant = "primary",
  className,
  disabled,
  ...props
}: VyronButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      className={cn(
        "min-h-[56px] items-center justify-center rounded-vyron px-5",
        variantClasses[variant],
        disabled && "opacity-50",
        className
      )}
      {...props}
    >
      <Text className="text-base font-bold text-vyron-text">{label}</Text>
    </Pressable>
  );
}
