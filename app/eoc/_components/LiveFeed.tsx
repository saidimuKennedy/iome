"use client";

import { useEffect, useRef, useState } from "react";
import { IncidentCard } from "@/app/eoc/_components/IncidentCard";
import type { Incident } from "@/app/generated/prisma/client";

interface Props {
  initialIncidents: Incident[];
}

export function LiveFeed({ initialIncidents }: Props) {
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents);
  const sinceRef = useRef<string>(
    initialIncidents[0]?.reportedAt
      ? new Date(initialIncidents[0].reportedAt).toISOString()
      : new Date().toISOString()
  );

  useEffect(() => {
    const url = `/api/eoc/events?since=${encodeURIComponent(sinceRef.current)}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const newIncidents: Incident[] = JSON.parse(e.data);
        if (newIncidents.length === 0) return;

        // Update since cursor
        sinceRef.current = new Date(newIncidents[0].reportedAt).toISOString();

        // Prepend new incidents, remove duplicates, cap at 100
        setIncidents((prev) => {
          const ids = new Set(newIncidents.map((i) => i.id));
          const merged = [...newIncidents, ...prev.filter((i) => !ids.has(i.id))];
          return merged.slice(0, 100);
        });

        // Browser notification for critical severity
        if (newIncidents.some((i) => i.severity === "critical")) {
          if (Notification.permission === "granted") {
            new Notification("ICERSS — Critical Incident", {
              body: `${newIncidents.filter((i) => i.severity === "critical").length} critical incident(s) reported`,
            });
          }
        }
      } catch {
        // malformed SSE payload — ignore
      }
    };

    es.onerror = () => {
      // EventSource reconnects automatically on error
    };

    // Request notification permission on mount
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => es.close();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-800">Active Incidents</h2>
        <span className="flex items-center gap-1.5 text-xs text-green-600">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Live
        </span>
      </div>

      {incidents.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm bg-white rounded-xl border border-slate-200">
          No active incidents. Stay safe out there.
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map((incident) => (
            <IncidentCard key={incident.id} incident={incident} />
          ))}
        </div>
      )}
    </div>
  );
}
