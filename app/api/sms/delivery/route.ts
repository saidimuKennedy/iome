// POST /api/sms/delivery — Africa's Talking delivery receipt callback
// Updates SMSLog, Incident.firstAidSmsStatus, and IncidentAssignment.alertSmsStatus.

import { prisma } from "@/lib/prisma";
import { parseFormBody, DeliveryReceiptSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const body = await parseFormBody(request);
  const parsed = DeliveryReceiptSchema.safeParse(body);

  if (!parsed.success) {
    return new Response("", { status: 200 });
  }

  const { id: atMessageId, status, phoneNumber } = parsed.data;

  const deliveryStatus =
    status === "Success" || status === "Sent" ? "DELIVERED" : "FAILED";

  // Update the SMS log entry
  const updated = await prisma.sMSLog.updateMany({
    where: { atMessageId },
    data: { status: deliveryStatus },
  });

  if (updated.count === 0) return new Response("", { status: 200 });

  // Fetch the log to get incidentId and determine which field to update
  const smsLog = await prisma.sMSLog.findFirst({
    where: { atMessageId },
  });

  if (!smsLog?.incidentId) return new Response("", { status: 200 });

  // Determine if this was a first-aid SMS (to citizen) or dispatch SMS (to responder)
  const incident = await prisma.incident.findUnique({
    where: { id: smsLog.incidentId },
    include: { assignments: { include: { responder: true } } },
  });

  if (!incident) return new Response("", { status: 200 });

  const smsStatusValue = deliveryStatus === "DELIVERED" ? "DELIVERED" : "FAILED";

  if (incident.phoneNumber === phoneNumber) {
    // This is the first-aid SMS to the citizen
    await prisma.incident.update({
      where: { id: incident.id },
      data: { firstAidSmsStatus: smsStatusValue },
    });
  } else {
    // This is a dispatch SMS to a responder
    const assignment = incident.assignments.find(
      (a) => a.responder.contactNumber === phoneNumber
    );
    if (assignment) {
      await prisma.incidentAssignment.update({
        where: { id: assignment.id },
        data: { alertSmsStatus: smsStatusValue },
      });
    }
  }

  // Log SMS failure to the incident audit trail
  if (deliveryStatus === "FAILED") {
    await prisma.incidentLog.create({
      data: {
        incidentId: incident.id,
        action: "SMS_FAILED",
        details: { atMessageId, phoneNumber, atStatus: status },
      },
    });
  }

  return new Response("", { status: 200 });
}
