import { NextResponse } from "next/server";
import { demoAuth } from "@/lib/demo-auth-server";
import { Prisma } from "@prisma/client";
import { InputValidationError, parseCml, readInputJson } from "@/lib/line-cml-validation";
import { deleteEmptyParent } from "@/lib/parent-deletion";


export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return demoAuth.withSession(request, async () => {
    const { prisma } = await import("@/lib/prisma");
    try {
      const { id } = await context.params;
      const body = await readInputJson(request);
      const data = parseCml(body);

      const cml = await prisma.cml.update({
        where: { id },
        data,
      });

      return NextResponse.json({ id: cml.id });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          return NextResponse.json({ error: "CML not found." }, { status: 404 });
        }

        if (error.code === "P2002") {
          return NextResponse.json(
            { error: "This CML Number already exists for this pipe line." },
            { status: 409 },
          );
        }
      }

      if (error instanceof InputValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json(
        { error: "Unable to update CML." },
        { status: 500 },
      );
    }
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return demoAuth.withSession(_request, async () => {
    const { prisma } = await import("@/lib/prisma");
    try {
      const { id } = await context.params;

      const outcome = await prisma.$transaction(
        (tx) => deleteEmptyParent(tx, "cml", id),
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
      if (outcome === "missing") {
        return NextResponse.json({ error: "CML not found." }, { status: 404 });
      }
      if (outcome === "has-children") {
        return NextResponse.json(
          { error: "Cannot delete this CML because it has Test Points. Remove related inspection data first." },
          { status: 409 },
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return NextResponse.json({ error: "CML not found." }, { status: 404 });
      }

      return NextResponse.json(
        { error: "Unable to delete CML." },
        { status: 500 },
      );
    }
  });
}
