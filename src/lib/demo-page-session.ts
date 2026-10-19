import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasDemoSession } from "./demo-auth-server";

export async function isDemoPageAuthenticated(): Promise<boolean> {
  return hasDemoSession({ headers: new Headers(await headers()) });
}

export async function requireDemoPageSession(): Promise<void> {
  if (!await isDemoPageAuthenticated()) redirect("/login");
}
