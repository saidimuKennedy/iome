// Dedup and rate-limit checks — called before writing any Incident to the DB.
// Implementation plan change #10 and unhappy path U7.

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import type { Incident } from "@/app/generated/prisma/client";

// ─── Haversine distance (metres) ──────────────────────────────────────────────

function haversineMetres(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Dedup check ──────────────────────────────────────────────────────────────
// Same incidentType + within 200m + within 10 min → treat as duplicate.
// Returns the existing Incident to merge into, or null if no duplicate found.
// When lat/lng are unknown (Other location, geocoder failed) we skip the
// distance check and only deduplicate by type + phone within the window.

export async function checkDedup(
  phone: string,
  incidentType: string,
  lat: number | null,
  lng: number | null
): Promise<Incident | null> {
  const windowStart = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago

  const candidates = await prisma.incident.findMany({
    where: {
      incidentType: incidentType as any,
      reportedAt: { gte: windowStart },
      status: { notIn: ["RESOLVED", "CANCELLED"] },
    },
  });

  for (const candidate of candidates) {
    // If we have GPS for both, use distance check
    if (lat !== null && lng !== null && candidate.latitude !== null && candidate.longitude !== null) {
      const dist = haversineMetres(lat, lng, candidate.latitude, candidate.longitude);
      if (dist < 200) {
        // Merge: increment report_count
        await prisma.incident.update({
          where: { id: candidate.id },
          data: { reportCount: { increment: 1 } },
        });
        await prisma.incidentLog.create({
          data: {
            incidentId: candidate.id,
            action: "MERGED",
            details: { mergedPhone: phone, distanceMetres: Math.round(dist) },
          },
        });
        return candidate;
      }
    } else {
      // No GPS — fall back to same phone + same type within window
      if (candidate.phoneNumber === phone) {
        await prisma.incident.update({
          where: { id: candidate.id },
          data: { reportCount: { increment: 1 } },
        });
        await prisma.incidentLog.create({
          data: {
            incidentId: candidate.id,
            action: "MERGED",
            details: { mergedPhone: phone, reason: "no-gps-same-phone" },
          },
        });
        return candidate;
      }
    }
  }

  return null;
}

// ─── Rate limit check ─────────────────────────────────────────────────────────
// More than 3 incidents from the same phone in any 5-minute window → block.
// Uses Redis INCR + EXPIRE so the counter is atomic and auto-expires.
// Returns true if the caller is rate-limited (should reject the request).

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_SEC = 300; // 5 minutes

export async function checkRateLimit(phone: string): Promise<boolean> {
  const key = `ratelimit:${phone}`;
  const count = await redis.incr(key);
  if (count === 1) {
    // First hit — set TTL
    await redis.expire(key, RATE_LIMIT_WINDOW_SEC);
  }
  return count > RATE_LIMIT_MAX;
}
