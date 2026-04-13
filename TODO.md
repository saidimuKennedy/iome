# ICERSS Build TODO

**Project:** Integrated Community Emergency Response Support System — Kisauni, Mombasa, Kenya  
**Stack:** Next.js 16.2.3 · PostgreSQL (Prisma 7) · Redis (ioredis + BullMQ) · Africa's Talking · Google Gemini  
**Working dir:** `/home/saidimu/Desktop/next/iome`  
**Docs:** Architecture `/home/saidimu/Downloads/ICERSS_Architecture.html` · Implementation Plan `/home/saidimu/Downloads/ICERSS_Implementation_Plan.md` (authoritative)

---

## Completed

- [x] Install all runtime dependencies (`@prisma/client`, `@prisma/adapter-pg`, `pg`, `ioredis`, `zod`, `bullmq`, `next-auth`, `@auth/prisma-adapter`, `africastalking`, `@google/genai`)
- [x] Install dev dependencies (`prisma`, `dotenv`, `@types/pg`)
- [x] Initialise Prisma 7 with PostgreSQL (`prisma.config.ts` + `prisma/schema.prisma`)
- [x] Write Prisma schema — all 9 entities with enums and indexes
  - `Incident`, `IncidentAssignment`, `AssistanceRequest`, `EOC`, `Responder`, `Location`, `IncidentLog`, `PublicStatsSnapshot`, `SMSLog`
- [x] Generate Prisma client → `app/generated/prisma/`
- [x] Create `lib/prisma.ts` — singleton using `PrismaPg` driver adapter (Prisma 7 requirement)
- [x] Create `lib/redis.ts` — ioredis singleton + session helpers (`getSession`, `setSession`, `deleteSession`)
- [x] Create `.env.local` — all env vars documented
- [x] Create `app/api/health/route.ts` — checks DB + Redis connectivity

---

## Gate — ✅ complete

- [x] **#6 · Run first migration and verify DB connection**
  - `DATABASE_URL` → `postgresql://postgres@localhost:5432/icerss` (PostgreSQL 18, local)
  - `REDIS_URL` → `redis://localhost:6379` (Redis 8.6.2 via snap)
  - Migration applied: `20260413133925_init`
  - `GET /api/health` → `{ ok: true, checks: { db: "ok", redis: "ok" } }` ✅

---

## Phase 1 — USSD foundations (Week 1)

- [ ] **#7 · Write Zod schemas for all Africa's Talking webhook payloads** → `lib/schemas.ts`
  - USSD callback · inbound SMS · SMS delivery receipt
  - AT sends `application/x-www-form-urlencoded` — parse accordingly
  - Export inferred TS types alongside each schema

- [ ] **#8 · Write USSD i18n string maps (EN + SW for every screen)** → `lib/ussd-strings.ts`
  - Screens: WELCOME · MAIN_MENU · INCIDENT_TYPE · LOCATION · LIFE_THREATENING · CONFIRM · END_REPORTED · END_ASSISTANCE · END_CONTACTS · ERROR_INVALID_CHOICE
  - Each string ≤ 182 chars (AT USSD limit)

- [ ] **#9 · Write USSD response builder and case ID generator** → `lib/ussd.ts`
  - `con(text)` / `end(text)` builders
  - `generateCaseId(prefix, seqNum, year?)` → `INC-2026-00123`
  - `mapSeverity(incidentType, lifeThreating)` → `Severity` enum

---

## Phase 2 — Happy path (Week 2)

- [ ] **#10 · Build USSD state machine — emergency report flow** → `app/api/ussd/route.ts`
  - Depends on: #7, #8, #9
  - Parse AT `text` accumulator for step; read/write Redis session
  - Steps: WELCOME → LANG → MAIN MENU → TYPE → LOCATION → LIFE_THREATENING → CONFIRM → END
  - Only write Incident to DB on confirmed report (never partial)
  - Invalid input → re-prompt; `0` → back-navigate

- [ ] **#11 · Add Smart Routing engine** → `lib/routing.ts`
  - Depends on: #10
  - Haversine distance from incident to all active EOCs
  - Match by `handlesIncidentTypes` and `coverageRadiusKm`
  - Multi-agency for fire/medical + `lifeThreating=true`
  - Create `IncidentAssignment` rows, set responder → BUSY, write ASSIGNED log

- [ ] **#12 · Add Africa's Talking SMS dispatch (outbound)** → `lib/sms.ts`
  - Depends on: #11
  - `sendFirstAidSms` · `sendDispatchSms` · `sendCustomSms`
  - Write to `SMSLog` after each attempt; update status fields on Incident/Assignment

- [ ] **#13 · Add Gemini first-aid SMS generator** → `lib/gemini.ts`
  - Depends on: #12
  - `@google/genai` package · model from `GEMINI_MODEL` env var
  - Cache in Redis: `gemini:{type}:{lang}`, TTL 24h
  - Hard-coded fallbacks for all 10 combinations (5 types × 2 languages)
  - Never block incident flow on Gemini failure

---

## Phase 3 — Unhappy paths (Week 3)

- [ ] **#14 · Add dedup and rate-limit logic** → `lib/dedup.ts`
  - Depends on: #10
  - Dedup: same type + < 200m + < 10 min → merge, increment `reportCount`
  - Rate limit: > 3 incidents from same phone in 5 min → reject with `END` message (Redis counter)

