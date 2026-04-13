// POST /api/ussd — Africa's Talking USSD webhook handler
// AT sends application/x-www-form-urlencoded on every menu interaction.
// The `text` field is the full accumulated menu path e.g. "2*1*3*1*1".
//
// Accumulator steps (0-indexed):
//   [0] language choice (1=EN, 2=SW)
//   [1] main menu choice (1=Emergency, 2=Assistance, 3=Contacts)
//
// Emergency branch steps:
//   [2] incident type (1-5)
//   [3] location (1-N or N+1 for Other)
//   [4] life-threatening (1=Yes, 2=No)
//   [5] final confirm (1=Submit, 2=Cancel)
//
// Assistance branch steps:
//   [2] assistance type (1-5)
//   [3] location
//   [4] confirm (1=Submit, 2=Cancel)

import { prisma } from "@/lib/prisma";
import { deleteSession, getSession, setSession } from "@/lib/redis";
import { parseFormBody, UssdCallbackSchema } from "@/lib/schemas";
import {
  ASSISTANCE_TYPE,
  ASSISTANCE_TYPE_LABELS,
  ASSISTANCE_TYPE_MAP,
  buildEndAssistance,
  buildEndReported,
  buildFinalConfirm,
  END_CANCELLED,
  END_CONTACTS,
  INCIDENT_TYPE,
  INCIDENT_TYPE_LABELS,
  INCIDENT_TYPE_MAP,
  INVALID_CHOICE,
  MAIN_MENU,
  RATE_LIMITED,
  WELCOME,
  type Lang,
} from "@/lib/ussd-strings";
import {
  buildLocationMenu,
  con,
  end,
  generateCaseId,
  mapSeverity,
  parseAccumulator,
  type LocationOption,
} from "@/lib/ussd";
import { checkDedup, checkRateLimit } from "@/lib/dedup";
import { enqueuePostCreate } from "@/lib/queues";
import type { IncidentType, AssistanceType } from "@/app/generated/prisma/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getLocations(): Promise<(LocationOption & { id: string })[]> {
  return prisma.location.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
    select: { id: true, displayOrder: true, landmarkNameEn: true, landmarkNameSw: true },
  });
}

function lifeThreateningScreen(lang: Lang, typeLabel: string, locationLabel: string): string {
  return lang === "sw"
    ? `Tukio: ${typeLabel} - ${locationLabel}\n\nHatari ya maisha?\n1. Ndio\n2. Hapana\n0. Nyuma`
    : `Incident: ${typeLabel} - ${locationLabel}\n\nLife-threatening?\n1. Yes\n2. No\n0. Back`;
}

