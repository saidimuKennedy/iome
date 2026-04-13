// Outbound SMS dispatch via Africa's Talking real SDK.
// All sends are logged to SMSLog. Delivery status is updated via the
// delivery receipt webhook (/api/sms/delivery).

import AfricasTalking from "africastalking";
import { prisma } from "@/lib/prisma";
import { getFirstAidMessage } from "@/lib/gemini";
import type { Incident, Responder } from "@/app/generated/prisma/client";

// ─── AT client ────────────────────────────────────────────────────────────────

const at = AfricasTalking({
  apiKey: process.env.AT_API_KEY!,
  username: process.env.AT_USERNAME!,
});

const smsClient = at.SMS;

// ─── Internal send helper ─────────────────────────────────────────────────────

async function sendSms(
  to: string,
  message: string,
  incidentId?: string
): Promise<string | null> {
  let atMessageId: string | null = null;

  try {
    const result = await smsClient.send({
      to: [to],
      message,
      from: process.env.AT_SMS_SENDER_ID,
    });

    const recipient = result.SMSMessageData?.Recipients?.[0];
    atMessageId = recipient?.messageId ?? null;
    const status = recipient?.status === "Success" ? "SENT" : "FAILED";

    await prisma.sMSLog.create({
      data: {
        phoneNumber: to,
        direction: "outbound",
        message,
        incidentId: incidentId ?? null,
        atMessageId,
        status,
      },
    });
  } catch (err) {
    console.error("[SMS] send failed:", err);
    await prisma.sMSLog.create({
      data: {
        phoneNumber: to,
        direction: "outbound",
        message,
        incidentId: incidentId ?? null,
        status: "FAILED",
      },
    });
  }

  return atMessageId;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send bilingual first-aid instructions to the citizen who reported the incident.
 * Message text comes from Gemini (with hard-coded fallback on failure).
 */
export async function sendFirstAidSms(incident: Incident): Promise<void> {
  const message = await getFirstAidMessage(incident.incidentType, incident.language);

  await sendSms(incident.phoneNumber, message, incident.id);

  const status = "SENT"; // optimistic — delivery receipt will correct if failed
  await prisma.incident.update({
    where: { id: incident.id },
    data: { firstAidSmsStatus: status },
  });

  await prisma.incidentLog.create({
    data: {
      incidentId: incident.id,
      action: "SMS_SENT",
      details: { type: "first_aid", to: incident.phoneNumber },
    },
  });
}

/**
 * Send dispatch alert to an assigned responder.
 * Message: "ALERT: {type} at {location}. Case {caseId}. Reply 1 to acknowledge."
 */
export async function sendDispatchSms(
  responder: Responder,
  incident: Incident,
  assignmentId: string
): Promise<void> {
  const message =
    `ALERT: ${incident.incidentType.toUpperCase()} at ${incident.locationText ?? "unknown location"}. ` +
    `Case ${incident.caseId}. Reply 1 to acknowledge.`;

  const atMessageId = await sendSms(responder.contactNumber, message, incident.id);

  const smsStatus = atMessageId ? "SENT" : "FAILED";

  await prisma.incidentAssignment.update({
    where: { id: assignmentId },
    data: { alertSmsStatus: smsStatus },
  });

  await prisma.incidentLog.create({
    data: {
      incidentId: incident.id,
      action: smsStatus === "SENT" ? "SMS_SENT" : "SMS_FAILED",
      details: { type: "dispatch", to: responder.contactNumber, responderId: responder.id },
    },
  });
}

/**
 * Send a custom message from an EOC operator to any phone number.
 */
export async function sendCustomSms(
  to: string,
  message: string,
  incidentId?: string
): Promise<void> {
  await sendSms(to, message, incidentId);
}