- [ ] **#15 · Add Google Maps geocoding for "Other" location** → `lib/geocoder.ts`
  - Depends on: #10
  - REST call to Google Maps Geocoding API, restricted to Kenya bbox
  - On failure: set `needsLocationReview=true`, never block incident creation
  - Add `GOOGLE_MAPS_API_KEY` to `.env.local`

- [ ] **#16 · Add remaining USSD branches (Assistance Request + Emergency Contacts)**
  - Depends on: #10, #14, #15
  - Branch 2: AssistanceRequest flow (no routing, no Gemini, no responder SMS)
  - Branch 3: static Emergency Contacts END screen
  - Back-navigation (`0`) and invalid input recovery for all branches

- [ ] **#17 · Build inbound SMS handler for responder ACK** → `app/api/sms/inbound/route.ts`
  - Depends on: #12
  - Match `1 / YES / ACK / OK` (trimmed, case-insensitive)
  - Phone number → Responder → most recent ASSIGNED IncidentAssignment → flip status → IN_PROGRESS
  - Write IncidentLog `ACK`; write SMSLog for every inbound message

- [ ] **#18 · Build SMS delivery receipt handler** → `app/api/sms/delivery/route.ts`
  - Depends on: #12
  - Look up SMSLog by `atMessageId`, update status
  - Update `Incident.firstAidSmsStatus` or `IncidentAssignment.alertSmsStatus`
  - Write IncidentLog `SMS_FAILED` if delivery failed

- [ ] **#19 · Set up BullMQ queues and workers** → `lib/queues.ts` · `scripts/worker.ts`
  - Depends on: #11, #12, #13
  - Queue 1 `incident-post-create`: routing → dispatch SMS → Gemini (sequential after incident created)
  - Queue 2 `escalation`: delayed job per IncidentAssignment; fires after 5 min if no ACK → ESCALATED
  - Queue 3 `stats-snapshot`: repeating every 5 min → upsert `PublicStatsSnapshot`
  - Queue 4 `failed-incident-retry`: drain `failed:*` Redis keys every 2 min
  - `npm run worker` entry point via `tsx scripts/worker.ts`

---

## Phase 4 — Auth + EOC Dashboard (Week 4)

- [ ] **#20 · Set up NextAuth with EOC Operator and Admin roles**
  - Depends on: #6
  - NextAuth v5 + `@auth/prisma-adapter`
  - Add NextAuth tables to Prisma schema (User, Session, Account, VerificationToken) + `role` field on User
  - `proxy.ts` (Next.js 16 — replaces `middleware.ts`) to protect `/eoc/*` routes
  - `AUTH_SECRET` already in `.env.local`

- [ ] **#21 · Build EOC operator dashboard — incident list + KPI cards** → `app/eoc/page.tsx`
  - Depends on: #20
  - 4 KPI cards (Open, Avg response time, Critical unresolved, Responders available)
  - Incident feed (Server Component + Client Component island for live updates)
  - Severity colour coding; dedup badge; 🚩 location review flag; 📵 SMS failed badge

- [ ] **#22 · Build Server-Sent Events endpoint for live incident feed** → `app/api/eoc/events/route.ts`
  - Depends on: #21
  - Streaming GET using Web Streams API (no external lib needed)
  - Poll DB every 2s for new/updated incidents; push as SSE
  - Client component: `app/eoc/_components/LiveFeed.tsx` (EventSource API)

- [ ] **#23 · Build incident detail page with dispatch controls** → `app/eoc/incidents/[id]/page.tsx`
  - Depends on: #21, #17
  - Acknowledge · Change Responder · Set Location (for 🚩) · Mark Resolved (requires notes)
  - Communication Hub: custom SMS to citizen
  - IncidentLog timeline; SMSLog message log; multi-agency assignment table

- [ ] **#24 · Build Leaflet map page** → `app/eoc/map/page.tsx`
  - Depends on: #21
  - Red = active incidents · Green = available responders · Blue = EOC locations
  - Coverage radius circles; click pin → incident detail; right-click 🚩 → set location
  - Leaflet via dynamic import (`ssr: false`)

- [ ] **#25 · Build public dashboard page** → `app/dashboard/page.tsx`
  - Depends on: #19
  - No auth required; reads `PublicStatsSnapshot` singleton only (no live DB queries)
  - Charts for incidents by type + by hour; staleness notice; "Data not yet available" cold-start state

---

## Phase 5 — Dev tooling

- [ ] **#26 · Build USSD simulator page** → `app/dev/ussd-sim/page.tsx`
  - Dev-only (404 in production); simulates AT webhook POSTs
  - Digit buttons build up accumulated `text`; shows raw request/response; Reset session button

- [ ] **#27 · Write docker-compose.yml** → `docker-compose.yml`
  - Services: `postgres:17-alpine` · `redis:7-alpine` · `nextjs` · `worker`
  - Also: `Dockerfile` (multi-stage, Node 24 alpine) · `.dockerignore` · `.env.docker`
  - `docker-compose up` brings full stack online

- [ ] **#28 · Seed database with Kisauni landmarks and test data** → `prisma/seed.ts`
  - Depends on: #6
  - Location records (landmarks with EN/SW names, lat/lng, displayOrder)
  - 3 EOC records + 2-3 responders each
  - `PublicStatsSnapshot` singleton row (prevents cold-start crash)