function assistanceConfirmScreen(lang: Lang, typeLabel: string, locationLabel: string): string {
  return lang === "sw"
    ? `Thibitisha Ombi:\n${typeLabel} - ${locationLabel}\n\n1. Tuma\n2. Ghairi\n0. Nyuma`
    : `Confirm Request:\n${typeLabel} - ${locationLabel}\n\n1. Submit\n2. Cancel\n0. Back`;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const body = await parseFormBody(request);
  const parsed = UssdCallbackSchema.safeParse(body);

  if (!parsed.success) {
    return new Response("END Invalid request.", { status: 200 });
  }

  const { phoneNumber, text } = parsed.data;
  const steps = parseAccumulator(text);
  const response = await handleUssd(phoneNumber, steps);

  return new Response(response, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// ─── Main state machine ───────────────────────────────────────────────────────

async function handleUssd(phone: string, steps: string[]): Promise<string> {
  // Step 0 — user just dialled
  if (steps.length === 0) {
    await setSession(phone, { step: 0, language: "en" });
    return con(WELCOME.en);
  }

  // Step 1 — language selection
  if (steps.length === 1) {
    const langChoice = steps[0];
    if (langChoice === "1") {
      await setSession(phone, { step: 1, language: "en" });
      return con(MAIN_MENU.en);
    }
    if (langChoice === "2") {
      await setSession(phone, { step: 1, language: "sw" });
      return con(MAIN_MENU.sw);
    }
    return con(INVALID_CHOICE.en + WELCOME.en);
  }

  const session = await getSession(phone);
  const lang: Lang = session?.language ?? "en";
  const mainChoice = steps[1];

  if (mainChoice === "0") return con(WELCOME[lang]);

  if (mainChoice === "3") {
    await deleteSession(phone);
    return end(END_CONTACTS[lang]);
  }

  if (mainChoice === "1") return emergencyBranch(phone, lang, steps);
  if (mainChoice === "2") return assistanceBranch(phone, lang, steps);

  return con(INVALID_CHOICE[lang] + MAIN_MENU[lang]);
}

// ─── Branch 1: Report Emergency ───────────────────────────────────────────────

async function emergencyBranch(phone: string, lang: Lang, steps: string[]): Promise<string> {
  const locations = await getLocations();
  const otherIdx = (locations.length + 1).toString();

  // steps[2] = incident type
  if (steps.length === 2) return con(INCIDENT_TYPE[lang]);

  const typeChoice = steps[2];
  if (typeChoice === "0") return con(MAIN_MENU[lang]);
  const incidentType = INCIDENT_TYPE_MAP[typeChoice];
  if (!incidentType) return con(INVALID_CHOICE[lang] + INCIDENT_TYPE[lang]);
  const typeLabel = INCIDENT_TYPE_LABELS[lang][incidentType];

  // steps[3] = location
  if (steps.length === 3) return con(buildLocationMenu(lang, locations));

  const locChoice = steps[3];
  if (locChoice === "0") return con(INCIDENT_TYPE[lang]);
  const selectedLoc = locChoice === otherIdx
    ? null
    : locations.find((l) => l.displayOrder.toString() === locChoice);
  if (locChoice !== otherIdx && !selectedLoc)
    return con(INVALID_CHOICE[lang] + buildLocationMenu(lang, locations));

  const locLabel = selectedLoc
    ? (lang === "sw" ? selectedLoc.landmarkNameSw : selectedLoc.landmarkNameEn)
    : (lang === "sw" ? "Mahali pengine" : "Other location");

  // steps[4] = life-threatening
  if (steps.length === 4) return con(lifeThreateningScreen(lang, typeLabel, locLabel));

  const lifeChoice = steps[4];
  if (lifeChoice === "0") return con(buildLocationMenu(lang, locations));
  if (lifeChoice !== "1" && lifeChoice !== "2")
    return con(INVALID_CHOICE[lang] + lifeThreateningScreen(lang, typeLabel, locLabel));
  const lifeThreating = lifeChoice === "1";

  // steps[5] = final confirm
  if (steps.length === 5) return con(buildFinalConfirm(lang, typeLabel, locLabel, lifeThreating));

  const confirmChoice = steps[5];
  if (confirmChoice === "0") return con(lifeThreateningScreen(lang, typeLabel, locLabel));
  if (confirmChoice === "2") {
    await deleteSession(phone);
    return end(END_CANCELLED[lang]);
  }
  if (confirmChoice !== "1")
    return con(INVALID_CHOICE[lang] + buildFinalConfirm(lang, typeLabel, locLabel, lifeThreating));

  // ── Confirmed ──────────────────────────────────────────────────────────────

  if (await checkRateLimit(phone)) {
    await deleteSession(phone);
    return end(RATE_LIMITED[lang]);
  }

  // Resolve full Location record for lat/lng
  const locationRecord = selectedLoc
    ? await prisma.location.findUnique({ where: { id: selectedLoc.id } })
    : null;

  // Dedup check
  const existing = await checkDedup(
    phone, incidentType, locationRecord?.latitude ?? null, locationRecord?.longitude ?? null
  );
  if (existing) {
    await deleteSession(phone);
    return end(buildEndReported(lang, existing.caseId));
  }

  const severity = mapSeverity(incidentType as IncidentType, lifeThreating);

  const incident = await prisma.incident.create({
    data: {
      caseId: "PENDING",
      incidentType: incidentType as IncidentType,
      severity,
      lifeThreating,
      phoneNumber: phone,
      language: lang,
      locationText: locLabel,
      locationId: locationRecord?.id ?? null,
      latitude: locationRecord?.latitude ?? null,
      longitude: locationRecord?.longitude ?? null,
      needsLocationReview: !locationRecord,
    },
  });

  const caseId = generateCaseId("INC", incident.seqNum);
  await prisma.incident.update({ where: { id: incident.id }, data: { caseId } });

  await prisma.incidentLog.create({
    data: {
      incidentId: incident.id,
      action: "CREATED",
      details: { phone, incidentType, locLabel, lifeThreating, severity },
    },
  });

  await enqueuePostCreate(incident.id);
  await deleteSession(phone);
  return end(buildEndReported(lang, caseId));
}

// ─── Branch 2: Request Assistance ────────────────────────────────────────────

async function assistanceBranch(phone: string, lang: Lang, steps: string[]): Promise<string> {
  const locations = await getLocations();
  const otherIdx = (locations.length + 1).toString();

  if (steps.length === 2) return con(ASSISTANCE_TYPE[lang]);

  const asstChoice = steps[2];
  if (asstChoice === "0") return con(MAIN_MENU[lang]);
  const assistanceType = ASSISTANCE_TYPE_MAP[asstChoice];
  if (!assistanceType) return con(INVALID_CHOICE[lang] + ASSISTANCE_TYPE[lang]);
  const typeLabel = ASSISTANCE_TYPE_LABELS[lang][assistanceType];

  if (steps.length === 3) return con(buildLocationMenu(lang, locations));

  const locChoice = steps[3];
  if (locChoice === "0") return con(ASSISTANCE_TYPE[lang]);
  const selectedLoc = locChoice === otherIdx
    ? null
    : locations.find((l) => l.displayOrder.toString() === locChoice);
  if (locChoice !== otherIdx && !selectedLoc)
    return con(INVALID_CHOICE[lang] + buildLocationMenu(lang, locations));

  const locLabel = selectedLoc
    ? (lang === "sw" ? selectedLoc.landmarkNameSw : selectedLoc.landmarkNameEn)
    : (lang === "sw" ? "Mahali pengine" : "Other location");

  if (steps.length === 4) return con(assistanceConfirmScreen(lang, typeLabel, locLabel));

  const confirmChoice = steps[4];
  if (confirmChoice === "0") return con(buildLocationMenu(lang, locations));
  if (confirmChoice === "2") {
    await deleteSession(phone);
    return end(END_CANCELLED[lang]);
  }
  if (confirmChoice !== "1")
    return con(INVALID_CHOICE[lang] + assistanceConfirmScreen(lang, typeLabel, locLabel));

  // ── Confirmed ──────────────────────────────────────────────────────────────

  if (await checkRateLimit(phone)) {
    await deleteSession(phone);
    return end(RATE_LIMITED[lang]);
  }

  const locationRecord = selectedLoc
    ? await prisma.location.findUnique({ where: { id: selectedLoc.id } })
    : null;

  const asr = await prisma.assistanceRequest.create({
    data: {
      caseId: "PENDING",
      assistanceType: assistanceType as AssistanceType,
      phoneNumber: phone,
      language: lang,
      locationText: locLabel,
      locationId: locationRecord?.id ?? null,
      latitude: locationRecord?.latitude ?? null,
      longitude: locationRecord?.longitude ?? null,
    },
  });

  const caseId = generateCaseId("ASR", asr.seqNum);
  await prisma.assistanceRequest.update({ where: { id: asr.id }, data: { caseId } });

  await deleteSession(phone);
  return end(buildEndAssistance(lang, caseId));
}
