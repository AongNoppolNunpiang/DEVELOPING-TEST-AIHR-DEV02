import { Prisma } from "@prisma/client";

// Only this error type is safe to return to clients. Database/runtime errors
// must be handled separately, without exposing their messages.
export class InputValidationError extends Error {}

export async function readInputJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new InputValidationError("Request body must be valid JSON.");
    }
    throw error;
  }
}

function objectInput(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InputValidationError("A JSON object is required.");
  }
  return body as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new InputValidationError(`${field} is required.`);
  }
  return value.trim();
}

function numberText(raw: unknown, field: string): string {
  if ((typeof raw !== "string" && typeof raw !== "number") ||
      (typeof raw === "number" && !Number.isFinite(raw))) {
    throw new InputValidationError(`${field} must be a valid number.`);
  }
  const text = String(raw).trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
    throw new InputValidationError(`${field} must use decimal notation.`);
  }
  return text;
}

function integer(raw: unknown, field: string): number {
  const value = new Prisma.Decimal(numberText(raw, field));
  if (!value.isInteger() || value.lt(-2147483648) || value.gt(2147483647)) {
    throw new InputValidationError(`${field} must be an integer between -2147483648 and 2147483647.`);
  }
  return value.toNumber();
}

function decimal(raw: unknown, field: string, precision: number): Prisma.Decimal {
  const text = numberText(raw, field);
  const [wholeText, fractionText = ""] = text.replace(/^[+-]/, "").split(".");
  const whole = wholeText.replace(/^0+/, "") || "0";
  const fraction = fractionText.replace(/0+$/, "");
  if (whole.length > precision - 3 || fraction.length > 3) {
    throw new InputValidationError(`${field} must fit Decimal(${precision},3) without rounding.`);
  }
  return new Prisma.Decimal(text);
}

function optionalDecimal(raw: unknown, field: string): Prisma.Decimal | null {
  // Preserve the existing form's empty-string convention, but do not accept
  // whitespace-only strings or coerce booleans/arrays to a number.
  if (raw === "" || raw === null || raw === undefined) return null;
  return decimal(raw, field, 8);
}

function date(raw: unknown): Date {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw.startsWith("0000-")) {
    throw new InputValidationError("In-service date must use YYYY-MM-DD format.");
  }
  const value = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== raw) {
    throw new InputValidationError("In-service date must be a real calendar date.");
  }
  return value;
}

export function parseLine(body: unknown) {
  const input = objectInput(body);
  return {
    lineNumber: requiredString(input, "lineNumber"),
    location: requiredString(input, "location"),
    fromLocation: requiredString(input, "from"),
    toLocation: requiredString(input, "to"),
    drawingNumber: requiredString(input, "drawingNumber"),
    service: requiredString(input, "service"),
    material: requiredString(input, "material"),
    inserviceDate: date(input.inserviceDate),
    pipeSize: decimal(input.pipeSize, "pipeSize", 6),
    originalThickness: decimal(input.originalThickness, "originalThickness", 8),
    stress: integer(input.stress, "stress"),
    jointEfficiency: integer(input.jointEfficiency, "jointEfficiency"),
    ca: integer(input.ca, "ca"),
    designLife: integer(input.designLife, "designLife"),
    designPressure: integer(input.designPressure, "designPressure"),
    operatingPressure: integer(input.operatingPressure, "operatingPressure"),
    designTemperature: integer(input.designTemperature, "designTemperature"),
    // Storage precision, not a company-approved temperature range/rounding rule.
    operatingTemperature: decimal(input.operatingTemperature, "operatingTemperature", 13),
  };
}

export function parseCml(body: unknown) {
  const input = objectInput(body);
  return {
    cmlNumber: integer(input.cmlNumber, "cmlNumber"),
    cmlDescription: requiredString(input, "cmlDescription"),
    actualOutsideDiameter: optionalDecimal(input.actualOutsideDiameter, "actualOutsideDiameter"),
    designThickness: optionalDecimal(input.designThickness, "designThickness"),
    structuralThickness: optionalDecimal(input.structuralThickness, "structuralThickness"),
    requiredThickness: optionalDecimal(input.requiredThickness, "requiredThickness"),
  };
}
