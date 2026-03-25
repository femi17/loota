import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getClientIp } from "@/lib/get-client-ip";

type InMemoryEntry = { count: number; resetAt: number };
const inMemoryStore = new Map<string, InMemoryEntry>();

function pruneInMemoryStore() {
  const now = Date.now();
  for (const [key, entry] of inMemoryStore.entries()) {
    if (now >= entry.resetAt) inMemoryStore.delete(key);
  }
}

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function getRateLimitBackendStatus(): Promise<{
  distributedConfigured: boolean;
  distributedReachable: boolean;
  backend: "redis" | "in-memory";
}> {
  const redis = getRedisClient();
  if (!redis) {
    return {
      distributedConfigured: false,
      distributedReachable: false,
      backend: "in-memory",
    };
  }

  try {
    const key = `health:rate-limit:${Date.now()}`;
    await redis.set(key, "1", { ex: 10 });
    return {
      distributedConfigured: true,
      distributedReachable: true,
      backend: "redis",
    };
  } catch {
    return {
      distributedConfigured: true,
      distributedReachable: false,
      backend: "in-memory",
    };
  }
}

async function incrementDistributed(key: string, windowMs: number): Promise<number | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  const count = await redis.incr(key);
  if (count === 1) {
    const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    await redis.expire(key, ttlSeconds);
  }
  return Number(count);
}

function incrementInMemory(key: string, windowMs: number): number {
  const now = Date.now();
  if (inMemoryStore.size > 10_000) pruneInMemoryStore();
  let entry = inMemoryStore.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    inMemoryStore.set(key, entry);
  }
  entry.count++;
  return entry.count;
}

export async function checkRateLimitByIp(
  request: Request,
  options: { prefix: string; maxRequests: number; windowMs: number }
): Promise<NextResponse | null> {
  const ip = getClientIp(request) ?? "unknown";
  const key = `${options.prefix}:${ip}`;

  let count: number;
  try {
    const distributedCount = await incrementDistributed(key, options.windowMs);
    count = distributedCount ?? incrementInMemory(key, options.windowMs);
  } catch {
    // Never fail requests due to limiter backend outages; fallback to local.
    count = incrementInMemory(key, options.windowMs);
  }

  if (count > options.maxRequests) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(options.windowMs / 1000))) } }
    );
  }

  return null;
}
