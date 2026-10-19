// Read-only Excel calculation preview. No database, default engineering values,
// floating-point division, or rounding. Sources: Actual OD Calc!C4:F25,
// Structural Calc!D6:G10 and the formula text boxes in UI.
type NumericInput = string | number | null | undefined;
type Rational = { n: bigint; d: bigint };
export type CalculationResult =
  | { status: "calculated"; value: string; numerator: string; denominator: string; representation: "decimal" | "fraction" }
  | { status: "needs-confirmation"; reason: string };

const ZERO = BigInt(0);
const ONE = BigInt(1);

function gcd(a: bigint, b: bigint): bigint {
  a = a < ZERO ? -a : a;
  b = b < ZERO ? -b : b;
  while (b !== ZERO) [a, b] = [b, a % b];
  return a;
}

function rational(n: bigint, d: bigint): Rational {
  if (d === ZERO) throw new Error("A rational denominator cannot be zero.");
  if (d < ZERO) { n = -n; d = -d; }
  const factor = gcd(n, d);
  return { n: n / factor, d: d / factor };
}

function parse(raw: NumericInput): Rational | null {
  if ((typeof raw !== "number" && typeof raw !== "string") ||
      (typeof raw === "number" && !Number.isFinite(raw))) return null;
  const text = String(raw).trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const [whole, fraction = ""] = text.replace(/^[+-]/, "").split(".");
  const n = BigInt((whole || "0") + fraction) * (text.startsWith("-") ? -ONE : ONE);
  return rational(n, BigInt(10) ** BigInt(fraction.length));
}

function compare(a: Rational, b: Rational): bigint { return a.n * b.d - b.n * a.d; }
function multiply(a: Rational, b: Rational): Rational { return rational(a.n * b.n, a.d * b.d); }
function add(a: Rational, b: Rational): Rational { return rational(a.n * b.d + b.n * a.d, a.d * b.d); }
function missing(reason: string): CalculationResult { return { status: "needs-confirmation", reason }; }

function result(value: Rational): CalculationResult {
  // A terminating decimal is rendered exactly. Otherwise show the reduced
  // fraction: Decimal(8,3) does NOT authorize rounding an engineering result.
  let remaining = value.d;
  let twos = 0, fives = 0;
  while (remaining % BigInt(2) === ZERO) { remaining /= BigInt(2); twos++; }
  while (remaining % BigInt(5) === ZERO) { remaining /= BigInt(5); fives++; }
  const base = { numerator: value.n.toString(), denominator: value.d.toString() };
  if (remaining !== ONE) {
    return { status: "calculated", ...base, value: `${value.n}/${value.d}`, representation: "fraction" };
  }
  const places = twos > fives ? twos : fives;
  const magnitude = value.n < ZERO ? -value.n : value.n;
  const digits = (magnitude * (BigInt(10) ** BigInt(places)) / value.d).toString().padStart(places + 1, "0");
  const text = places === 0 ? digits : `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/0+$/, "").replace(/\.$/, "");
  return { status: "calculated", ...base, value: (value.n < ZERO ? "-" : "") + text, representation: "decimal" };
}

function fromResult(value: CalculationResult): Rational | null {
  return value.status === "calculated" ? rational(BigInt(value.numerator), BigInt(value.denominator)) : null;
}

// C7 is 0.357 in the supplied workbook. Do not silently substitute 0.375.
const OD_ROWS = [
  ["0.125", "10.3"], ["0.25", "13.7"], ["0.357", "17.1"],
  ["0.5", "21.3"], ["0.75", "26.7"], ["1", "33.4"],
  ["1.25", "42.2"], ["1.5", "48.3"], ["2", "60.3"],
  ["2.5", "73"], ["3", "88.9"], ["3.5", "101.6"],
  ["4", "114.3"], ["5", "141.3"], ["6", "168.3"],
  ["8", "219.1"], ["10", "273"], ["12", "323.8"],
  ["14", "355.6"], ["16", "406.4"], ["18", "457"],
] as const;

export function lookupActualOutsideDiameter(pipeSize: NumericInput): CalculationResult {
  const size = parse(pipeSize);
  if (!size) return missing("Pipe Size ไม่ครบหรือไม่ใช่ตัวเลข — ต้องยืนยัน");
  const row = OD_ROWS.find(([key]) => compare(size, parse(key)!) === ZERO);
  return row ? result(parse(row[1])!) : missing("Pipe Size ไม่ตรงรายการ Actual OD Calc — ต้องยืนยัน ไม่มีการเลือกขนาดใกล้เคียง");
}

export function calculateStructuralThickness(pipeSize: NumericInput): CalculationResult {
  const size = parse(pipeSize);
  if (!size) return missing("Pipe Size ไม่ครบหรือไม่ใช่ตัวเลข — ต้องยืนยัน");
  if (compare(size, parse("2")!) <= ZERO) return result(parse("1.8")!);
  if (compare(size, parse("3")!) === ZERO) return result(parse("2")!);
  if (compare(size, parse("4")!) === ZERO) return result(parse("2.3")!);
  if (compare(size, parse("6")!) >= ZERO && compare(size, parse("18")!) <= ZERO) return result(parse("2.8")!);
  if (compare(size, parse("20")!) >= ZERO) return result(parse("3.1")!);
  return missing("Pipe Size ไม่เข้าเงื่อนไข Structural Calc ที่ระบุ — ต้องยืนยัน");
}

export function calculateDesignThickness(input: {
  designPressure: NumericInput;
  actualOutsideDiameter: CalculationResult;
  stress: NumericInput;
  jointEfficiency: NumericInput;
}): CalculationResult {
  const p = parse(input.designPressure), od = fromResult(input.actualOutsideDiameter);
  const s = parse(input.stress), e = parse(input.jointEfficiency);
  if (!p || !od || !s || !e) return missing("Design Thickness คำนวณไม่ได้: input ไม่ครบหรือ Actual OD คำนวณไม่ได้ — ต้องยืนยัน");
  const two = parse("2")!, coefficient = parse("0.4")!;
  const denominator = add(multiply(multiply(two, s), e), multiply(multiply(two, p), coefficient));
  if (denominator.n === ZERO) return missing("Design Thickness คำนวณไม่ได้: ตัวหารเป็นศูนย์ — ต้องยืนยัน");
  const numerator = multiply(p, od);
  return result(rational(numerator.n * denominator.d, numerator.d * denominator.n));
}

export function calculateRequiredThickness(design: CalculationResult, structural: CalculationResult): CalculationResult {
  const d = fromResult(design), s = fromResult(structural);
  if (!d || !s) return missing("Required Thickness คำนวณไม่ได้: ต้องมี Design และ Structural Thickness ครบ — ต้องยืนยัน");
  return result(compare(d, s) >= ZERO ? d : s);
}

export function calculateExcelPreview(input: {
  pipeSize: NumericInput; designPressure: NumericInput; stress: NumericInput; jointEfficiency: NumericInput;
}) {
  const actualOutsideDiameter = lookupActualOutsideDiameter(input.pipeSize);
  const structuralThickness = calculateStructuralThickness(input.pipeSize);
  const designThickness = calculateDesignThickness({ ...input, actualOutsideDiameter });
  return { actualOutsideDiameter, structuralThickness, designThickness,
    requiredThickness: calculateRequiredThickness(designThickness, structuralThickness) };
}
