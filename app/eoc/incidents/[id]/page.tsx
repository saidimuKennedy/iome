import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { IncidentActions } from "@/app/eoc/incidents/[id]/_components/IncidentActions";
import { IncidentTimeline } from "@/app/eoc/incidents/[id]/_components/IncidentTimeline";
import { severityColour } from "@/app/eoc/page";

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const incident = await prisma.incident.findUnique({
    where: { id },
    include: {
      assignments: { include: { responder: { include: { eoc: true } } } },
      logs: { orderBy: { timestamp: "asc" } },
      smsLogs: { orderBy: { timestamp: "desc" } },
      location: true,
    },
  });

  if (!incident) notFound();

  const badgeClass = severityColour[incident.severity] ?? severityColour.low;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badgeClass}`}>
                {incident.severity.toUpperCase()}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {incident.status.replace("_", " ")}
              </span>
              {incident.needsLocationReview && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
                  🚩 Location needs review
                </span>
              )}
              {incident.reportCount > 1 && (
                <span className="text-xs text-slate-500">{incident.reportCount} reports merged</span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900 capitalize">
              {incident.incidentType} Emergency
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {incident.caseId} · {incident.locationText ?? "Location unknown"} ·{" "}
              {new Date(incident.reportedAt).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Details grid */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Phone</p>
            <p className="font-medium text-slate-800">{incident.phoneNumber}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Language</p>
            <p className="font-medium text-slate-800">{incident.language === "sw" ? "Kiswahili" : "English"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Life-threatening</p>
            <p className="font-medium text-slate-800">{incident.lifeThreating ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">GPS</p>
            <p className="font-medium text-slate-800">
              {incident.latitude && incident.longitude
                ? `${incident.latitude.toFixed(5)}, ${incident.longitude.toFixed(5)}`
                : "Not available"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">First-aid SMS</p>
            <p className={`font-medium ${incident.firstAidSmsStatus === "FAILED" ? "text-red-600" : "text-slate-800"}`}>
              {incident.firstAidSmsStatus}
            </p>
          </div>
          {incident.acknowledgedAt && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Acknowledged</p>
              <p className="font-medium text-slate-800">
                {new Date(incident.acknowledgedAt).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Assignments */}
      {incident.assignments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-800 mb-3">Assigned Responders</h2>
          <div className="space-y-2">
            {incident.assignments.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-4 text-sm border border-slate-100 rounded-lg px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-800">{a.responder.responderName}</p>
                  <p className="text-slate-500 text-xs">
                    {a.responder.responderType} · {a.responder.eoc.eocName} · {a.responder.contactNumber}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    a.acknowledgedAt ? "bg-green-100 text-green-700" :
                    a.escalated ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600"
                  }`}>
                    {a.acknowledgedAt ? "ACK'd" : a.escalated ? "Escalated" : "Pending"}
                  </span>
                  {a.alertSmsStatus === "FAILED" && (
                    <p className="text-xs text-red-600 mt-0.5">📵 SMS failed</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions panel */}
      <IncidentActions incident={incident} operatorId={(session?.user as any)?.id ?? ""} />

      {/* Audit timeline */}
      <IncidentTimeline logs={incident.logs} />

      {/* SMS log */}
      {incident.smsLogs.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-800 mb-3">Message Log</h2>
          <div className="space-y-2">
            {incident.smsLogs.map((sms) => (
              <div key={sms.id} className="text-sm flex gap-3">
                <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full h-fit ${
                  sms.direction === "inbound"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-600"
                }`}>
                  {sms.direction}
                </span>
                <div>
                  <p className="text-slate-800">{sms.message}</p>
                  <p className="text-xs text-slate-400">
                    {sms.phoneNumber} · {new Date(sms.timestamp).toLocaleString()} · {sms.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
