/**
 * Exact fixed-point decimal arithmetic for money.
 *
 * WHY THIS EXISTS
 * The project convention up to now has been `roundMoney(v) = Math.round(v * 100) / 100`
 * (see vyron-invoice-reconciliation.ts). That is fine for reconciling figures read
 * off a supplier's PDF, where the input is already a rounded number and a cent of
 * drift only widens a tolerance. It is not fine for computing the VAT that goes on
 * a tax invoice: `1.005 * 100` is 100.49999999999999 in binary floating point, so
 * `Math.round` returns 100 and R1.005 becomes R1.00 instead of R1.01. Errors of
 * that kind accumulate across lines and produce an invoice whose parts do not sum
 * to its total.
 *
 * Every value here is an integer count of units at a declared scale, held as a
 * bigint. Addition, subtraction and multiplication are therefore exact at any
 * magnitude — no 2^53 ceiling, no binary fractions. Rounding happens only where
 * this module is explicitly asked for it.
 *
 * ROUNDING
 * Half-up away from zero, the ordinary commercial convention: 0.005 -> 0.01 and
 * -0.005 -> -0.01. Applied at one declared scale per step, never implicitly.
 *
 * The one place a floating-point value is unavoidable is the boundary: PostgREST
 * returns `numeric` as a JSON number, so a stored 4-decimal price reaches us as a
 * double. `fromNumber` performs a single round at the declared scale to recover
 * the intended decimal, and everything after that is exact. Prefer `fromString`
 * where the digits are available as text.
 */

export type Decimal = { readonly units: bigint; readonly scale: number };

// The build targets ES2017, where BigInt literals (`10n`) are a syntax error.
const B0 = BigInt(0);
const B1 = BigInt(1);
const B2 = BigInt(2);
const B10 = BigInt(10);

const TEN = B10;

function pow10(n: number): bigint {
  return TEN ** BigInt(n);
}

export function dec(units: bigint, scale: number): Decimal {
  if (!Number.isInteger(scale) || scale < 0 || scale > 30) {
    throw new Error(`Unsupported decimal scale: ${scale}`);
  }
  return { units, scale };
}

export const ZERO = dec(B0, 0);

/**
 * Exact parse of a decimal string. No floating point is involved at any point,
 * so "0.005" is exactly five thousandths.
 */
export function fromString(value: string): Decimal {
  const raw = String(value).trim();
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!match || (!match[2] && !match[3])) {
    throw new Error(`Not a decimal number: ${JSON.stringify(value)}`);
  }
  const sign = match[1] === "-" ? -B1 : B1;
  const whole = match[2] || "0";
  const frac = match[3] || "";
  return dec(sign * BigInt(whole + frac), frac.length);
}

/**
 * Recover a decimal from a JS number at a known scale, with exactly one rounding.
 * `scale` must be the precision the value is actually stored at — passing a larger
 * scale than the column holds re-imports the float noise this module exists to avoid.
 */
export function fromNumber(value: number, scale: number): Decimal {
  if (!Number.isFinite(value)) throw new Error(`Not a finite number: ${value}`);
  const shifted = value * Math.pow(10, scale);
  if (!Number.isSafeInteger(Math.round(shifted))) {
    // Beyond 2^53 the double no longer identifies a unique decimal; go via text.
    return rescale(fromString(value.toFixed(scale)), scale);
  }
  return dec(BigInt(Math.round(shifted)), scale);
}

/** Accepts whatever the database or an API body hands over. */
export function toDecimal(value: unknown, scale: number): Decimal {
  if (value === null || value === undefined || value === "") return dec(B0, scale);
  if (typeof value === "bigint") return dec(value * pow10(scale), scale);
  if (typeof value === "number") return fromNumber(value, scale);
  return rescale(fromString(String(value)), scale);
}

/** Change scale. Growing is exact; shrinking rounds half-up away from zero. */
export function rescale(value: Decimal, scale: number): Decimal {
  if (scale === value.scale) return value;
  if (scale > value.scale) return dec(value.units * pow10(scale - value.scale), scale);

  const divisor = pow10(value.scale - scale);
  const negative = value.units < B0;
  const magnitude = negative ? -value.units : value.units;
  const quotient = magnitude / divisor;
  const remainder = magnitude % divisor;
  // Half-up: a remainder of exactly half rounds away from zero.
  const rounded = remainder * B2 >= divisor ? quotient + B1 : quotient;
  return dec(negative ? -rounded : rounded, scale);
}

function align(a: Decimal, b: Decimal): [Decimal, Decimal, number] {
  const scale = Math.max(a.scale, b.scale);
  return [rescale(a, scale), rescale(b, scale), scale];
}

export function add(a: Decimal, b: Decimal): Decimal {
  const [x, y, scale] = align(a, b);
  return dec(x.units + y.units, scale);
}

export function sub(a: Decimal, b: Decimal): Decimal {
  const [x, y, scale] = align(a, b);
  return dec(x.units - y.units, scale);
}

/** Exact: scales add, nothing is rounded. */
export function mul(a: Decimal, b: Decimal): Decimal {
  return dec(a.units * b.units, a.scale + b.scale);
}

/** Divide, rounding the result half-up away from zero at `scale`. */
export function div(a: Decimal, b: Decimal, scale: number): Decimal {
  if (b.units === B0) throw new Error("Division by zero.");
  // a/b at target scale = (a.units * 10^(scale + b.scale - a.scale)) / b.units
  const shift = scale + b.scale - a.scale;
  const numerator = shift >= 0 ? a.units * pow10(shift) : a.units;
  const denominator = shift >= 0 ? b.units : b.units * pow10(-shift);

  const negative = numerator < B0 !== denominator < B0;
  const n = numerator < B0 ? -numerator : numerator;
  const d = denominator < B0 ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * B2 >= d ? quotient + B1 : quotient;
  return dec(negative ? -rounded : rounded, scale);
}

/** Dividing by a power of ten is a scale shift, so it stays exact. */
export function divPow10(value: Decimal, power: number): Decimal {
  return dec(value.units, value.scale + power);
}

export function sum(values: Decimal[]): Decimal {
  return values.reduce((acc, value) => add(acc, value), ZERO);
}

export function isZero(value: Decimal) {
  return value.units === B0;
}

export function isNegative(value: Decimal) {
  return value.units < B0;
}

export function compare(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const [x, y] = align(a, b);
  return x.units < y.units ? -1 : x.units > y.units ? 1 : 0;
}

export function eq(a: Decimal, b: Decimal) {
  return compare(a, b) === 0;
}

export function gt(a: Decimal, b: Decimal) {
  return compare(a, b) === 1;
}

export function gte(a: Decimal, b: Decimal) {
  return compare(a, b) >= 0;
}

export function toFixed(value: Decimal, scale: number): string {
  const v = rescale(value, scale);
  const negative = v.units < B0;
  const digits = (negative ? -v.units : v.units).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale) || "0";
  const frac = scale > 0 ? "." + digits.slice(digits.length - scale) : "";
  return `${negative ? "-" : ""}${whole}${frac}`;
}

/**
 * For handing a value to Postgres or JSON. Cents are far inside the exact-integer
 * range of a double, so a 2-decimal amount round-trips without loss.
 */
export function toNumber(value: Decimal, scale: number): number {
  return Number(toFixed(value, scale));
}

/** Money is carried to the cent. */
export const MONEY_SCALE = 2;

export function money(value: Decimal): Decimal {
  return rescale(value, MONEY_SCALE);
}
