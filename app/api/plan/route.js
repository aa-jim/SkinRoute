import { NextResponse } from "next/server";
import { buildPlan } from "@/lib/planOrchestrator";
import { getEvent } from "@/lib/eventRepo";

const CONFIDENCE_LEVELS = ["optimistic", "realistic", "worst"];

export async function POST(request) {
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