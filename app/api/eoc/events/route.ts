// GET /api/eoc/events — Server-Sent Events stream for the live incident feed.
// Polls DB every 2s for incidents updated since the client's last event.
// Auth required: EOC Operator or Admin.

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // `since` query param is an ISO timestamp — client sends its last event time
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");
  let since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 5 * 60 * 1000);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial heartbeat so the client knows the connection is live
      controller.enqueue(encoder.encode(": heartbeat\n\n"));

      const poll = async () => {
        try {
          const incidents = await prisma.incident.findMany({
            where: { reportedAt: { gt: since } },
            orderBy: { reportedAt: "desc" },
            take: 20,
          });

          if (incidents.length > 0) {
            since = incidents[0].reportedAt;
            const payload = `data: ${JSON.stringify(incidents)}\n\n`;
            controller.enqueue(encoder.encode(payload));
          }

          // Heartbeat every cycle to keep connection alive
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          controller.close();
        }
      };

      // Poll every 2 seconds
      const interval = setInterval(poll, 2000);

      // Clean up when client disconnects
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
