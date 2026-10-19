export function parseTestPoint(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("A Test Point object is required.");
  }

  const input = body as Record<string, unknown>;
  for (const field of ["tpNumber", "tpDescription"] as const) {
    // Accept JSON numbers only: Number(null), Number(true), etc. are not inputs.
    if (typeof input[field] !== "number" || !Number.isInteger(input[field])) {
      throw new Error(`${field} must be an integer.`);
    }
    // PostgreSQL INTEGER storage boundary, not a business range restriction.
    if (input[field] < -2147483648 || input[field] > 2147483647) {
      throw new Error(`${field} must fit a PostgreSQL integer.`);
    }
  }
  if (input.note !== undefined && input.note !== null && typeof input.note !== "string") {
    throw new Error("Note must be text or null.");
  }

  return {
    tpNumber: input.tpNumber as number,
    tpDescription: input.tpDescription as number,
    note: input.note === "" || input.note === undefined ? null : input.note as string | null,
  };
}
