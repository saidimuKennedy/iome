-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('fire', 'medical', 'flood', 'accident', 'security');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'sw');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "AssistanceType" AS ENUM ('transport', 'food_water', 'shelter', 'welfare_check', 'other');

-- CreateEnum
CREATE TYPE "AssistanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');

-- CreateEnum
CREATE TYPE "AgencyType" AS ENUM ('red_cross', 'police', 'fire', 'health', 'community');

-- CreateEnum
CREATE TYPE "ResponderType" AS ENUM ('ambulance', 'police', 'fire_crew', 'volunteer');

-- CreateEnum
CREATE TYPE "ResponderStatus" AS ENUM ('AVAILABLE', 'BUSY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "SmsDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "SmsLogStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "LogAction" AS ENUM ('CREATED', 'ASSIGNED', 'ACK', 'RESOLVED', 'ESCALATED', 'SMS_SENT', 'SMS_FAILED', 'MERGED', 'REASSIGNED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "seqNum" SERIAL NOT NULL,
    "incidentType" "IncidentType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "lifeThreating" BOOLEAN NOT NULL DEFAULT false,
    "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTED',
    "phoneNumber" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "locationText" TEXT,
    "locationId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "needsLocationReview" BOOLEAN NOT NULL DEFAULT false,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "reportCount" INTEGER NOT NULL DEFAULT 1,
    "firstAidSmsStatus" "SmsStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentAssignment" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "alertSmsStatus" "SmsStatus" NOT NULL DEFAULT 'PENDING',
    "escalated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "IncidentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistanceRequest" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "seqNum" SERIAL NOT NULL,
    "assistanceType" "AssistanceType" NOT NULL,
    "status" "AssistanceStatus" NOT NULL DEFAULT 'OPEN',
    "phoneNumber" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "locationText" TEXT,
    "locationId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedVolunteerId" TEXT,
    "notes" TEXT,

    CONSTRAINT "AssistanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EOC" (
    "id" TEXT NOT NULL,
    "eocName" TEXT NOT NULL,
    "agencyType" "AgencyType" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "coverageRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "contactNumber" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "handlesIncidentTypes" "IncidentType"[],

    CONSTRAINT "EOC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Responder" (
    "id" TEXT NOT NULL,
    "responderName" TEXT NOT NULL,
    "responderType" "ResponderType" NOT NULL,
    "eocId" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "currentStatus" "ResponderStatus" NOT NULL DEFAULT 'AVAILABLE',
    "handlesIncidentTypes" "IncidentType"[],

    CONSTRAINT "Responder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "landmarkNameEn" TEXT NOT NULL,
    "landmarkNameSw" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentLog" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "action" "LogAction" NOT NULL,
    "performedBy" TEXT,
    "details" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicStatsSnapshot" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalIncidentsMonth" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTimeSec" INTEGER NOT NULL DEFAULT 0,
    "resolutionRatePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "incidentsByTypeJson" JSONB,
    "incidentsByHourJson" JSONB,

    CONSTRAINT "PublicStatsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SMSLog" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "direction" "SmsDirection" NOT NULL,
    "message" TEXT NOT NULL,
    "incidentId" TEXT,
    "atMessageId" TEXT,
    "status" "SmsLogStatus" NOT NULL DEFAULT 'QUEUED',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SMSLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Incident_caseId_key" ON "Incident"("caseId");

-- CreateIndex
CREATE INDEX "Incident_phoneNumber_idx" ON "Incident"("phoneNumber");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "Incident_reportedAt_idx" ON "Incident"("reportedAt");

-- CreateIndex
CREATE INDEX "Incident_incidentType_latitude_longitude_idx" ON "Incident"("incidentType", "latitude", "longitude");

-- CreateIndex
CREATE INDEX "IncidentAssignment_incidentId_idx" ON "IncidentAssignment"("incidentId");

-- CreateIndex
CREATE INDEX "IncidentAssignment_responderId_idx" ON "IncidentAssignment"("responderId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistanceRequest_caseId_key" ON "AssistanceRequest"("caseId");

-- CreateIndex
CREATE INDEX "AssistanceRequest_phoneNumber_idx" ON "AssistanceRequest"("phoneNumber");

-- CreateIndex
CREATE INDEX "AssistanceRequest_status_idx" ON "AssistanceRequest"("status");

-- CreateIndex
CREATE INDEX "Location_displayOrder_idx" ON "Location"("displayOrder");

-- CreateIndex
CREATE INDEX "IncidentLog_incidentId_idx" ON "IncidentLog"("incidentId");

-- CreateIndex
CREATE INDEX "IncidentLog_timestamp_idx" ON "IncidentLog"("timestamp");

-- CreateIndex
CREATE INDEX "SMSLog_phoneNumber_idx" ON "SMSLog"("phoneNumber");

-- CreateIndex
CREATE INDEX "SMSLog_incidentId_idx" ON "SMSLog"("incidentId");

-- CreateIndex
CREATE INDEX "SMSLog_timestamp_idx" ON "SMSLog"("timestamp");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentAssignment" ADD CONSTRAINT "IncidentAssignment_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentAssignment" ADD CONSTRAINT "IncidentAssignment_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "Responder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceRequest" ADD CONSTRAINT "AssistanceRequest_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceRequest" ADD CONSTRAINT "AssistanceRequest_assignedVolunteerId_fkey" FOREIGN KEY ("assignedVolunteerId") REFERENCES "Responder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Responder" ADD CONSTRAINT "Responder_eocId_fkey" FOREIGN KEY ("eocId") REFERENCES "EOC"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentLog" ADD CONSTRAINT "IncidentLog_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SMSLog" ADD CONSTRAINT "SMSLog_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
