import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { demoAuth } from "@/lib/demo-auth-server";
import { parseTestPoint } from "@/lib/test-point-validation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return demoAuth.withSession(request, async () => {
    const { prisma } = await import("@/lib/prisma");
    let data;
    try {
      data = parseTestPoint(await request.json());
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Test Point." }, { status: 400 });
    }

    try {
      const { id: cmlId } = await context.params;
      const point = await prisma.$transaction(async (tx) => {
        const parents = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM cml WHERE id = ${cmlId} FOR KEY SHARE
        `;
        if (parents.length === 0) return null;
        return tx.testPoint.create({ data: { ...data, cmlId } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      if (!point) return NextResponse.json({ error: "CML not found." }, { status: 404 });
      return NextResponse.json({ id: point.id }, { status: 201 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") return NextResponse.json({ error: "This TP Number already exists for this CML." }, { status: 409 });
        if (error.code === "P2003") return NextResponse.json({ error: "CML not found." }, { status: 404 });
      }
      return NextResponse.json({ error: "Unable to create Test Point." }, { status: 500 });
    }
  });
}
