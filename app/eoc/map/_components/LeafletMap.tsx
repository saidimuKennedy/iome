"use client";

import { useEffect, useRef } from "react";

interface MapIncident {
  id: string; caseId: string; incidentType: string; severity: string;
  status: string; latitude: number; longitude: number; locationText: string | null;
  needsLocationReview: boolean;
}

interface MapResponder {
  id: string; responderName: string; responderType: string; currentStatus: string;
  eoc: { latitude: number; longitude: number; eocName: string };
}

interface MapEoc {
  id: string; eocName: string; agencyType: string;
  latitude: number; longitude: number; coverageRadiusKm: number;
}

interface Props {
  incidents: MapIncident[];
  responders: MapResponder[];
  eocs: MapEoc[];
}

// Kisauni, Mombasa centre coordinates
const KISAUNI_CENTER: [number, number] = [-3.9797, 39.6888];

export function LeafletMap({ incidents, responders, eocs }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    // Dynamically import Leaflet (browser-only)
    import("leaflet").then((L) => {
      // Fix default marker icon path broken by bundlers
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!).setView(KISAUNI_CENTER, 14);
      leafletRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      const severityColour: Record<string, string> = {
        critical: "#ef4444", high: "#f59e0b", medium: "#eab308", low: "#94a3b8",
      };

      // EOC coverage circles + blue pins
      eocs.forEach((eoc) => {
        L.circle([eoc.latitude, eoc.longitude], {
          radius: eoc.coverageRadiusKm * 1000,
          color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.05, weight: 1.5,
        }).addTo(map);

        L.circleMarker([eoc.latitude, eoc.longitude], {
          radius: 10, color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 1, weight: 2,
        }).addTo(map).bindPopup(`<b>${eoc.eocName}</b><br>${eoc.agencyType}`);
      });

      // Incident pins — red shades by severity
      incidents.forEach((inc) => {
        const colour = severityColour[inc.severity] ?? "#94a3b8";
        const marker = L.circleMarker([inc.latitude, inc.longitude], {
          radius: 12, color: colour, fillColor: colour, fillOpacity: 0.85, weight: 2,
        }).addTo(map);

        marker.bindPopup(
          `<b>${inc.caseId}</b><br>${inc.incidentType.toUpperCase()} — ${inc.severity}<br>` +
          `${inc.locationText ?? ""}<br>` +
          `<a href="/eoc/incidents/${inc.id}" target="_blank" style="color:#3b82f6">Open →</a>` +
          (inc.needsLocationReview ? `<br><span style="color:#f59e0b">🚩 Location needs review</span>` : "")
        );
      });

      // Responder pins — green if available, grey if busy
      responders.forEach((r) => {
        const colour = r.currentStatus === "AVAILABLE" ? "#22c55e" : "#94a3b8";
        L.circleMarker([r.eoc.latitude, r.eoc.longitude], {
          radius: 7, color: colour, fillColor: colour, fillOpacity: 0.9, weight: 2,
        }).addTo(map).bindPopup(
          `<b>${r.responderName}</b><br>${r.responderType}<br>${r.eoc.eocName}<br>` +
          `Status: ${r.currentStatus}`
        );
      });

      // Legend
      const legend = (L.control as any)({ position: "bottomright" });
      legend.onAdd = () => {
        const div = L.DomUtil.create("div", "");
        div.style.cssText = "background:white;padding:8px 12px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;line-height:1.8";
        div.innerHTML = [
          "<b>Legend</b>",
          `<span style="color:#ef4444">●</span> Critical incident`,
          `<span style="color:#f59e0b">●</span> High incident`,
          `<span style="color:#3b82f6">●</span> EOC`,
          `<span style="color:#22c55e">●</span> Available responder`,
          `<span style="color:#94a3b8">●</span> Busy responder`,
        ].join("<br>");
        return div;
      };
      legend.addTo(map);
    });

    return () => {
      leafletRef.current?.remove();
      leafletRef.current = null;
    };
  }, [incidents, responders, eocs]);

  return (
    <>
      {/* Leaflet CSS */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} style={{ height: "100%", width: "100%", borderRadius: "12px" }} />
    </>
  );
}
