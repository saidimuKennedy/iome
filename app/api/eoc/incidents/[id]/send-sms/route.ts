import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendCustomSms } from "@/lib/sms";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/eoc/incidents/[id]/send-sms">
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const { to, message, operatorId } = await request.json();

  if (!to || !message) {
    return Response.json({ error: "to and message are required." }, { status: 400 });
  }

  await sendCustomSms(to, message, id);

  await prisma.incidentLog.create({
    data: {
      incidentId: id,
      action: "SMS_SENT",
      performedBy: operatorId,
      details: { to, manual: true },
    },
  });

  return Response.json({ message: "SMS sent." });
}
