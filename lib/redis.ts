// Redis singleton using ioredis
// Shared by USSD session state AND BullMQ job queues
// Key namespaces:
//   session:<phoneNumber>   — USSD session state (TTL 300s, explicit DEL on END)
//   failed:<sessionId>      — Failed Frappe writes pending retry
//   ratelimit:<phoneNumber> — Per-phone incident rate limit counter
import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL environment variable is not set");

  const client = new Redis(url, {
    // Retry failed connections with exponential backoff, up to 10 attempts
    retryStrategy: (times) => {
      if (times > 10) return null; // stop retrying, throw error
      return Math.min(times * 100, 3000);
    },
    // Required for BullMQ compatibility
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  client.on("error", (err) => {
    console.error("[Redis] connection error:", err);
  });

  return client;
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// ─── Session helpers ──────────────────────────────────────────────────────────

export type UssdSession = {
  step: number;
  language: "en" | "sw";
  incidentType?: string;
  locationText?: string;
  locationId?: string;
  lifeThreating?: boolean;
  // Accumulator string from AT (full menu path, e.g. "1*2*1*1")
  textAccumulator?: string;
};

const SESSION_TTL = 300; // seconds — AT hard limit is 180s; 300s is safety net

export const sessionKey = (phone: string) => `session:${phone}`;

export async function getSession(phone: string): Promise<UssdSession | null> {
  const raw = await redis.get(sessionKey(phone));
  if (!raw) return null;
  return JSON.parse(raw) as UssdSession;
}

export async function setSession(
  phone: string,
  session: UssdSession
): Promise<void> {
  await redis.set(sessionKey(phone), JSON.stringify(session), "EX", SESSION_TTL);
}

// Called on every END response — implementation plan §change 8
export async function deleteSession(phone: string): Promise<void> {
  await redis.del(sessionKey(phone));
}
