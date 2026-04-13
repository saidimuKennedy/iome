interface Props {
  open: number;
  critical: number;
  avgSec: number | null;
  available: number;
}

function Card({ label, value, colour }: { label: string; value: string; colour: string }) {
  return (
    <div className={`rounded-xl border p-5 ${colour}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}

function fmtSeconds(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function KpiCards({ open, critical, avgSec, available }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card label="Open Incidents" value={String(open)} colour="bg-white border-slate-200 text-slate-900" />
      <Card label="Critical Unresolved" value={String(critical)} colour="bg-red-50 border-red-200 text-red-900" />
      <Card
        label="Avg Response Time (today)"
        value={avgSec !== null ? fmtSeconds(avgSec) : "—"}
        colour="bg-blue-50 border-blue-200 text-blue-900"
      />
      <Card label="Responders Available" value={String(available)} colour="bg-green-50 border-green-200 text-green-900" />
    </div>
  );
}
