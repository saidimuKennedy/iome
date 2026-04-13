import { prisma } from "@/lib/prisma";
import { KpiCards } from "@/app/eoc/_components/KpiCards";
import { LiveFeed } from "@/app/eoc/_components/LiveFeed";
import type { Incident } from "@/app/generated/prisma/client";

// Severity → Tailwind colour classes
export const severityColour: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-300",
  high:     "bg-amber-100 text-amber-800 border-amber-300",
  medium:   "bg-yellow-100 text-yellow-800 border-yellow-300",
  low:      "bg-slate-100 text-slate-700 border-slate-300",
};

async function getKpiData() {
  const [open, critical, avgMs, available] = await Promise.all([
    prisma.incident.count({ where: { status: { in: ["REPORTED", "ASSIGNED", "IN_PROGRESS", "ESCALATED"] } } }),
    prisma.incident.count({ where: { severity: "critical", status: { notIn: ["RESOLVED", "CANCELLED"] } } }),
    prisma.incident.aggregate({
      _avg: { acknowledgedAt: false as never },
      where: {
        status: "RESOLVED",
        reportedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        acknowledgedAt: { not: null },
      },
    }),
    prisma.responder.count({ where: { currentStatus: "AVAILABLE" } }),
  ]);

  // Avg response time: compute from resolved incidents today
  const resolvedToday = await prisma.incident.findMany({
    where: {
      status: "RESOLVED",
      reportedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      acknowledgedAt: { not: null },
    },
    select: { reportedAt: true, acknowledgedAt: true },
  });

  const avgSec = resolvedToday.length
    ? Math.round(
        resolvedToday.reduce(
          (s, r) => s + (r.acknowledgedAt!.getTime() - r.reportedAt.getTime()) / 1000,
          0
        ) / resolvedToday.length
      )
    : null;

  return { open, critical, avgSec, available };
}

async function getRecentIncidents(): Promise<Incident[]> {
  return prisma.incident.findMany({
    where: { status: { notIn: ["RESOLVED", "CANCELLED"] } },
    orderBy: { reportedAt: "desc" },
    take: 50,
  });
}

export default async function EocDashboard() {
  const [kpi, incidents] = await Promise.all([getKpiData(), getRecentIncidents()]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">EOC Dashboard — Kisauni, Mombasa</h1>
      <KpiCards {...kpi} />
      <LiveFeed initialIncidents={incidents} />
    </div>
  );
}
