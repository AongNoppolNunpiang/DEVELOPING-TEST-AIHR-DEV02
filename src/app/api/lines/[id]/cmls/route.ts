import { NextResponse } from "next/server";
import { demoAuth } from "@/lib/demo-auth-server";
import { Prisma } from "@prisma/client";
import { InputValidationError, parseCml, readInputJson } from "@/lib/line-cml-validation";


export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return demoAuth.withSession(request, async () => {
    const { prisma } = await import("@/lib/prisma");
    try {
      const { id: infoId } = await context.params;
      const body = await readInputJson(request);
      const data = parseCml(body);

      const cml = await prisma.$transaction(async (tx) => {
        const parents = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM info WHERE id = ${infoId} FOR KEY SHARE
        `;
        if (parents.length === 0) return null;
        return tx.cml.create({ data: { ...data, infoId } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

      if (!cml) {
        return NextResponse.json(
          { error: "Pipe line not found." },
          { status: 404 },
        );
      }

      return NextResponse.json({ id: cml.id }, { status: 201 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return NextResponse.json({ error: "Pipe line not found." }, { status: 404 });
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return NextResponse.json(
          { error: "This CML Number already exists for this pipe line." },
          { status: 409 },
        );
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return NextResponse.json({ error: "Unable to create CML." }, { status: 500 });
      }

      if (error instanceof InputValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json(
        { error: "Unable to create CML." },
        { status: 500 },
      );
    }
  });
}
