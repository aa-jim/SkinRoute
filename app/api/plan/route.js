import { NextResponse } from "next/server";
import { buildPlan } from "@/lib/planOrchestrator";
import { getEvent } from "@/lib/eventRepo";

const CONFIDENCE_LEVELS = ["optimistic", "realistic", "worst"];

// Per-IP sliding-window rate limit. buildPlan is the only compute-heavy
// unauthenticated endpoint (full day-by-day simulators per POST), and the
// Cloudflare free plan's edge rate limiting has a tiny 10k req/month budget —
// so this guard lives in the worker where it costs microseconds per request.
// Generous for a human toggling the wizard; tight enough to stop a scripted
// crawler from burning the free plan's CPU budget.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const hitTimes = new Map();
const MAX_IPS = 10_000;

function isRateLimited(ip) {
  const now = Date.now();
  const times = (hitTimes.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_MAX) {
    hitTimes.set(ip, times);
    return true;
  }
  times.push(now);
  hitTimes.set(ip, times);
  if (hitTimes.size > MAX_IPS) {
    for (const [key, list] of hitTimes) {
      if (now - list[list.length - 1] >= RATE_WINDOW_MS) hitTimes.delete(key);
    }
  }
  return false;
}

export async function POST(request) {
  const ip = request.headers.get("cf-connecting-ip");
  if (ip && isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests — please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { eventId, resources, target, ownedItems, confidence, overrideStartDay } = body || {};

  if (confidence && !CONFIDENCE_LEVELS.includes(confidence)) {
    return NextResponse.json({ error: "Unknown confidence level" }, { status: 400 });
  }

  if (overrideStartDay !== undefined && typeof overrideStartDay !== "number") {
    return NextResponse.json({ error: "overrideStartDay must be a number" }, { status: 400 });
  }

  const event = getEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: "Unknown eventId" }, { status: 400 });
  }

  try {
    const plan = buildPlan(
      event,
      resources,
      target,
      ownedItems,
      confidence || "realistic",
      overrideStartDay
    );
    return NextResponse.json({ data: plan, error: null });
  } catch (err) {
    return NextResponse.json({ data: null, error: err.message }, { status: 200 });
  }
}