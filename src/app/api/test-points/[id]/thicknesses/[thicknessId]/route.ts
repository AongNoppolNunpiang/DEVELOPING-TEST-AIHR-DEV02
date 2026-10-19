import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { demoAuth } from "@/lib/demo-auth-server";
import { parseThicknessInput } from "@/lib/thickness-validation";
import { lockThicknessParent, lockThicknessRecord } from "@/lib/thickness-locks";

type Context = { params: Promise<{ id: string; thicknessId: string }> };

export async function PUT(request: Request, context: Context) {
  return demoAuth.withSession(request, async () => {
    const { prisma } = await import("@/lib/prisma");
    let input;
    try {
      input = parseThicknessInput(await request.json());
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Thickness." }, { status: 400 });
    }
    try {
      const { id, thicknessId } = await context.params;
      const row = await prisma.$transaction(async (tx) => {
        if (!await lockThicknessParent(tx, id)) return null;
        if (!await lockThicknessRecord(tx, id, thicknessId)) return null;
        return tx.thickness.update({ where: { id: thicknessId }, data: {
          inspectionDate: new Date(`${input.inspectionDate}T00:00:00.000Z`),
          actualThickness: new Prisma.Decimal(input.actualThickness),
        } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      if (!row) return NextResponse.json({ error: "Thickness not found for this Test Point." }, { status: 404 });
      return NextResponse.json({ id: row.id, date: input.inspectionDate, actualThickness: row.actualThickness.toFixed(3) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") return NextResponse.json({ error: "An inspection already exists for this Test Point on this date." }, { status: 409 });
        if (error.code === "P2025") return NextResponse.json({ error: "Thickness not found for this Test Point." }, { status: 404 });
      }
      return NextResponse.json({ error: "Unable to update Thickness." }, { status: 500 });
    }
  });
}

export async function DELETE(_request: Request, context: Context) {
  return demoAuth.withSession(_request, async () => {
    const { prisma } = await import("@/lib/prisma");
    try {
      const { id, thicknessId } = await context.params;
      const removed = await prisma.$transaction(async (tx) => {
        if (!await lockThicknessParent(tx, id)) return false;
        if (!await lockThicknessRecord(tx, id, thicknessId)) return false;
        await tx.thickness.delete({ where: { id: thicknessId } });
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      if (!removed) return NextResponse.json({ error: "Thickness not found for this Test Point." }, { status: 404 });
      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json({ error: "Unable to delete Thickness." }, { status: 500 });
    }
  });
}
