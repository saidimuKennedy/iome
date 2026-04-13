import Link from "next/link";
import { severityColour } from "@/app/eoc/page";
import type { Incident } from "@/app/generated/prisma/client";

function timeAgo(date: Date): string {
  const sec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

export function IncidentCard({ incident }: { incident: Incident }) {
  const badgeClass = severityColour[incident.severity] ?? severityColour.low;
  const isEscalated = incident.status === "ESCALATED";

  return (
    <Link
      href={`/eoc/incidents/${incident.id}`}
      className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-400 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badgeClass}`}>
              {incident.severity.toUpperCase()}
            </span>

            {isEscalated && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-300">
                ESCALATED
              </span>
            )}

            {incident.reportCount > 1 && (
              <span className="text-xs text-slate-500">
                {incident.reportCount} reports
              </span>
            )}

            {incident.needsLocationReview && (
              <span title="Location needs review" className="text-base">🚩</span>
            )}

            {incident.firstAidSmsStatus === "FAILED" && (
              <span title="First-aid SMS failed" className="text-base">📵</span>
            )}
          </div>

          <p className="mt-1 font-semibold text-slate-900 capitalize">
            {incident.incidentType} — {incident.locationText ?? "Unknown location"}
          </p>

          <p className="text-xs text-slate-500 mt-0.5">
            {incident.caseId} · {timeAgo(incident.reportedAt)} · {incident.language.toUpperCase()}
          </p>
        </div>

        <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-lg ${
          incident.status === "REPORTED" ? "bg-slate-100 text-slate-600" :
          incident.status === "ASSIGNED" ? "bg-blue-100 text-blue-700" :
          incident.status === "IN_PROGRESS" ? "bg-green-100 text-green-700" :
          incident.status === "ESCALATED" ? "bg-orange-100 text-orange-700" :
          "bg-slate-100 text-slate-600"
        }`}>
          {incident.status.replace("_", " ")}
        </span>
      </div>
    </Link>
  );
}
