// BullMQ worker process — runs alongside the Next.js server.
// Start with: npm run worker
// All queues share the same Redis instance as USSD sessions.

import "dotenv/config";
// Load .env.local for local development (dotenv only loads .env by default)
import { config } from "dotenv";
config({ path: ".env.local" });

import { Worker, type Job } from "bullmq";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { assignResponders } from "@/lib/routing";
import { sendFirstAidSms, sendDispatchSms } from "@/lib/sms";
import { geocode } from "@/lib/geocoder";
import {
  QUEUE_POST_CREATE,
  QUEUE_ESCALATION,
  QUEUE_STATS_SNAPSHOT,
  QUEUE_FAILED_RETRY,
  statsSnapshotQueue,
  failedRetryQueue,
} from "@/lib/queues";

const connection = redis;

// ─── Worker 1: incident-post-create ──────────────────────────────────────────
// Runs after every confirmed Incident in sequence:
// 1. Geocode if "Other" location
// 2. Smart Routing → assign responders
// 3. Dispatch SMS to each responder
// 4. Send first-aid SMS to citizen

new Worker(
  QUEUE_POST_CREATE,
  async (job: Job<{ incidentId: string }>) => {
    const { incidentId } = job.data;
    const incident = await prisma.incident.findUniqueOrThrow({
      where: { id: incidentId },
    });

    // Step 1 — Geocode "Other" locations
    if (!incident.latitude && incident.locationText) {
      const point = await geocode(incident.locationText);
      if (point) {
        await prisma.incident.update({
          where: { id: incidentId },
          data: {
            latitude: point.lat,
            longitude: point.lng,
            needsLocationReview: false,
          },
        });
      }
      // If geocode fails, needsLocationReview stays true — EOC operator sees flag
    }

    // Step 2 — Smart Routing
    const responders = await assignResponders(incidentId);

    // Step 3 — Dispatch SMS to each assigned responder
    const freshIncident = await prisma.incident.findUniqueOrThrow({
      where: { id: incidentId },
      include: { assignments: true },
    });

    for (const responder of responders) {
      const assignment = freshIncident.assignments.find(
        (a) => a.responderId === responder.id
      );
      if (assignment) {
        await sendDispatchSms(responder, freshIncident, assignment.id);
      }
    }

    // Step 4 — First-aid SMS to citizen
    await sendFirstAidSms(freshIncident);
  },
  { connection, concurrency: 5 }
);

// ─── Worker 2: escalation ─────────────────────────────────────────────────────
// Fires N minutes after an IncidentAssignment is created.
// If the responder hasn't acknowledged: flip to ESCALATED.

new Worker(
  QUEUE_ESCALATION,
  async (job: Job<{ assignmentId: string }>) => {
    const { assignmentId } = job.data;
    const assignment = await prisma.incidentAssignment.findUnique({
      where: { id: assignmentId },
      include: { incident: true },
    });

    if (!assignment) return; // already cleaned up
    if (assignment.acknowledgedAt) return; // already acknowledged — no-op

    // Escalate
    await prisma.incidentAssignment.update({
      where: { id: assignmentId },
      data: { escalated: true },
    });

    await prisma.incident.update({
      where: { id: assignment.incidentId },
      data: { status: "ESCALATED" },
    });

    await prisma.incidentLog.create({
      data: {
        incidentId: assignment.incidentId,
        action: "ESCALATED",
        details: { assignmentId, reason: "no_ack_timeout" },
      },
    });

    console.log(`[Escalation] incident ${assignment.incidentId} escalated — responder ${assignment.responderId} did not acknowledge`);
  },
  { connection }
);

// ─── Worker 3: stats-snapshot ─────────────────────────────────────────────────
// Repeating job — aggregates incident stats and upserts the PublicStatsSnapshot singleton.

new Worker(
  QUEUE_STATS_SNAPSHOT,
  async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalMonth, resolved, byType, byHour] = await Promise.all([
      // Total incidents this month
      prisma.incident.count({ where: { reportedAt: { gte: monthStart } } }),

      // Resolved incidents with response time data
      prisma.incident.findMany({
        where: {
          status: "RESOLVED",
          reportedAt: { gte: monthStart },
          acknowledgedAt: { not: null },
        },
        select: { reportedAt: true, acknowledgedAt: true },
      }),

      // Count by type
      prisma.incident.groupBy({
        by: ["incidentType"],
        where: { reportedAt: { gte: monthStart } },
        _count: { _all: true },
      }),

      // Count by hour of day
      prisma.$queryRaw<{ hour: number; count: bigint }[]>`
        SELECT EXTRACT(HOUR FROM "reportedAt")::int AS hour, COUNT(*)::bigint AS count
        FROM "Incident"
        WHERE "reportedAt" >= ${monthStart}
        GROUP BY hour
        ORDER BY hour
      `,
    ]);

    const resolutionRatePct =
      totalMonth > 0 ? (resolved.length / totalMonth) * 100 : 0;

    const avgResponseTimeSec =
      resolved.length > 0
        ? Math.round(
            resolved.reduce((sum, r) => {
              const ackMs = r.acknowledgedAt!.getTime() - r.reportedAt.getTime();
              return sum + ackMs / 1000;
            }, 0) / resolved.length
          )
        : 0;

    await prisma.publicStatsSnapshot.upsert({
      where: { id: "singleton" },
      update: {
        lastUpdated: now,
        totalIncidentsMonth: totalMonth,
        avgResponseTimeSec,
        resolutionRatePct,
        incidentsByTypeJson: byType.map((r) => ({
          type: r.incidentType,
          count: r._count._all,
        })),
        incidentsByHourJson: byHour.map((r) => ({
          hour: r.hour,
          count: Number(r.count),
        })),
      },
      create: {
        id: "singleton",
        lastUpdated: now,
        totalIncidentsMonth: totalMonth,
        avgResponseTimeSec,
        resolutionRatePct,
        incidentsByTypeJson: byType.map((r) => ({
          type: r.incidentType,
          count: r._count._all,
        })),
        incidentsByHourJson: byHour.map((r) => ({
          hour: r.hour,
          count: Number(r.count),
        })),
      },
    });

    console.log(`[StatsSnapshot] updated — ${totalMonth} incidents this month`);
  },
  { connection }
);

// ─── Repeating jobs (schedule on startup) ─────────────────────────────────────

async function scheduleRepeatingJobs() {
  // Stats snapshot every 5 minutes
  await statsSnapshotQueue.add(
    "run",
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      jobId: "stats-snapshot-repeat",
    }
  );

  console.log("[Worker] repeating jobs scheduled");
}

scheduleRepeatingJobs().catch(console.error);

console.log("[Worker] all workers started — waiting for jobs");
