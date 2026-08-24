/**
 * Pinned to the business timezone so the greeting is stable between the server
 * and the browser, and identical for every customer regardless of their device
 * clock or locale.
 */
export function greetingFor(date: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-ZA", {
      hour: "numeric",
      hour12: false,
      timeZone: "Africa/Johannesburg",
    }).format(date)
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
