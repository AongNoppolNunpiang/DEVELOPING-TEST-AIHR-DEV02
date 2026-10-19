import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { demoAuth } from "@/lib/demo-auth-server";
import { parseTestPoint } from "@/lib/test-point-validation";
import { deleteEmptyParent } from "@/lib/parent-deletion";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return demoAuth.withSession(request, async () => {
    const { prisma } = await import("@/lib/prisma");
    let data;
    try {
      data = parseTestPoint(await request.json());
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Test Point." }, { status: 400 });
    }
    try {
      const { id } = await context.params;
      const point = await prisma.testPoint.update({ where: { id }, data });
      return NextResponse.json({ id: point.id });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") return NextResponse.json({ error: "Test Point not found." }, { status: 404 });
        if (error.code === "P2002") return NextResponse.json({ error: "This TP Number already exists for this CML." }, { status: 409 });
      }
      return NextResponse.json({ error: "Unable to update Test Point." }, { status: 500 });
    }
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return demoAuth.withSession(_request, async () => {
    const { prisma } = await import("@/lib/prisma");
    try {
      const { id } = await context.params;
      const outcome = await prisma.$transaction(
        (tx) => deleteEmptyParent(tx, "testPoint", id),
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
      if (outcome === "missing") return NextResponse.json({ error: "Test Point not found." }, { status: 404 });
      if (outcome === "has-children") {
        return NextResponse.json({ error: "Cannot delete this Test Point because it has Thickness records. Inspection history has been preserved." }, { status: 409 });
      }
      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json({ error: "Unable to delete Test Point. Please refresh and try again." }, { status: 500 });
    }
  });
}
