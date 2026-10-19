import { demoAuth } from "@/lib/demo-auth-server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return demoAuth.login(request);
}
