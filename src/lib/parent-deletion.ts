import type { Prisma } from "@prisma/client";

export type ParentKind = "line" | "cml" | "testPoint";

// Caller must use an interactive READ COMMITTED transaction. Each operation
// locks one existing parent first; it never locks descendants or ancestors.
// FK inserts take KEY SHARE on that parent and conflict with FOR UPDATE.
export async function deleteEmptyParent(
  tx: Prisma.TransactionClient,
  kind: ParentKind,
  id: string,
): Promise<"missing" | "has-children" | "deleted"> {
  const rows = kind === "line"
    ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM info WHERE id = ${id} FOR UPDATE`
    : kind === "cml"
      ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM cml WHERE id = ${id} FOR UPDATE`
      : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM test_point WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) return "missing";

  // This separate command gets a fresh snapshot after any lock wait. Keeping
  // lock + count in one SQL statement could miss a newly committed FK insert.
  const children = kind === "line"
    ? await tx.cml.count({ where: { infoId: id } })
    : kind === "cml"
      ? await tx.testPoint.count({ where: { cmlId: id } })
      : await tx.thickness.count({ where: { testPointId: id } });
  if (children > 0) return "has-children";

  // The lock stays held through COMMIT, so no new child can pass its FK check.
  if (kind === "line") await tx.info.delete({ where: { id } });
  else if (kind === "cml") await tx.cml.delete({ where: { id } });
  else await tx.testPoint.delete({ where: { id } });
  return "deleted";
}
