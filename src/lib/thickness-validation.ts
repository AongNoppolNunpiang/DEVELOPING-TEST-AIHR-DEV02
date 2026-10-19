// Pure validation shared by the form and API. Decimal text never passes through
// floating-point arithmetic; limits below are storage limits, not business rules.
export function parseThicknessInput(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("A Thickness object is required.");
  }
  const input = body as Record<string, unknown>;
  const date = input.inspectionDate;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000-")) {
    throw new Error("Inspection date must be a valid date in YYYY-MM-DD format.");
  }
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error("Inspection date must be a real calendar date.");
  }

  const raw = input.actualThickness;
  if ((typeof raw !== "string" && typeof raw !== "number") ||
      (typeof raw === "number" && !Number.isFinite(raw))) {
    throw new Error("Actual thickness must be a decimal number.");
  }
  const text = String(raw).trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
    throw new Error("Actual thickness must use decimal notation, for example 6.780.");
  }
  const negative = text.startsWith("-");
  const [wholeText, fractionText = ""] = text.replace(/^[+-]/, "").split(".");
  const whole = wholeText.replace(/^0+/, "") || "0";
  const fraction = fractionText.replace(/0+$/, "");
  if (whole.length > 5 || fraction.length > 3) {
    throw new Error("Actual thickness must fit Decimal(8,3): -99999.999 to 99999.999, with at most 3 decimal places. Values are not rounded.");
  }
  const sign = negative && (whole !== "0" || fraction !== "") ? "-" : "";
  return { inspectionDate: date, actualThickness: `${sign}${whole}.${fraction.padEnd(3, "0")}` };
}
