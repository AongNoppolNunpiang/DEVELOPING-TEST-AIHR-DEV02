import { NextResponse } from "next/server";
import { demoAuth } from "@/lib/demo-auth-server";
import { Prisma } from "@prisma/client";
import { InputValidationError, parseLine, readInputJson } from "@/lib/line-cml-validation";
import { deleteEmptyParent } from "@/lib/parent-deletion";


export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return demoAuth.withSession(_request, async () => {
    const { prisma } = await import("@/lib/prisma");
    try {
      const { id } = await context.params;

      const line = await prisma.info.findUnique({
        where: { id },
        include: {
          cmls: {
            orderBy: { cmlNumber: "asc" },
            include: {
              testPoints: {
                orderBy: { tpNumber: "asc" },
                include: {
                  thicknesses: {
                    orderBy: { inspectionDate: "desc" },
                  },
                },
              },
            },
          },
        },
      });

      if (!line) {
        return NextResponse.json(
          { error: "Pipe line not found." },
          { status: 404 },
        );
      }

      return NextResponse.json({
        id: line.id,
        lineNumber: line.lineNumber,
        location: line.location,
        from: line.fromLocation,
        to: line.toLocation,
        drawingNumber: line.drawingNumber,
        service: line.service,
        material: line.material,
        inserviceDate: line.inserviceDate.toISOString().slice(0, 10),
        pipeSize: Number(line.pipeSize),
        originalThickness: Number(line.originalThickness),
        stress: line.stress,
        jointEfficiency: line.jointEfficiency,
        corrosionAllowance: line.ca,
        designLife: line.designLife,
        designPressure: line.designPressure,
        operatingPressure: line.operatingPressure,
        designTemperature: line.designTemperature,
        operatingTemperature: line.operatingTemperature.toString(),
        cmls: line.cmls.map((cml) => ({
          id: cml.id,
          cmlNumber: cml.cmlNumber,
          description: cml.cmlDescription,
          actualOutsideDiameter:
            cml.actualOutsideDiameter === null
              ? null
              : Number(cml.actualOutsideDiameter),
          designThickness:
            cml.designThickness === null ? null : Number(cml.designThickness),
          structuralThickness:
            cml.structuralThickness === null
              ? null
              : Number(cml.structuralThickness),
          requiredThickness:
            cml.requiredThickness === null
              ? null
              : Number(cml.requiredThickness),
          testPoints: cml.testPoints.map((point) => ({
            id: point.id,
            number: point.tpNumber,
            description: point.tpDescription,
            note: point.note,
            thicknesses: point.thicknesses.map((item) => ({
              id: item.id,
              date: item.inspectionDate.toISOString().slice(0, 10),
              actualThickness: item.actualThickness.toFixed(3),
            })),
          })),
        })),
      });
    } catch {
      console.error("Line detail API failed.");

      return NextResponse.json(
        { error: "Unable to load pipe line details." },
        { status: 500 },
      );
    }
  });
}
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return demoAuth.withSession(request, async () => {
    const { prisma } = await import("@/lib/prisma");
    try {
      const { id } = await context.params;
      const body = await readInputJson(request);
      const data = parseLine(body);

      const line = await prisma.info.update({
        where: { id },
        data,
      });

      return NextResponse.json({ id: line.id });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          return NextResponse.json(
            { error: "Pipe line not found." },
            { status: 404 },
          );
        }

        if (error.code === "P2002") {
          return NextResponse.json(
            { error: "Line Number already exists." },
            { status: 409 },
          );
        }
      }

      if (error instanceof InputValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json(
        { error: "Unable to update pipe line." },
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
        (tx) => deleteEmptyParent(tx, "line", id),
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
      if (outcome === "missing") {
        return NextResponse.json({ error: "Pipe line not found." }, { status: 404 });
      }
      if (outcome === "has-children") {
        return NextResponse.json(
          {
            error:
              "This pipe line has CML records. Delete related inspection data separately before deleting the pipe line.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return NextResponse.json(
          { error: "Pipe line not found." },
          { status: 404 },
        );
      }

      return NextResponse.json(
        { error: "Unable to delete pipe line." },
        { status: 500 },
      );
    }
  });
}