---

## Phase 6 — Go-live

- [ ] **#29 · Register AT webhook URLs in Africa's Talking sandbox** _(manual step)_
  - Set USSD callback, inbound SMS, and delivery report URLs via AT dashboard
  - Use ngrok or Cloudflare tunnel for local dev

- [ ] **#30 · Run smoke test — full end-to-end verification** _(finish line)_
  - Depends on: #16, #17, #18, #19, #23, #25, #26, #28, #29
  - All 11 steps from implementation plan §7 must pass
  - If any step fails: fix and re-run before marking complete

---

## Key Next.js 16 gotchas to remember

| Area | Rule |
|---|---|
| `params` / `searchParams` | Must be `await`ed — sync access removed in v16 |
| `cookies()` / `headers()` | Must be `await`ed |
| Middleware | File is `proxy.ts`, export is `function proxy(request)` |
| `use cache` in route handlers | Must be in a helper function, not directly in the handler body |
| `revalidateTag` | Now requires second arg: `revalidateTag('tag', 'max')` |
| Turbopack | On by default — don't add webpack config to `next.config.ts` |

## Prisma 7 gotchas to remember

| Area | Rule |
|---|---|
| Client instantiation | Requires `PrismaPg` driver adapter — no URL in `new PrismaClient()` |
| Import path | `from "@/app/generated/prisma/client"` (not `@prisma/client`) |
| DB URL config | Lives in `prisma.config.ts`, not in `schema.prisma` datasource block |
| Generator provider | `"prisma-client"` (not `"prisma-client-js"`) |


# ICERSS — Implementation Plan v1.0

**Integrated Community Emergency Response Support System**
Misauni, Kenya · 4 developers · 10-week target (8 weeks MVP + 2 weeks hardening)

This plan supersedes the architecture doc where they conflict. Every decision here was made to resolve a logical inconsistency that existed in v1.0 of the architecture.

---

## 1. What changed from the architecture doc

| # | Original | Resolved |
|---|---|---|
| 1 | Language never collected, yet required in schema | Added LANGUAGE screen as USSD step 1 |
| 2 | Severity never collected, yet used for priority | Auto-mapped from incident_type + 1-bit "life-threatening" prompt on confirm |
| 3 | Gemini fire-and-forget from Vercel serverless (will drop) | Moved to Frappe `after_insert` hook — runs on persistent worker |
| 4 | "Request Assistance" had no data model | New `Assistance Request` DocType, separate from `Incident` |
| 5 | `location_text` free string, but routing needs GPS — no geocoder | Hybrid: seeded `Location` DocType (numbered list) + Google Maps fallback for "Other" |
| 6 | Responder GPS in schema, no update mechanism | Dropped. Routing uses `Responder.parent_eoc` coordinates. |
| 7 | Acknowledgement mechanism unspecified | Dual-path: inbound SMS reply parser (primary) + EOC dashboard button (override) |
| 8 | Redis TTL 5 min but AT sessions are 180s, and no explicit cleanup | TTL 300s as safety net; **explicit DEL on every END response** |
| 9 | Vercel serverless cannot do work after response (USSD latency budget) | CONFIRM returns `END` immediately; Frappe write happens inside the handler but with a gateway-generated provisional case ID; Frappe ID reconciled async |
| 10 | No deduplication → crowd reports create chaos | **Must-have:** dedup window (same type + <200m + <10min → merge, increment `report_count`). Plus per-phone rate limit. |
| 11 | Multi-agency "parallel alerts" contradicts single `assigned_responder` FK | `Incident Assignment` child table — one incident, many assignments |
| 12 | Public dashboard does live COUNT/AVG on every revalidation | `Public Stats Snapshot` singleton DocType, updated by 5-min scheduled job |

These changes are non-negotiable in the MVP. Anyone who asks "can we skip X" should read the linked issue number above first.

---

## 2. Corrected four-layer architecture

No change to layer boundaries. Changes are *within* layers:

**Layer 01 — User Interface**
- USSD `*123#` via Africa's Talking (unchanged)
- Outbound SMS split: responder-dispatch-SMS and citizen-first-aid-SMS now both originate from Frappe (not the gateway)
- **New:** Inbound SMS webhook for responder acknowledgement replies (`YES`/`1` → ACK)

**Layer 02 — Gateway (Next.js)**
- USSD webhook handler (unchanged interface)
- Redis sessions (unchanged, but explicit DEL on END)
- Public stats dashboard reads from Frappe `Public Stats Snapshot`, not live aggregation
- **New:** `/api/sms/inbound` for AT inbound SMS callback → proxies to Frappe
- **Removed:** Direct Gemini calls (moved to Frappe)

**Layer 03 — Intelligence (Google Gemini)**
- Called from Frappe Python, not Next.js
- Same bilingual first-aid prompt template
- **New:** Caching layer (Frappe Redis) — same incident_type + language = cached response, 24h TTL. Saves cost and latency.

**Layer 04 — Backend (Frappe)**
- All DocTypes from architecture doc (with schema changes in §4)
- **New logic:** Dedup check in `before_insert`, geocoding in `after_insert` (before routing), Gemini call after routing, SMS dispatch after Gemini
- **New scheduled jobs:** escalation timer, public stats snapshot, stale session cleanup

---

## 3. User journeys

Every journey below has a happy path and the realistic failure modes. Every failure mode has a defined system behaviour. No "we'll figure it out later."

