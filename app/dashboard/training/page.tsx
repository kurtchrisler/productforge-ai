import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="max-w-4xl mx-auto w-full px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 hover:text-zinc-800 transition"
      >
        ← Back to dashboard
      </Link>

      <h1 className="text-2xl font-bold text-zinc-900 mt-4">Training</h1>
      <p className="text-zinc-500 text-sm mt-1 mb-8">
        A quick walkthrough of how to use ProductGenie AI — from your first
        idea to a finished, ready-to-sell product.
      </p>

      <div className="rounded-xl overflow-hidden bg-black shadow-sm">
        <video
          controls
          preload="metadata"
          className="w-full aspect-video bg-black"
        >
          <source src="/api/training-video" type="video/mp4" />
          Your browser doesn&apos;t support embedded video. You can{" "}
          <a href="/api/training-video" className="underline">
            download the training video
          </a>{" "}
          instead.
        </video>
      </div>
    </div>
  );
}
