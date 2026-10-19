import { NextResponse } from "next/server";
import { demoAuth } from "@/lib/demo-auth-server";
import { Prisma } from "@prisma/client";
import { InputValidationError, parseLine, readInputJson } from "@/lib/line-cml-validation";


export async function POST(request: Request) {
  return demoAuth.withSession(request, async () => {
    const { prisma } = await import("@/lib/prisma");
    try {
      const body = await readInputJson(request);
      const data = parseLine(body);

      const line = await prisma.info.create({ data });
      return NextResponse.json({ id: line.id }, { status: 201 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json(
          { error: "Line Number already exists." },
          { status: 409 },
        );
      }

      if (error instanceof InputValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json(
        { error: "Unable to create pipe line." },
        { status: 500 },
      );
    }
  });
}