### 3.1 Citizen reporting an emergency

**Actor:** Mama Wanjiku, 52, dials from a Nokia feature phone, no data, panicked, her neighbour's house is on fire.

**Happy path:**
```
1. Dials *123#
2. Sees: "Karibu / Welcome
         1. English
         2. Kiswahili"
   → presses 2
3. Sees Kiswahili main menu:
         "1. Ripoti Dharura
          2. Omba Msaada
          3. Namba za Dharura"
   → presses 1
4. Sees emergency types:
         "1. Moto  2. Matibabu
          3. Mafuriko  4. Ajali
          5. Usalama"
   → presses 1 (Fire)
5. Sees location list:
         "Mahali pa Tukio:
          1. Soko la Misauni
          2. Shule ya Msingi
          3. Kituo cha Afya
          4. Barabara Kuu
          5. Kituo cha Basi
          6. Pengine (weka mwenyewe)"
   → presses 1
6. Sees confirm screen:
         "Ripoti yako:
          Moto - Soko la Misauni
          Hatari ya maisha?
          1. Ndio  2. Hapana"
   → presses 1
7. Sees END:
         "Ripoti imepokelewa.
          Msaada unakuja.
          Kesi: INC-2026-00123
          Utapokea SMS ya msaada
          wa kwanza."
8. Within 30s receives SMS in Kiswahili:
         "Moto: Toka nje haraka. Piga 999. Funga milango. Usitumie lifti..."
9. Red Cross ambulance + Fire crew dispatched (multi-agency because type=Fire and life_threatening=true)
```

**Unhappy paths:**

| # | Scenario | System behaviour |
|---|---|---|
| U1 | User presses invalid digit (e.g. `9` on main menu) | Re-prompt same screen with prefix: "Chaguo si sahihi. / Invalid choice." Session stays alive. |
| U2 | User presses `0` or leaves blank | Treat as back-navigation: go to previous screen. Root = stay on WELCOME. |
| U3 | AT session times out mid-flow (180s) | Session lost. User must re-dial. Redis entry auto-expires at 300s. **No partial incident ever written to Frappe** — only confirmed reports persist. |
| U4 | User selects "Other" location and types unrecognisable text | Frappe geocoder returns no match → incident still created with `status=REPORTED, needs_location_review=true`. EOC operator sees a 🚩 flag and must pin on map before routing completes. User sees normal END message; they don't need to know. |
| U5 | Google geocoder is down / quota exceeded | Fall back to `location_text` as-is, set `needs_location_review=true`. Never block incident creation. |
| U6 | Duplicate report (same type, <200m, <10 min) | Dedup in `before_insert`. Don't create new Incident. Increment `report_count` on existing one. User still sees case ID of the existing incident and gets first-aid SMS. From their side, indistinguishable from normal. |
| U7 | User rate-limited (>3 incidents from same phone in 5 min) | Return `END You have reached the report limit. Please call 999 for immediate help.` No incident created. Operator sees this phone in an abuse log. |
| U8 | Frappe is down when CONFIRM submitted | Gateway caches the incident payload to Redis under `failed:<sessionId>`. Returns END with a provisional case ID. Background retry job (Next.js cron or Frappe pull) drains failed queue every 2 min. User gets case ID that becomes real once Frappe recovers. |
| U9 | Gemini API is down | `after_insert` hook logs error and sends a hard-coded bilingual fallback SMS per incident_type. (Dev 2 pre-writes 5 fallback messages, one per type, in both languages.) Incident still routed normally. |
| U10 | SMS to citizen fails (AT error, invalid number) | Delivery-receipt callback marks `first_aid_sms_status=FAILED` on Incident. EOC dashboard shows an SMS-failed badge. Operator can retry or call manually. |
| U11 | Phone number not in Kenya format | Zod regex rejects. AT should filter but if it slips through: return `END Invalid phone format.` — never write. |
| U12 | User selects Kiswahili, but incident_type English strings already cached by AT | We only emit localized strings from the gateway; AT passes through. If a menu option text is wrong, it's a bug, not a user-facing failure. |

### 3.2 Citizen requesting non-emergency assistance

**Actor:** John, elderly, needs help getting to a health clinic — not urgent but mobility-limited.

**Happy path:**
```
1. Dials *123# → Language → Main Menu → press 2 (Request Assistance)
2. Sees assistance types:
         "1. Transport
          2. Food/Water
          3. Shelter
          4. Welfare Check
          5. Other"
3. Selects type → selects location (same landmarks list) → confirms
4. END: "Request recorded. Ref: ASR-2026-00045. Community volunteer will contact you within 24 hours."
5. Creates `Assistance Request` DocType row with status=OPEN
6. NO Smart Routing, NO Gemini call, NO responder SMS
7. EOC dashboard has separate "Assistance Requests" queue — non-urgent SLA (24h not 2s)
```

**Unhappy paths:**
- Same U1–U8 as emergency reporting
- No Gemini fallback needed because no first-aid SMS is sent
- Dedup still applies (same type + location + phone within 1 hour)

### 3.3 Citizen checking emergency contacts

**Actor:** Any user, wants phone numbers.

**Happy path:**
```
1. Main Menu → press 3
2. END: "Police: 999
         Red Cross: 1199
         Hospital: 0712-XXXXXX
         EOC: 0733-XXXXXX"
```
Static text. No DB write. Session ends immediately. Not logged as an incident.

