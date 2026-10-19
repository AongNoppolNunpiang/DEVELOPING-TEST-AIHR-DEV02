import { demoAuth } from "@/lib/demo-auth-server";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return demoAuth.csrf(request);
}
