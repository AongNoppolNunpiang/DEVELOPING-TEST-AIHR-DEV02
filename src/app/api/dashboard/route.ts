import { NextRequest, NextResponse } from "next/server";
import { demoAuth } from "@/lib/demo-auth-server";

export async function GET(request: NextRequest) {
  return demoAuth.withSession(request, async () => {
    const { prisma } = await import("@/lib/prisma");
    try {
      const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

      const [lineCount, cmlCount, testPointCount, thicknessCount, records] =
        await Promise.all([
          prisma.info.count(),
          prisma.cml.count(),
          prisma.testPoint.count(),
          prisma.thickness.count(),
          prisma.info.findMany({
            where: query
              ? {
                  OR: [
                    { lineNumber: { contains: query, mode: "insensitive" } },
                    { location: { contains: query, mode: "insensitive" } },
                    { service: { contains: query, mode: "insensitive" } },
                    { material: { contains: query, mode: "insensitive" } },
                  ],
                }
              : undefined,
            orderBy: { lineNumber: "asc" },
            include: {
              cmls: {
                include: {
                  testPoints: {
                    include: {
                      thicknesses: {
                        orderBy: { inspectionDate: "desc" },
                        take: 1,
                      },
                    },
                  },
                },
              },
            },
          }),
        ]);

      const lines = records.map((line) => {
        const testPoints = line.cmls.flatMap((cml) => cml.testPoints);
        const latestMeasurements = testPoints.flatMap(
          (point) => point.thicknesses,
        );

        const latest = latestMeasurements.sort(
          (a, b) =>
            b.inspectionDate.getTime() - a.inspectionDate.getTime(),
        )[0];

        return {
          id: line.id,
          lineNumber: line.lineNumber,
          location: line.location,
          from: line.fromLocation,
          to: line.toLocation,
          service: line.service,
          material: line.material,
          pipeSize: Number(line.pipeSize),
          originalThickness: Number(line.originalThickness),
          cmlCount: line.cmls.length,
          testPointCount: testPoints.length,
          latestInspection: latest
            ? {
                date: latest.inspectionDate.toISOString().slice(0, 10),
                // Stored Decimal(8,3), matching Detail/history serialization.
                // This is not an engineering rounding rule for calculations.
                thickness: latest.actualThickness.toFixed(3),
              }
            : null,
        };
      });

      return NextResponse.json({
        summary: { lineCount, cmlCount, testPointCount, thicknessCount },
        lines,
      });
    } catch {
      console.error("Dashboard API failed.");
      return NextResponse.json(
        { error: "Unable to load inspection data." },
        { status: 500 },
      );
    }
  });
}