### 3.4 EOC operator journey — Sarah, Red Cross dispatcher

**Actor:** Sarah logs into Frappe Desk at the Misauni Red Cross office at 7am. Role: `EOC Operator`.

**Happy path:**
```
1. Opens Frappe Desk → ICERSS Workspace is the landing page
2. Sees live dashboard:
   - Top row: 4 KPI cards (Open incidents, Avg response time today, Critical unresolved, Responders available)
   - Left: Real-time incident feed (Socket.io, newest first)
   - Right: Leaflet map (red=active, green=responder, blue=EOC)
3. Toast notification pops: "CRITICAL — Fire at Misauni Market"
4. Clicks the toast → Incident form opens
5. Sees auto-assigned responder (from Smart Routing)
6. Clicks "Acknowledge" → status ASSIGNED → IN PROGRESS, timer stops
7. Uses Communication Hub to SMS citizen: "Team en route. ETA 8 min."
8. Later, responder returns, Sarah clicks "Mark Resolved" → status RESOLVED, resolution notes required
9. Incident Log auto-captures every status change with her username + timestamp
```

**Unhappy paths:**

| # | Scenario | System behaviour |
|---|---|---|
| E1 | Routing assigned wrong responder type (bug) | Sarah can re-assign via "Change Responder" button. Log entry: REASSIGNED by Sarah. |
| E2 | Incident has 🚩 `needs_location_review` | Map shows incident at EOC centroid with a warning banner. Sarah right-clicks on map → "Set Incident Location" → saves lat/long → re-triggers routing. |
| E3 | Responder doesn't acknowledge in N minutes (configurable, default 5) | Escalation scheduled job flips status → ESCALATED, SMS-alerts secondary EOC, notification in Sarah's feed. Sarah can manually de-escalate if she knows the responder is en route. |
| E4 | Duplicate reports merged under one incident | `report_count` visible as badge on incident card ("7 reports"). Sarah knows crowd is reporting same event. |
| E5 | Multi-agency incident (Fire + medical likely) | Incident form shows child table of 2+ assignments. Each row has its own ack button. Incident status aggregates: IN PROGRESS once any agency acks. |
| E6 | Sarah accidentally marks resolved too early | Frappe version history + Incident Log shows prior state. Admin can revert. Resolution requires a mandatory note field to slow accidental clicks. |
| E7 | SMS to citizen fails | Red badge on incident. Sarah sees the delivery status in message log. Can retry with one click. |
| E8 | Internet drops at EOC | Frappe Desk is a web app — Sarah sees stale data until reconnect. Realtime alerts will backfill on reconnect. Mitigation: EOC should have backup MiFi. Document this, don't engineer around it. |
| E9 | Two operators click "Assign responder" at same time | Frappe's row-level locking prevents double assignment. Second operator sees error, must refresh. |
| E10 | Citizen SMS reply comes in ("thank you", random text) | Inbound SMS parser only matches exact `1`, `YES`, `ACK`, `OK` (case-insensitive). Everything else: logged in Incident, no state change. Operator sees it in message log. |

### 3.5 Responder journey — Peter, ambulance driver

**Actor:** Peter, Red Cross ambulance driver, has an old Samsung feature phone. No app.

**Happy path:**
```
1. Receives SMS: "ALERT: Fire at Misauni Market. Case INC-2026-00123. Reply 1 to acknowledge."
2. Replies "1"
3. AT posts inbound SMS to /api/sms/inbound → Frappe → status IN PROGRESS, escalation timer stopped
4. Drives to scene
5. Returns to EOC, informs Sarah verbally; Sarah marks resolved
```

**Unhappy paths:**

| # | Scenario | System behaviour |
|---|---|---|
| R1 | Peter replies anything other than `1` | Logged. No state change. (Rare, but stops false acks from e.g. "OK pal".) Strict match: `^(1|YES|ACK|OK)$` trimmed, case-insensitive. |
| R2 | Peter doesn't reply at all | Escalation timer (5 min default) fires. Status → ESCALATED. Secondary EOC alerted. Sarah still sees original assignment + escalation banner. |
| R3 | Peter's phone is off | SMS delivery receipt fails. Incident shows 📵 badge. System doesn't wait — escalation timer runs normally. |
| R4 | Peter acknowledges but reads wrong case ID from a previous SMS | Inbound SMS carries no case ID; we match by his phone number → his most recent assigned incident in state ASSIGNED. This is a known limitation; if he's assigned two simultaneously it's ambiguous. Mitigation: a responder can only have one ASSIGNED incident at a time (enforced in routing). |

### 3.6 Admin journey — Dev 1 / system administrator

**Actor:** James, sets up the system, adds EOCs, manages users.

**Setup path:**
```
1. Logs into Frappe with System Manager role
2. Creates EOC records (Red Cross Misauni, Misauni Police, Misauni Health Centre)
3. Imports Responder list per EOC (CSV bulk import)
4. Imports seeded Location list (the 50-100 Misauni landmarks) from CSV
5. Creates EOC Operator user accounts — assigns role + linked EOC
6. Tests the full flow using AT sandbox + Dev 4's USSD simulator
7. Runs the "smoke test" runbook (§7) before go-live
```

### 3.7 Public dashboard viewer — journalist / NGO / citizen

