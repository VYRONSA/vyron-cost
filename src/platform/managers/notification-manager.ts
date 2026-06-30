export type PlatformNotification = {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  href?: string;
  createdAt: string;
};

export function createNotification(input: Omit<PlatformNotification, "id" | "createdAt">): PlatformNotification {
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
}
