// Zod schemas for all Africa's Talking webhook payloads
// AT sends application/x-www-form-urlencoded POST bodies — parse with
// new URLSearchParams(await request.text()) before passing to these schemas.
//
// Field names match AT's exact casing (camelCase from their docs).
// See: https://developers.africastalking.com/docs/ussd/handle

import { z } from "zod";

// ─── USSD callback ────────────────────────────────────────────────────────────
// Posted to /api/ussd on every menu interaction

export const UssdCallbackSchema = z.object({
  // Unique session ID for this USSD session — use as Redis key
  sessionId: z.string().min(1),
  // The USSD service code dialled e.g. "*123#"
  serviceCode: z.string().min(1),
  // Caller's phone number in international format e.g. "+254712345678"
  phoneNumber: z
    .string()
    .regex(/^\+254\d{9}$/, "Phone number must be in +254XXXXXXXXX format"),
  // Mobile network code
  networkCode: z.string(),
  // Accumulated menu selections, separated by "*" e.g. "1*2*1"
  // Empty string on first callback (user just dialled)
  text: z.string(),
});

export type UssdCallback = z.infer<typeof UssdCallbackSchema>;

// ─── Inbound SMS callback ─────────────────────────────────────────────────────
// Posted to /api/sms/inbound when a user sends an SMS to the shortcode

export const InboundSmsSchema = z.object({
  // Sender's phone number
  from: z
    .string()
    .regex(/^\+254\d{9}$/, "Phone number must be in +254XXXXXXXXX format"),
  // Shortcode or sender ID the message was sent to
  to: z.string().min(1),
  // The SMS body text
  text: z.string(),
  // ISO 8601 timestamp of when AT received the message
  date: z.string(),
  // AT's unique message ID
  id: z.string().min(1),
  // Used for premium SMS billing — not needed for ICERSS but AT sends it
  linkId: z.string().optional(),
});

export type InboundSms = z.infer<typeof InboundSmsSchema>;

// ─── SMS delivery receipt ─────────────────────────────────────────────────────
// Posted to /api/sms/delivery when outbound SMS delivery status changes

export const DeliveryReceiptSchema = z.object({
  // AT message ID — matches SMSLog.atMessageId
  id: z.string().min(1),
  // Delivery status from AT
  status: z.enum([
    "Success",
    "Sent",
    "Buffered",
    "Rejected",
    "Failed",
  ]),
  // Recipient phone number
  phoneNumber: z
    .string()
    .regex(/^\+254\d{9}$/, "Phone number must be in +254XXXXXXXXX format"),
  // Network code of recipient carrier
  networkCode: z.string().optional(),
  // Only present on failure
  failureReason: z
    .enum([
      "InsufficientCredit",
      "InvalidLinkId",
      "UserInBlacklist",
      "CouldNotRoute",
      "SystemError",
      "ProcessingError",
      "MessageExpired",
      "GatewayError",
      "RejectedByGateway",
    ])
    .optional(),
  // Number of message parts (for messages > 160 chars)
  retryCount: z.string().optional(),
});

export type DeliveryReceipt = z.infer<typeof DeliveryReceiptSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse an application/x-www-form-urlencoded request body into a plain object.
 * Use before passing to any of the schemas above.
 *
 * @example
 * const body = await parseFormBody(request)
 * const result = UssdCallbackSchema.safeParse(body)
 */
export async function parseFormBody(
  request: Request
): Promise<Record<string, string>> {
  const text = await request.text();
  const params = new URLSearchParams(text);
  return Object.fromEntries(params.entries());
}