```
1. Visits https://icerss.example/dashboard (no login)
2. Sees: total incidents this month, avg response time, resolution rate, heat map
3. Data comes from Public Stats Snapshot DocType — no PII, no phone numbers, no names
4. Updated every 5 min by scheduled job
```

**Unhappy paths:**
- Frappe down → dashboard shows last cached snapshot with timestamp "Last updated: 14:32 (7 min ago)"
- Snapshot job hasn't run yet at cold start → dashboard shows "Data not yet available."

---

## 4. DocType schemas (definitive)

All field names are `snake_case` as Frappe prefers. FKs are Link fields.

### 4.1 `Incident`
| Field | Type | Notes |
|---|---|---|
| name | autoname `INC-.YYYY.-.#####` | PK |
| incident_type | Select | fire / medical / flood / accident / security |
| severity | Select | low / medium / high / critical — auto-mapped, operator editable |
| life_threatening | Check | from USSD 1-bit prompt |
| status | Select | REPORTED / ASSIGNED / IN_PROGRESS / RESOLVED / ESCALATED / CANCELLED |
| phone_number | Data | +254 format, indexed |
| language | Select | en / sw |
| location_text | Data | Raw text from USSD |
| location_landmark | Link (Location) | Null if "Other" was chosen |
| latitude | Float | |
| longitude | Float | |
| needs_location_review | Check | Set if geocoder failed or "Other" chosen |
| reported_at | Datetime | |
| acknowledged_at | Datetime | Null until ack |
| resolved_at | Datetime | |
| resolution_notes | Long Text | Required to set RESOLVED |
| report_count | Int | Dedup counter, defaults 1 |
| first_aid_sms_status | Select | PENDING / SENT / FAILED |
| assignments | Table (Incident Assignment) | Child table, see below |

### 4.2 `Incident Assignment` (child table)
| Field | Type | Notes |
|---|---|---|
| parent | Incident | |
| responder | Link (Responder) | |
| assigned_at | Datetime | |
| acknowledged_at | Datetime | |
| alert_sms_status | Select | PENDING / SENT / FAILED / DELIVERED |
| escalated | Check | |

### 4.3 `Assistance Request`
| Field | Type | Notes |
|---|---|---|
| name | autoname `ASR-.YYYY.-.#####` | |
| assistance_type | Select | transport / food_water / shelter / welfare_check / other |
| status | Select | OPEN / IN_PROGRESS / CLOSED |
| phone_number | Data | |
| language | Select | |
| location_text | Data | |
| location_landmark | Link (Location) | |
| latitude | Float | |
| longitude | Float | |
| requested_at | Datetime | |
| assigned_volunteer | Link (Responder) | |
| notes | Long Text | |

### 4.4 `EOC`
| Field | Type | Notes |
|---|---|---|
| name | autoname | |
| eoc_name | Data | |
| agency_type | Select | red_cross / police / fire / health / community |
| latitude | Float | |
| longitude | Float | |
| coverage_radius_km | Float | Default 10 |
| contact_number | Data | |
| is_active | Check | |
| handles_incident_types | Table | Child: list of incident_types this EOC handles |

### 4.5 `Responder`
| Field | Type | Notes |
|---|---|---|
| name | autoname | |
| responder_name | Data | |
| responder_type | Select | ambulance / police / fire_crew / volunteer |
| parent_eoc | Link (EOC) | |
| contact_number | Data | |
| current_status | Select | AVAILABLE / BUSY / OFFLINE |
| handles_incident_types | Table | |

### 4.6 `Location` (seeded landmarks)
| Field | Type | Notes |
|---|---|---|
| name | autoname | |
| landmark_name_en | Data | "Misauni Market" |
| landmark_name_sw | Data | "Soko la Misauni" |
| latitude | Float | |
| longitude | Float | |
| display_order | Int | For USSD menu ordering |
| is_active | Check | |

### 4.7 `Incident Log`
| Field | Type | Notes |
|---|---|---|
| incident | Link (Incident) | |
| action | Data | CREATED / ASSIGNED / ACK / RESOLVED / ESCALATED / SMS_SENT / SMS_FAILED / MERGED |
| performed_by | Link (User) | Nullable for system actions |
| details | Long Text | JSON blob of context |
| timestamp | Datetime | |

### 4.8 `Public Stats Snapshot` (single DocType)
| Field | Type | Notes |
|---|---|---|
| last_updated | Datetime | |
| total_incidents_month | Int | |
| avg_response_time_sec | Int | |
| resolution_rate_pct | Float | |
| incidents_by_type_json | Long Text | For the chart |
| incidents_by_hour_json | Long Text | For the heat map |

### 4.9 `SMS Log`
| Field | Type | Notes |
|---|---|---|
| phone_number | Data | |
| direction | Select | inbound / outbound |
| message | Long Text | |
| related_incident | Link (Incident) | Nullable |
| at_message_id | Data | From AT callback |
| status | Select | QUEUED / SENT / DELIVERED / FAILED |
| timestamp | Datetime | |

---

## 5. Installation plan — per developer

Each dev needs a working local environment by end of **Day 3**. The full stack runs via one `docker-compose up` once Dev 4 finishes the compose file (Day 5 target).

