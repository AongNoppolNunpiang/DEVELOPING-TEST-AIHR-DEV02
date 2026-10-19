import LineDetailClient from "@/components/line-detail-client";
import { requireDemoPageSession } from "@/lib/demo-page-session";

export default async function LineDetailPage() {
  await requireDemoPageSession();
  return <LineDetailClient />;
}
