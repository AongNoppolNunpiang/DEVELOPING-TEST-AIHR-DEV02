import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { demoAuth } from "@/lib/demo-auth-server";
import { parseThicknessInput } from "@/lib/thickness-validation";
import { lockThicknessParent } from "@/lib/thickness-locks";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return demoAuth.withSession(request, async () => {
    const { prisma } = await import("@/lib/prisma");
    let input;
    try {
      input = parseThicknessInput(await request.json());
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Thickness." }, { status: 400 });
    }
    try {
      const { id: testPointId } = await context.params;
      const row = await prisma.$transaction(async (tx) => {
        if (!await lockThicknessParent(tx, testPointId)) return null;
        return tx.thickness.create({ data: {
          testPointId,
          inspectionDate: new Date(`${input.inspectionDate}T00:00:00.000Z`),
          actualThickness: new Prisma.Decimal(input.actualThickness),
        } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      if (!row) return NextResponse.json({ error: "Test Point not found." }, { status: 404 });
      return NextResponse.json({ id: row.id, date: input.inspectionDate, actualThickness: row.actualThickness.toFixed(3) }, { status: 201 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") return NextResponse.json({ error: "An inspection already exists for this Test Point on this date." }, { status: 409 });
        if (error.code === "P2003") return NextResponse.json({ error: "Test Point not found." }, { status: 404 });
      }
      return NextResponse.json({ error: "Unable to create Thickness." }, { status: 500 });
    }
  });
}