### 5.1 Shared prerequisites (all 4 devs)
```
- Git, GitHub access to team repo
- Docker Desktop (or Docker Engine + Compose on Linux)
- Node.js 20 LTS + pnpm
- Python 3.11
- VS Code + recommended extensions (Python, ESLint, Prettier, Frappe)
- An Africa's Talking sandbox account (free — go to africastalking.com)
- A Google Cloud project with Gemini API enabled + billing account
- A Google Cloud project with Geocoding API enabled (can be the same project)
```

### 5.2 Dev 1 — Architect (Frappe, DB, routing)
**Installs:**
```bash
# Bench installation (Ubuntu 22.04 or WSL2 on Windows)
sudo apt install python3-dev python3-pip mariadb-server redis-server \
    nodejs npm libmysqlclient-dev wkhtmltopdf
pip install frappe-bench
bench init icerss-bench --frappe-branch version-15
cd icerss-bench
bench new-site icerss.localhost --db-name icerss_dev
bench new-app icerss   # the custom ICERSS app
bench --site icerss.localhost install-app icerss
bench start
```
Then inside `apps/icerss/icerss/`:
```
- Create all 9 DocTypes via Frappe Desk UI (fastest, then export to fixtures)
- Export fixtures: bench --site icerss.localhost export-fixtures
- Commit the generated JSON to the app repo
```
**Day 1–2 deliverable:** Frappe instance running locally with all 9 DocTypes visible in Desk.

### 5.3 Dev 2 — Integrations (Next.js, AT, Gemini, SMS)
**Installs:**
```bash
pnpm create next-app@14 icerss-gateway --typescript --app --tailwind --eslint
cd icerss-gateway
pnpm add zod ioredis @upstash/redis africastalking
pnpm add -D @types/node
# Frappe HTTP client is hand-rolled; no package needed
```
Env file skeleton (`.env.local`):
```
AT_API_KEY=...
AT_USERNAME=sandbox
REDIS_URL=redis://localhost:6379
FRAPPE_URL=http://icerss.localhost:8000
FRAPPE_API_KEY=...
FRAPPE_API_SECRET=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```
**Day 1–2 deliverable:** `/api/health` endpoint returns `{ok: true}`, Redis reachable, Zod schemas file committed.

### 5.4 Dev 3 — EOC Dashboard (Frappe Desk + Leaflet)
**Installs:**
Pulls Dev 1's Frappe app, runs same bench setup. Adds:
```bash
cd apps/icerss
# Leaflet served from CDN, no npm install needed in Frappe
# Work happens in icerss/public/js/ and icerss/icerss/page/
```
Creates a custom Frappe Page `icerss-map` with Leaflet embedded.
**Day 3–5 deliverable:** Workspace skeleton with Incidents list view + empty map page loads.

### 5.5 Dev 4 — Public UI + USSD state (docker-compose, Next.js dashboard, USSD sim)
**Installs:**
Owns the repo's root `docker-compose.yml`:
```yaml
services:
  frappe:
    # Dev 1's dockerized Frappe
  nextjs:
    build: ./gateway
    ports: ["3000:3000"]
    depends_on: [redis, frappe]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
```
Also builds a standalone USSD simulator page (`/dev/ussd-sim`) that POSTs to `/api/ussd` with the AT payload shape — lets the team test without waiting on AT sandbox.
**Day 5 deliverable:** `docker-compose up` brings the full stack online. Team adopts it.

---

## 6. Week-by-week build sequence

Assumes 4 devs starting simultaneously. Red = blocking dependency for another dev.

### Week 1 — Foundations
- **Dev 1:** Bench setup, create all 9 DocTypes, commit fixtures. 🔴 Blocks everyone after Day 4.
- **Dev 2:** Next.js init, Zod schemas, `/api/health`, Redis wiring. Mock Frappe client (hardcoded responses) so he's not blocked.
- **Dev 3:** Learns Frappe Desk customisation, pulls Dev 1's repo end of week, starts workspace layout.
- **Dev 4:** docker-compose.yml, `.env.example`, README skeleton, USSD sim UI.
- **Checkpoint Fri:** All 4 devs can `docker-compose up` and see green health checks.

### Week 2 — Happy path (one-way flow)
- **Dev 1:** Smart Routing engine (Haversine, agency-type match, `after_insert` hook). Seeded Location DocType + CSV importer.
- **Dev 2:** USSD webhook handler end-to-end (Language → Main Menu → Emergency flow only), real Frappe HTTP client, basic SMS dispatch.
- **Dev 3:** Incident list view with severity colour coding, real-time Socket.io feed.
- **Dev 4:** Public dashboard page skeleton, Next.js i18n setup (en/sw strings).
- **Checkpoint Fri:** Dial USSD sim → see incident appear in Frappe → responder gets SMS. **This is the critical milestone.**

### Week 3 — Unhappy paths (MVP feature-complete)
- **Dev 1:** Dedup logic in `before_insert`, rate limiter DocType, escalation scheduled job, Gemini Python client + fallback messages, geocoding integration, Public Stats Snapshot job.
- **Dev 2:** Request Assistance branch, Emergency Contacts branch, inbound SMS handler `/api/sms/inbound`, error-retry Frappe client, failed-queue mechanism.
- **Dev 3:** Leaflet map page, dispatch UI (assign/reassign), communication hub (SMS from incident form), ack button.
- **Dev 4:** USSD back-navigation, invalid input recovery, session timeout handling, public dashboard live with stats snapshot data.

