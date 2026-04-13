import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/eoc/incidents/[id]/resolve">
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const { notes, operatorId } = await request.json();

  if (!notes || notes.trim().length < 5) {
    return Response.json({ error: "Resolution notes are required (min 5 characters)." }, { status: 400 });
  }

  await prisma.incident.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolutionNotes: notes.trim(),
    },
  });

  await prisma.incidentLog.create({
    data: {
      incidentId: id,
      action: "RESOLVED",
      performedBy: operatorId,
      details: { notes: notes.trim() },
    },
  });

  return Response.json({ message: "Incident marked as resolved." });
}
