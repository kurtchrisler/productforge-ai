import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AuthCard from "@/components/AuthCard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-16 bg-zinc-50">
      <AuthCard />
    </div>
  );
}