### Week 4 — Role-based access, audit, polish
- **Dev 1:** Role permissions (System Manager / EOC Operator / Responder / Public). Incident Log entries for every state change. Automated DB backup cron.
- **Dev 2:** SMS delivery receipt handler, SMS Log DocType writes, per-phone rate limit enforcement.
- **Dev 3:** Kanban view, analytics dashboard (nice-to-have), resolution notes enforcement.
- **Dev 4:** Mobile-responsive public dashboard, low-bandwidth optimisations, final README.

### Week 5 — Integration testing
- All devs: fix bugs found in week 4 integration. No new features.
- Dev 1 runs a smoke test daily (§7).
- Set up staging env on both Frappe Cloud AND a DigitalOcean Bangalore VPS. Run latency tests from a Nairobi IP (use a VPN or a cheap KE VPS). Decide hosting.

### Week 6 — User acceptance with real EOCs
- Bring in 1–2 Red Cross / Police operators, walk through Sarah's journey.
- Have a non-technical person use the USSD sim as Mama Wanjiku.
- Collect every confusion point. Categorise: (a) copy/wording fix, (b) real bug, (c) won't fix for MVP.
- Dev 1–3 fix (a) and (b) inline.

### Week 7 — AT sandbox → AT production, pilot prep
- Switch to AT production USSD code (requires AT application + approval — **start this in Week 4**, it can take 2 weeks).
- Seed real EOC data from actual Misauni agencies.
- Train 3 real EOC operators.

### Week 8 — Soft launch, MVP declared
- Live for 50 registered test users (community volunteers with real phones).
- Dev team on high alert: Slack channel + rotation.

### Weeks 9–10 — Hardening
- Fix whatever the real world breaks.
- Write the actual operator runbook (§7 is the skeleton).
- Sign-off and handoff.

---

## 7. Smoke test runbook (pre-go-live)

Run daily from Week 5 onwards. Each step must pass.

1. Dial `*123#` via AT sandbox simulator → WELCOME screen appears in < 2s.
2. Select English → main menu renders.
3. Select Report Emergency → Fire → Misauni Market → Yes (life-threatening) → Confirm.
4. END screen shows a case ID within 2s.
5. Within 60s: citizen's test phone receives first-aid SMS.
6. Within 60s: responder's test phone receives dispatch SMS with case ID.
7. Frappe Desk: incident appears in operator's live feed with severity=critical, red badge.
8. Responder replies "1" via SMS → Frappe status flips to IN_PROGRESS within 30s.
9. Operator clicks Resolve, enters notes → status RESOLVED.
10. Public dashboard shows incident count +1 within 5 min.
11. Incident Log shows ≥ 5 audit rows (CREATED, ASSIGNED, SMS_SENT×2, ACK, RESOLVED).

If any step fails → block go-live until fixed.

---

## 8. Risk register (things I'm still worried about)

| Risk | Impact | Mitigation |
|---|---|---|
| AT production USSD code approval takes > 2 weeks | Delays launch | File application Week 4. Have sandbox-based pilot plan if denied. |
| SMS costs balloon (Gemini fallback + alerts + first-aid) | Budget overrun | Cache Gemini responses (§2 Layer 03). Estimate: ~3 SMS per incident × AT Kenya rate. Budget KES 1/SMS × expected volume. |
| Misauni operators have unreliable internet | EOC dashboard unusable | Backup MiFi + document a "phone-only" fallback procedure. Dashboard caches last 1h of incidents for read-only viewing offline. |
| Google Geocoding hallucinates wrong coordinates | Wrong dispatch | `needs_location_review` flag + operator map pin. Seeded landmarks preferred — limits geocoding to "Other" free text (~20% of reports). |
| Frappe Cloud → Kenya latency > 2s | USSD timeouts | Week 5 latency test drives hosting decision. VPS in Bangalore (~250ms) or a Kenyan provider if found. |
| Responder acknowledges wrong case (ambiguity) | Wrong incident marked IN_PROGRESS | Rule: a responder can only be on one ASSIGNED incident at a time. Enforced in routing. |
| Someone reports false emergencies for fun | Wasted dispatch | Rate limit + phone blocklist DocType (admin-only). Audit via SMS Log. |
| What if two USSD callbacks arrive for the same session out of order? | State machine desync | AT sends sequential, but use `text` field (accumulator) as source of truth, not Redis step counter. Redis is cache, not authority. |

---

## 9. What's explicitly out of scope for MVP

- WhatsApp channel (Nice-to-have in architecture — defer)
- Responder mobile app
- Responder GPS live tracking
- Multi-county expansion (single community only)
- Payment integration
- Video/image attachments to incidents
- Translated languages beyond EN/SW

---

## 10. Open questions for you (before Dev 1 touches a keyboard)

1. Who owns the AT production USSD application? (Requires a KE-registered organisation.)
2. Who funds the SMS & API bills during pilot? (AT Kenya, Google Cloud.)
3. Do you have an MOU with Kenya Red Cross / Police / a health facility? Without one, there's no real EOC to dispatch to.
4. Where does the seeded `Location` landmark list come from? Does one exist, or do we need to field-survey?
5. What's the legal/data-protection posture? Phone numbers are PII. Is there a privacy policy / consent flow needed at the END screen?

Any of these being unresolved will stall launch more than any engineering work will. Flag the status of each before Week 2 ends.
