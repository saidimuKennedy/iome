// Prisma 7 client singleton
// Prisma 7 requires a Driver Adapter — the connection URL is NOT passed
// to PrismaClient directly. Instead we use @prisma/adapter-pg with a pg Pool.
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is not set");

  const adapter = new PrismaPg({ connectionString: url });

  return new PrismaClient({
    adapter,
    errorFormat: process.env.NODE_ENV === "development" ? "pretty" : "minimal",
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
