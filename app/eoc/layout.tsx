import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function EocLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top nav */}
      <nav className="bg-slate-900 text-white h-14 flex items-center px-6 gap-6 shrink-0">
        <span className="font-bold tracking-wide text-cyan-400">ICERSS</span>
        <Link href="/eoc" className="text-sm text-slate-300 hover:text-white transition-colors">
          Dashboard
        </Link>
        <Link href="/eoc/map" className="text-sm text-slate-300 hover:text-white transition-colors">
          Map
        </Link>
        <Link href="/eoc/incidents" className="text-sm text-slate-300 hover:text-white transition-colors">
          All Incidents
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-slate-400">{session.user.email}</span>
          <Link
            href="/api/auth/signout"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Sign out
          </Link>
        </div>
      </nav>

      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
