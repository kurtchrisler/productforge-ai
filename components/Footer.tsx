import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-zinc-200 py-8">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-zinc-500">
        <span>ProductGenie AI</span>
        <nav className="flex items-center gap-5">
          <Link href="/terms" className="hover:text-zinc-800 transition">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-zinc-800 transition">
            Privacy Policy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
