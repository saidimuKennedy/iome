import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {
    db: "error",
    redis: "error",
  };

  // Check PostgreSQL
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {
    // status captured above
  }

  // Check Redis
  try {
    await redis.ping();
    checks.redis = "ok";
  } catch {
    // status captured above
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  return Response.json(
    { ok: allOk, checks, ts: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  );
}
