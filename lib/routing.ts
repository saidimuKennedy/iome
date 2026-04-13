// Smart Routing Engine — assigns responders to a newly created Incident.
// Called from the BullMQ post-create worker after an Incident is confirmed.
// Implementation plan §2 Layer 04 + change #11 (multi-agency child table).

import { prisma } from "@/lib/prisma";
import { scheduleEscalation } from "@/lib/queues";
import type { Incident, Responder } from "@/app/generated/prisma/client";

// ─── Haversine distance (km) ──────────────────────────────────────────────────

function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Multi-agency rule ────────────────────────────────────────────────────────
// Fire or medical + life-threatening → assign both primary type AND medical/fire.
// All other cases → single agency match.

function requiredAgencyTypes(incident: Incident): string[] {
  const { incidentType, lifeThreating } = incident;
  if (lifeThreating && (incidentType === "fire" || incidentType === "medical")) {
    // Fire scene needs medical too, medical scene may need fire/rescue
    return incidentType === "fire" ? ["fire", "medical"] : ["medical", "fire"];
  }
  return [incidentType];
}

// ─── Main routing function ────────────────────────────────────────────────────

/**
 * Assigns one AVAILABLE responder per required agency type to the incident.
 * Creates IncidentAssignment rows, sets responders BUSY, writes ASSIGNED log.
 * Returns the list of assigned Responders (for SMS dispatch).
 */
export async function assignResponders(incidentId: string): Promise<Responder[]> {
  const incident = await prisma.incident.findUniqueOrThrow({
    where: { id: incidentId },
  });

  const requiredTypes = requiredAgencyTypes(incident);
  const assigned: Responder[] = [];

  for (const type of requiredTypes) {
    // Find all active EOCs that handle this incident type
    const eocs = await prisma.eOC.findMany({
      where: {
        isActive: true,
        handlesIncidentTypes: { has: type as any },
      },
      include: {
        responders: {
          where: {
            currentStatus: "AVAILABLE",
            handlesIncidentTypes: { has: type as any },
          },
        },
      },
    });

    if (eocs.length === 0) continue;

    // If incident has GPS: pick EOC within coverage radius, nearest first.
    // If no GPS: pick the first active EOC that handles the type (needs_location_review).
    let bestResponder: Responder | null = null;

    if (incident.latitude !== null && incident.longitude !== null) {
      // Sort EOCs by distance, filter by coverage radius
      const inRange = eocs
        .map((eoc) => ({
          eoc,
          distKm: haversineKm(
            incident.latitude!, incident.longitude!,
            eoc.latitude, eoc.longitude
          ),
        }))
        .filter(({ eoc, distKm }) => distKm <= eoc.coverageRadiusKm)
        .sort((a, b) => a.distKm - b.distKm);

      for (const { eoc } of inRange) {
        if (eoc.responders.length > 0) {
          bestResponder = eoc.responders[0];
          break;
        }
      }
    } else {
      // No GPS — pick from any matching EOC
      for (const eoc of eocs) {
        if (eoc.responders.length > 0) {
          bestResponder = eoc.responders[0];
          break;
        }
      }
    }

    if (!bestResponder) continue;

    // Create assignment
    const assignment = await prisma.incidentAssignment.create({
      data: {
        incidentId: incident.id,
        responderId: bestResponder.id,
      },
    });

    // Mark responder busy (enforces one-active-incident-per-responder rule)
    await prisma.responder.update({
      where: { id: bestResponder.id },
      data: { currentStatus: "BUSY" },
    });

    // Schedule escalation timer (default 5 min)
    await scheduleEscalation(assignment.id);

    assigned.push(bestResponder);
  }

  if (assigned.length > 0) {
    // Update incident status and write audit log
    await prisma.incident.update({
      where: { id: incident.id },
      data: { status: "ASSIGNED" },
    });

    await prisma.incidentLog.create({
      data: {
        incidentId: incident.id,
        action: "ASSIGNED",
        details: { responderIds: assigned.map((r) => r.id) },
      },
    });
  }

  return assigned;
}
