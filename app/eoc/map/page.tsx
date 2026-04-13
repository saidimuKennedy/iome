import { prisma } from "@/lib/prisma";
import { LeafletMap } from "@/app/eoc/map/_components/LeafletMap";

export default async function MapPage() {
  const [incidents, responders, eocs] = await Promise.all([
    prisma.incident.findMany({
      where: { status: { notIn: ["RESOLVED", "CANCELLED"] }, latitude: { not: null } },
      select: {
        id: true, caseId: true, incidentType: true, severity: true,
        status: true, latitude: true, longitude: true, locationText: true,
        needsLocationReview: true,
      },
    }),
    prisma.responder.findMany({
      where: { eoc: { isActive: true } },
      select: {
        id: true, responderName: true, responderType: true, currentStatus: true,
        eoc: { select: { latitude: true, longitude: true, eocName: true } },
      },
    }),
    prisma.eOC.findMany({
      where: { isActive: true },
      select: {
        id: true, eocName: true, agencyType: true,
        latitude: true, longitude: true, coverageRadiusKm: true,
      },
    }),
  ]);

  return (
    <div className="h-[calc(100vh-3.5rem-3rem)]">
      <LeafletMap incidents={incidents as any} responders={responders as any} eocs={eocs as any} />
    </div>
  );
}
