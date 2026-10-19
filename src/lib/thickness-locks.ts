import type { Prisma } from "@prisma/client";

// All Thickness mutations lock in this order: TestPoint KEY SHARE, then the
// specific Thickness FOR UPDATE (for edits/deletes). Never lock in reverse.
export async function lockThicknessParent(tx: Prisma.TransactionClient, id: string) {
  const parents = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM test_point WHERE id = ${id} FOR KEY SHARE
  `;
  return parents.length > 0;
}

export async function lockThicknessRecord(tx: Prisma.TransactionClient, testPointId: string, thicknessId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM thickness
    WHERE id = ${thicknessId} AND test_point_id = ${testPointId} FOR UPDATE
  `;
  return rows.length > 0;
}
