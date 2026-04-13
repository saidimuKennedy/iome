// POST /api/sms/inbound — Africa's Talking inbound SMS callback
// Called when a responder replies to a dispatch alert.
// Accepted ACK values: "1", "YES", "ACK", "OK" (trimmed, case-insensitive).
// Everything else is logged but produces no state change.

import { prisma } from "@/lib/prisma";
import { parseFormBody, InboundSmsSchema } from "@/lib/schemas";
import { cancelEscalation } from "@/lib/queues";

const ACK_PATTERN = /^(1|yes|ack|ok)$/i;

export async function POST(request: Request) {
  const body = await parseFormBody(request);
  const parsed = InboundSmsSchema.safeParse(body);

  if (!parsed.success) {
    return new Response("", { status: 200 }); // AT expects 200 regardless
  }

  const { from, text, id: atMessageId } = parsed.data;
  const messageText = text.trim();
  const isAck = ACK_PATTERN.test(messageText);

  // Find the responder by phone number
  const responder = await prisma.responder.findFirst({
    where: { contactNumber: from },
  });

  // Log every inbound message regardless of content or responder match
  await prisma.sMSLog.create({
    data: {
      phoneNumber: from,
      direction: "inbound",
      message: messageText,
      atMessageId,
      status: "DELIVERED",
    },
  });

  if (!responder || !isAck) {
    // Unknown sender or non-ACK reply — log and done
    return new Response("", { status: 200 });
  }

  // Find their most recent ASSIGNED IncidentAssignment
  // Constraint: a responder can only have one ASSIGNED incident at a time (enforced in routing)
  const assignment = await prisma.incidentAssignment.findFirst({
    where: {
      responderId: responder.id,
      acknowledgedAt: null,
      incident: { status: { in: ["ASSIGNED", "ESCALATED"] } },
    },
    orderBy: { assignedAt: "desc" },
    include: { incident: true },
  });

  if (!assignment) {
    return new Response("", { status: 200 }); // No pending assignment — stale reply
  }

  const now = new Date();

  // Acknowledge the assignment
  await prisma.incidentAssignment.update({
    where: { id: assignment.id },
    data: { acknowledgedAt: now },
  });

  // Update incident to IN_PROGRESS and set acknowledgedAt
  await prisma.incident.update({
    where: { id: assignment.incidentId },
    data: { status: "IN_PROGRESS", acknowledgedAt: now },
  });

  // Write audit log
  await prisma.incidentLog.create({
    data: {
      incidentId: assignment.incidentId,
      action: "ACK",
      details: { responderId: responder.id, via: "sms", message: messageText },
    },
  });

  // Update the SMS log with the linked incident
  await prisma.sMSLog.updateMany({
    where: { atMessageId, phoneNumber: from },
    data: { incidentId: assignment.incidentId },
  });

  // Cancel the pending escalation timer for this assignment
  await cancelEscalation(assignment.id);

  return new Response("", { status: 200 });
}
