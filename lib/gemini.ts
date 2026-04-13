// Gemini first-aid SMS generator via Google Vertex AI.
// Uses a service account (GOOGLE_APPLICATION_CREDENTIALS) for auth.
// Responses are cached in Redis for 24h — same type+language = same message.
// On any Gemini failure, hard-coded fallback strings are returned so the
// incident flow is never blocked.

import { GoogleGenAI } from "@google/genai";
import { redis } from "@/lib/redis";
import type { IncidentType, Language } from "@/app/generated/prisma/client";

// ─── Vertex AI client ─────────────────────────────────────────────────────────

const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT!,
  location: process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
});

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

// ─── Prompt template ──────────────────────────────────────────────────────────

function buildPrompt(incidentType: IncidentType, language: Language): string {
  const langName = language === "sw" ? "Kiswahili" : "English";
  const typeLabel: Record<IncidentType, string> = {
    fire: "fire emergency",
    medical: "medical emergency",
    flood: "flood emergency",
    accident: "road accident emergency",
    security: "security emergency",
  };

  return (
    `You are an emergency response assistant in Kisauni, Mombasa, Kenya. ` +
    `A citizen has just reported a ${typeLabel[incidentType]}. ` +
    `Write a concise, clear first-aid instruction SMS in ${langName}. ` +
    `Rules: max 160 characters, plain text only, no markdown, no emojis, ` +
    `actionable steps only. Start with the most critical action.`
  );
}

// ─── Hard-coded fallbacks (used ONLY when Gemini is unreachable) ──────────────
// These are genuine first-aid instructions, not placeholder text.

const FALLBACKS: Record<IncidentType, Record<Language, string>> = {
  fire: {
    en: "FIRE: Leave building now. Close doors behind you. Call 999. Meet at open ground. Do not use lifts.",
    sw: "MOTO: Toka nje haraka. Funga milango. Piga 999. Kusanyika uwanjani. Usitumie lifti.",
  },
  medical: {
    en: "MEDICAL: Keep patient calm and still. Loosen tight clothing. Do not give food or water. Call 1199.",
    sw: "MATIBABU: Mtulie mgonjwa. Legeza nguo. Usimpe chakula wala maji. Piga 1199.",
  },
  flood: {
    en: "FLOOD: Move to high ground immediately. Do not walk in moving water. Await rescue. Call 999.",
    sw: "MAFURIKO: Nenda mahali pa juu haraka. Usitembee kwenye maji yanayotiririka. Subiri uokoaji. Piga 999.",
  },
  accident: {
    en: "ACCIDENT: Do not move injured. Apply pressure to bleeding wounds. Keep warm. Call 1199 now.",
    sw: "AJALI: Usisogeze mjeruhiwa. Bonyeza majeraha yanayotoka damu. Mweke joto. Piga 1199.",
  },
  security: {
    en: "SECURITY: Move to safety indoors. Lock doors. Stay away from windows. Call 999. Do not confront.",
    sw: "USALAMA: Ingia ndani salama. Funga milango. Kaa mbali na madirisha. Piga 999. Usikabiliane.",
  },
};

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_TTL = 60 * 60 * 24; // 24 hours

function cacheKey(type: IncidentType, lang: Language): string {
  return `gemini:${type}:${lang}`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Returns a ≤160 char first-aid SMS for the given incident type and language.
 * Checks Redis cache first. Falls back to hard-coded strings on any error.
 */
export async function getFirstAidMessage(
  incidentType: IncidentType,
  language: Language
): Promise<string> {
  const key = cacheKey(incidentType, language);

  // Check cache
  const cached = await redis.get(key);
  if (cached) return cached;

  // Call Gemini
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: buildPrompt(incidentType, language) }] }],
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    if (!text) throw new Error("Empty response from Gemini");

    // Enforce 160 char hard limit
    const message = text.length > 160 ? text.slice(0, 157) + "..." : text;

    // Cache for 24h
    await redis.set(key, message, "EX", CACHE_TTL);

    return message;
  } catch (err) {
    console.error("[Gemini] failed, using fallback:", err);
    return FALLBACKS[incidentType][language];
  }
}
