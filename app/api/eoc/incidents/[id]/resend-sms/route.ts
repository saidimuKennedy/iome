import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendFirstAidSms } from "@/lib/sms";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/eoc/incidents/[id]/resend-sms">
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const { operatorId } = await request.json();

  const incident = await prisma.incident.findUnique({ where: { id } });
  if (!incident) return Response.json({ error: "Not found" }, { status: 404 });

  await sendFirstAidSms(incident);

  await prisma.incidentLog.create({
    data: {
      incidentId: id,
      action: "SMS_SENT",
      performedBy: operatorId,
      details: { type: "first_aid_resend" },
    },
  });

  return Response.json({ message: "First-aid SMS resent." });
}
