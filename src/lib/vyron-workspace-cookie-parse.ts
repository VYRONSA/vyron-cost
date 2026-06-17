export function parseCookieJsonValue<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;

  const candidates: string[] = [raw];

  try {
    candidates.push(decodeURIComponent(raw));
  } catch {
    // ignore decode failure
  }

  try {
    const doubleDecoded = decodeURIComponent(decodeURIComponent(raw));
    if (!candidates.includes(doubleDecoded)) {
      candidates.push(doubleDecoded);
    }
  } catch {
    // ignore double decode failure
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try next candidate
    }
  }

  return null;
}
