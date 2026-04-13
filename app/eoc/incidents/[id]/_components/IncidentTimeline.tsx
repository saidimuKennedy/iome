import type { IncidentLog } from "@/app/generated/prisma/client";

const actionColour: Record<string, string> = {
  CREATED:   "bg-slate-400",
  ASSIGNED:  "bg-blue-500",
  ACK:       "bg-green-500",
  IN_PROGRESS:"bg-green-600",
  RESOLVED:  "bg-emerald-600",
  ESCALATED: "bg-orange-500",
  SMS_SENT:  "bg-cyan-500",
  SMS_FAILED:"bg-red-500",
  MERGED:    "bg-purple-500",
  REASSIGNED:"bg-yellow-500",
  CANCELLED: "bg-slate-400",
};

export function IncidentTimeline({ logs }: { logs: IncidentLog[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="font-semibold text-slate-800 mb-4">Audit Trail</h2>
      <div className="relative space-y-4">
        {logs.map((log, i) => (
          <div key={log.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`w-3 h-3 rounded-full shrink-0 mt-0.5 ${actionColour[log.action] ?? "bg-slate-400"}`} />
              {i < logs.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
            </div>
            <div className="pb-4 flex-1">
              <p className="text-sm font-medium text-slate-800">{log.action.replace("_", " ")}</p>
              {log.details && (
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {JSON.stringify(log.details)}
                </p>
              )}
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date(log.timestamp).toLocaleString()}
                {log.performedBy && ` · ${log.performedBy}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
