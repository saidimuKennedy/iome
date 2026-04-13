// USSD screen string maps — English and Kiswahili
// Every string a citizen sees on their phone screen is defined here.
// Hard limit: 182 chars per screen (Africa's Talking USSD limit).
// Location names match the real Kisauni, Mombasa landmarks seeded in the DB.

export type Lang = "en" | "sw";

// ─── Welcome / Language picker ────────────────────────────────────────────────

export const WELCOME: Record<Lang, string> = {
  en: "Welcome to ICERSS\nEmergency Response\n\n1. English\n2. Kiswahili",
  sw: "Karibu ICERSS\nMsaada wa Dharura\n\n1. English\n2. Kiswahili",
};

// ─── Main menu ────────────────────────────────────────────────────────────────

export const MAIN_MENU: Record<Lang, string> = {
  en: "Main Menu:\n1. Report Emergency\n2. Request Assistance\n3. Emergency Contacts\n0. Back",
  sw: "Menyu Kuu:\n1. Ripoti Dharura\n2. Omba Msaada\n3. Namba za Dharura\n0. Nyuma",
};

// ─── Incident types ───────────────────────────────────────────────────────────

export const INCIDENT_TYPE: Record<Lang, string> = {
  en: "Type of Emergency:\n1. Fire\n2. Medical\n3. Flood\n4. Accident\n5. Security\n0. Back",
  sw: "Aina ya Dharura:\n1. Moto\n2. Matibabu\n3. Mafuriko\n4. Ajali\n5. Usalama\n0. Nyuma",
};

// Mapping from USSD digit → incidentType DB value
export const INCIDENT_TYPE_MAP: Record<string, string> = {
  "1": "fire",
  "2": "medical",
  "3": "flood",
  "4": "accident",
  "5": "security",
};

// ─── Location list ────────────────────────────────────────────────────────────
// Built dynamically from the Location table — these are the labels only.
// The function buildLocationMenu() in lib/ussd.ts assembles the full screen.
// "Other" is always the last option regardless of how many landmarks exist.

export const LOCATION_HEADER: Record<Lang, string> = {
  en: "Incident Location:",
  sw: "Mahali pa Tukio:",
};

export const LOCATION_OTHER: Record<Lang, string> = {
  en: "Other (type location)",
  sw: "Mengine (andika mahali)",
};

export const LOCATION_BACK: Record<Lang, string> = {
  en: "0. Back",
  sw: "0. Nyuma",
};

// ─── Life-threatening prompt ──────────────────────────────────────────────────

export const buildConfirmTypeLocation = (
  lang: Lang,
  incidentTypeLabel: string,
  locationLabel: string
): string => {
  if (lang === "sw") {
    return `Thibitisha Ripoti:\n${incidentTypeLabel} - ${locationLabel}\n\nHatari ya maisha?\n1. Ndio\n2. Hapana\n0. Nyuma`;
  }
  return `Confirm Report:\n${incidentTypeLabel} - ${locationLabel}\n\nLife-threatening?\n1. Yes\n2. No\n0. Back`;
};

// ─── Final confirm screen ─────────────────────────────────────────────────────

export const buildFinalConfirm = (
  lang: Lang,
  incidentTypeLabel: string,
  locationLabel: string,
  lifeThreating: boolean
): string => {
  const threat = lifeThreating
    ? lang === "sw"
      ? "Ndio"
      : "Yes"
    : lang === "sw"
    ? "Hapana"
    : "No";

  if (lang === "sw") {
    return `Thibitisha:\nAina: ${incidentTypeLabel}\nMahali: ${locationLabel}\nHatari: ${threat}\n\n1. Tuma Ripoti\n2. Ghairi\n0. Nyuma`;
  }
  return `Confirm:\nType: ${incidentTypeLabel}\nLocation: ${locationLabel}\nLife threat: ${threat}\n\n1. Submit Report\n2. Cancel\n0. Back`;
};

// ─── END screens — Emergency Report ──────────────────────────────────────────

export const buildEndReported = (lang: Lang, caseId: string): string => {
  if (lang === "sw") {
    return `Ripoti imepokelewa.\nMsaada unakuja.\nKesi: ${caseId}\nUtapokea SMS ya msaada wa kwanza.`;
  }
  return `Report received.\nHelp is on the way.\nCase: ${caseId}\nYou will receive a first-aid SMS shortly.`;
};

export const END_CANCELLED: Record<Lang, string> = {
  en: "Report cancelled. Dial *123# again if you need help.",
  sw: "Ripoti imeghairiwa. Piga *123# tena ukihitaji msaada.",
};

// ─── END screens — Assistance Request ────────────────────────────────────────

export const buildEndAssistance = (lang: Lang, caseId: string): string => {
  if (lang === "sw") {
    return `Ombi limepokelewa.\nNambari ya Kumbukumbu: ${caseId}\nMtu wa kujitolea atakuwasiliana nawe ndani ya masaa 24.`;
  }
  return `Request recorded.\nRef: ${caseId}\nA community volunteer will contact you within 24 hours.`;
};

// ─── END screen — Emergency Contacts ─────────────────────────────────────────
// Phone numbers are placeholders — replace with real Kisauni agency numbers before go-live

export const END_CONTACTS: Record<Lang, string> = {
  en: "Emergency Contacts:\nPolice: 999\nAmbulance: 1199\nFire: 020-2222181\nKisauni EOC: 0800-XXXXXX",
  sw: "Namba za Dharura:\nPolisi: 999\nAmbulance: 1199\nZimamoto: 020-2222181\nKisauni EOC: 0800-XXXXXX",
};

// ─── Error / validation messages ─────────────────────────────────────────────

export const INVALID_CHOICE: Record<Lang, string> = {
  en: "Invalid choice. Please try again.\n",
  sw: "Chaguo si sahihi. Jaribu tena.\n",
};

export const RATE_LIMITED: Record<Lang, string> = {
  en: "END You have reached the report limit. Please call 999 for immediate help.",
  sw: "END Umefika kikomo cha ripoti. Piga simu 999 kwa msaada wa haraka.",
};

// ─── Assistance request types ─────────────────────────────────────────────────

export const ASSISTANCE_TYPE: Record<Lang, string> = {
  en: "Type of Assistance:\n1. Transport\n2. Food / Water\n3. Shelter\n4. Welfare Check\n5. Other\n0. Back",
  sw: "Aina ya Msaada:\n1. Usafiri\n2. Chakula / Maji\n3. Makazi\n4. Angalizo la Ustawi\n5. Mengine\n0. Nyuma",
};

export const ASSISTANCE_TYPE_MAP: Record<string, string> = {
  "1": "transport",
  "2": "food_water",
  "3": "shelter",
  "4": "welfare_check",
  "5": "other",
};

// ─── Incident type display labels (for confirm screens) ───────────────────────

export const INCIDENT_TYPE_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    fire: "Fire",
    medical: "Medical",
    flood: "Flood",
    accident: "Accident",
    security: "Security",
  },
  sw: {
    fire: "Moto",
    medical: "Matibabu",
    flood: "Mafuriko",
    accident: "Ajali",
    security: "Usalama",
  },
};

export const ASSISTANCE_TYPE_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    transport: "Transport",
    food_water: "Food / Water",
    shelter: "Shelter",
    welfare_check: "Welfare Check",
    other: "Other",
  },
  sw: {
    transport: "Usafiri",
    food_water: "Chakula / Maji",
    shelter: "Makazi",
    welfare_check: "Angalizo la Ustawi",
    other: "Mengine",
  },
};
