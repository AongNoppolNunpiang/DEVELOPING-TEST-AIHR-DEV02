import DashboardClient from "@/components/dashboard-client";
import { requireDemoPageSession } from "@/lib/demo-page-session";

export default async function HomePage() {
  await requireDemoPageSession();
  return <DashboardClient />;
}
