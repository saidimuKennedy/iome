// BullMQ queue definitions and job enqueueing helpers.
// Workers that process these jobs live in scripts/worker.ts.
// All queues share the same Redis instance used for USSD sessions.

import { Queue } from "bullmq";
import { redis } from "@/lib/redis";

// ─── Queue names ──────────────────────────────────────────────────────────────

export const QUEUE_POST_CREATE = "incident-post-create";
export const QUEUE_ESCALATION = "escalation";
export const QUEUE_STATS_SNAPSHOT = "stats-snapshot";
export const QUEUE_FAILED_RETRY = "failed-incident-retry";

// ─── Queue instances ──────────────────────────────────────────────────────────
// BullMQ requires maxRetriesPerRequest: null on the Redis connection — already
// set in lib/redis.ts. We pass the connection directly to avoid creating
// extra Redis connections.

const connection = redis;

export const postCreateQueue = new Queue(QUEUE_POST_CREATE, { connection });
export const escalationQueue = new Queue(QUEUE_ESCALATION, { connection });
export const statsSnapshotQueue = new Queue(QUEUE_STATS_SNAPSHOT, { connection });
export const failedRetryQueue = new Queue(QUEUE_FAILED_RETRY, { connection });

// ─── Enqueue helpers ──────────────────────────────────────────────────────────

/**
 * Enqueue the post-create pipeline for a newly confirmed Incident.
 * The worker runs: routing → responder dispatch SMS → Gemini first-aid SMS
 */
export async function enqueuePostCreate(incidentId: string): Promise<void> {
  await postCreateQueue.add(
    "process",
    { incidentId },
    { attempts: 3, backoff: { type: "exponential", delay: 2000 } }
  );
}

/**
 * Schedule an escalation check N minutes after an IncidentAssignment is created.
 * If the responder hasn't acknowledged by then, status → ESCALATED.
 */
export async function scheduleEscalation(
  assignmentId: string,
  delayMs: number = 5 * 60 * 1000 // 5 minutes default
): Promise<void> {
  await escalationQueue.add(
    "check",
    { assignmentId },
    {
      delay: delayMs,
      attempts: 2,
      jobId: `escalation:${assignmentId}`, // deduplicate — one per assignment
    }
  );
}

/**
 * Cancel a pending escalation job (called when responder acknowledges).
 */
export async function cancelEscalation(assignmentId: string): Promise<void> {
  const job = await escalationQueue.getJob(`escalation:${assignmentId}`);
  if (job) await job.remove();
}
