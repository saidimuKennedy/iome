"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Incident } from "@/app/generated/prisma/client";

interface Props {
  incident: Incident & { assignments: any[] };
  operatorId: string;
}

export function IncidentActions({ incident, operatorId }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(incident.resolutionNotes ?? "");
  const [smsTo, setSmsTo] = useState(incident.phoneNumber);
  const [smsMsg, setSmsMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function post(url: string, body: object) {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setMsg(data.message ?? "Done.");
      router.refresh();
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const canResolve = !["RESOLVED", "CANCELLED"].includes(incident.status);
  const canAck = incident.status === "ASSIGNED" || incident.status === "ESCALATED";

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
      <h2 className="font-semibold text-slate-800">Actions</h2>

      {msg && (
        <p className={`text-sm px-3 py-2 rounded-lg ${msg.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {msg}
        </p>
      )}

      <div className="flex gap-3 flex-wrap">
        {canAck && (
          <button
            disabled={busy}
            onClick={() => post(`/api/eoc/incidents/${incident.id}/acknowledge`, { operatorId })}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Acknowledge
          </button>
        )}

        <button
          disabled={busy}
          onClick={() => post(`/api/eoc/incidents/${incident.id}/resend-sms`, { operatorId })}
          className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
        >
          Resend First-aid SMS
        </button>
      </div>

      {/* Resolve */}
      {canResolve && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">
            Resolution Notes <span className="text-red-500">*</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Describe how the incident was resolved…"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            disabled={busy || notes.trim().length < 5}
            onClick={() =>
              post(`/api/eoc/incidents/${incident.id}/resolve`, { notes, operatorId })
            }
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            Mark Resolved
          </button>
        </div>
      )}

      {/* Communication hub */}
      <div className="space-y-2 border-t border-slate-100 pt-4">
        <p className="text-sm font-medium text-slate-700">Send SMS</p>
        <input
          value={smsTo}
          onChange={(e) => setSmsTo(e.target.value)}
          placeholder="Recipient phone"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <textarea
          value={smsMsg}
          onChange={(e) => setSmsMsg(e.target.value)}
          rows={2}
          placeholder="Message text…"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          disabled={busy || smsMsg.trim().length === 0}
          onClick={() =>
            post(`/api/eoc/incidents/${incident.id}/send-sms`, {
              to: smsTo,
              message: smsMsg,
              operatorId,
            })
          }
          className="px-4 py-2 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
