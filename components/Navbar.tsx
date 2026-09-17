import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

export default async function Navbar() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white text-sm font-bold">
            PG
          </span>
          ProductGenie <span className="text-indigo-600">AI</span>
        </Link>

        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="px-3 py-2 rounded-md text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 transition"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/new"
                className="px-3 py-2 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
              >
                New product
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-2 rounded-md text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 transition"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="px-3 py-2 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
              >
                Get started free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
