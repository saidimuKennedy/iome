import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { cancelEscalation } from "@/lib/queues";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/eoc/incidents/[id]/acknowledge">
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const { operatorId } = await request.json();

  const incident = await prisma.incident.findUnique({ where: { id }, include: { assignments: true } });
  if (!incident) return Response.json({ error: "Not found" }, { status: 404 });

  const now = new Date();

  await prisma.incident.update({
    where: { id },
    data: { status: "IN_PROGRESS", acknowledgedAt: now },
  });

  // Acknowledge all pending assignments
  for (const a of incident.assignments.filter((a) => !a.acknowledgedAt)) {
    await prisma.incidentAssignment.update({
      where: { id: a.id },
      data: { acknowledgedAt: now },
    });
    await cancelEscalation(a.id);
  }

  await prisma.incidentLog.create({
    data: {
      incidentId: id,
      action: "ACK",
      performedBy: operatorId,
      details: { via: "dashboard" },
    },
  });

  return Response.json({ message: "Incident acknowledged." });
}
