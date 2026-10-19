import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isDemoPageAuthenticated } from "@/lib/demo-page-session";

export default async function LoginPage() {
  if (await isDemoPageAuthenticated()) redirect("/");
  return <main className="detail-page">
    <section className="detail-panel">
      <h1>AIHR Demo Login</h1>
      <p>Enter the shared demo password to access inspection data and CRUD.</p>
      <LoginForm />
    </section>
  </main>;
}
