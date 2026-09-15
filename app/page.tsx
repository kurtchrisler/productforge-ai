import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { PRODUCT_TYPE_LIST } from "@/lib/productTypes";

export default async function Home() {
  const user = await getCurrentUser();
  const ctaHref = user ? "/dashboard/new" : "/signup";

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="bg-gradient-to-b from-indigo-50 via-white to-white">
        <div className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          <span className="inline-block text-xs font-semibold tracking-wide uppercase text-indigo-600 bg-indigo-100 rounded-full px-3 py-1 mb-6">
            AI digital product factory
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-900 leading-tight">
            Turn any idea into a
            <span className="text-indigo-600"> ready-to-launch </span>
            digital product
          </h1>
          <p className="mt-6 text-lg text-zinc-600 max-w-2xl mx-auto">
            Describe your idea in a sentence. ProductForge AI writes it,
            structures it, and typesets it into a downloadable PDF —
            ebook, guide, planner, workbook, or template — in minutes.
          </p>
          <div className="mt-9 flex items-center justify-center gap-4">
            <Link
              href={ctaHref}
              className="px-6 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition shadow-sm"
            >
              {user ? "Create a new product" : "Start creating — it's free"}
            </Link>
            {!user && (
              <Link
                href="/login"
                className="px-6 py-3 rounded-lg border border-zinc-300 text-zinc-700 font-semibold hover:bg-zinc-50 transition"
              >
                I already have an account
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Product types */}
      <section className="max-w-6xl mx-auto px-6 py-16 w-full">
        <h2 className="text-2xl font-bold text-center text-zinc-900">
          One idea. Five kinds of product.
        </h2>
        <p className="text-center text-zinc-600 mt-2 max-w-xl mx-auto">
          Pick the format that fits your idea — the AI adapts structure,
          tone, and layout to match.
        </p>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
          {PRODUCT_TYPE_LIST.map((pt) => (
            <div
              key={pt.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 flex flex-col gap-2 hover:shadow-md transition"
              style={{ borderTopColor: pt.accent, borderTopWidth: 3 }}
            >
              <div className="text-2xl">{pt.emoji}</div>
              <div className="font-semibold text-zinc-900">{pt.label}</div>
              <div className="text-sm text-zinc-600">{pt.description}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-zinc-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-center">How it works</h2>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Describe your idea",
                body: "One sentence is enough — a topic, an audience, an outcome you want to deliver.",
              },
              {
                step: "2",
                title: "Pick a format",
                body: "Ebook, guide, planner, workbook, or template. Each has its own structure and layout.",
              },
              {
                step: "3",
                title: "Download the PDF",
                body: "AI writes and typesets a complete, ready-to-sell product — download it and publish.",
              },
            ].map((s) => (
              <div key={s.step} className="text-center sm:text-left">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 font-bold mb-4">
                  {s.step}
                </div>
                <div className="font-semibold text-lg">{s.title}</div>
                <div className="text-zinc-400 mt-1 text-sm">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-zinc-900">
          Your next digital product starts with one idea.
        </h2>
        <div className="mt-8">
          <Link
            href={ctaHref}
            className="px-6 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition shadow-sm"
          >
            {user ? "Create a new product" : "Get started free"}
          </Link>
        </div>
      </section>

      <footer className="border-t border-zinc-200 py-8 text-center text-sm text-zinc-500">
        ProductForge AI
      </footer>
    </div>
  );
}
