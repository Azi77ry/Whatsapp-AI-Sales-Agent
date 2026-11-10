-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "botActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "customerWaId" TEXT,
ADD COLUMN     "handoverAt" TIMESTAMP(3),
ADD COLUMN     "handoverState" TEXT NOT NULL DEFAULT 'AI_ACTIVE',
ADD COLUMN     "lastInboundAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "direction" TEXT,
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "inReplyToId" INTEGER,
ADD COLUMN     "phoneNumberId" INTEGER,
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "status" TEXT,
ADD COLUMN     "statusUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'text';

-- CreateTable
CREATE TABLE "whatsapp_accounts" (
    "id" SERIAL NOT NULL,
    "merchantId" INTEGER NOT NULL,
    "wabaId" TEXT NOT NULL,
    "businessId" TEXT,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_phone_numbers" (
    "id" SERIAL NOT NULL,
    "merchantId" INTEGER NOT NULL,
    "accountId" INTEGER,
    "provider" TEXT NOT NULL DEFAULT 'cloud_api',
    "phoneNumberId" TEXT,
    "phoneE164" TEXT NOT NULL,
    "displayPhoneNumber" TEXT,
    "verifiedName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "suspendedByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "qualityRating" TEXT,
    "messagingLimitTier" TEXT,
    "lastConnectedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_phone_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_credentials" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL DEFAULT 'business_integration',
    "scopes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "expiresAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_webhook_events" (
    "id" SERIAL NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "phoneNumberId" TEXT,
    "merchantId" INTEGER,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "whatsapp_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_message_statuses" (
    "id" SERIAL NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorTitle" TEXT,
    "recipientWaId" TEXT,
    "pricingCategory" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_message_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metaTemplateId" TEXT,
    "components" JSONB,
    "purpose" TEXT,
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_opt_ins" (
    "id" SERIAL NOT NULL,
    "merchantId" INTEGER NOT NULL,
    "customerWaId" TEXT NOT NULL,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "optInSource" TEXT,
    "optInAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_opt_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_usage_records" (
    "id" SERIAL NOT NULL,
    "phoneNumberId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "whatsapp_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_wabaId_key" ON "whatsapp_accounts"("wabaId");

-- CreateIndex
CREATE INDEX "whatsapp_accounts_merchantId_idx" ON "whatsapp_accounts"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_phone_numbers_phoneNumberId_key" ON "whatsapp_phone_numbers"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_phone_numbers_phoneE164_key" ON "whatsapp_phone_numbers"("phoneE164");

-- CreateIndex
CREATE INDEX "whatsapp_phone_numbers_merchantId_idx" ON "whatsapp_phone_numbers"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_credentials_accountId_key" ON "whatsapp_credentials"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_webhook_events_dedupeKey_key" ON "whatsapp_webhook_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_status_nextAttemptAt_idx" ON "whatsapp_webhook_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_merchantId_idx" ON "whatsapp_webhook_events"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_message_statuses_providerMessageId_status_key" ON "whatsapp_message_statuses"("providerMessageId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_accountId_name_language_key" ON "whatsapp_templates"("accountId", "name", "language");

-- CreateIndex
CREATE UNIQUE INDEX "customer_opt_ins_merchantId_customerWaId_key" ON "customer_opt_ins"("merchantId", "customerWaId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_usage_records_phoneNumberId_date_direction_categor_key" ON "whatsapp_usage_records"("phoneNumberId", "date", "direction", "category");

-- CreateIndex
CREATE INDEX "conversations_merchantId_customerWaId_idx" ON "conversations"("merchantId", "customerWaId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_providerMessageId_key" ON "messages"("providerMessageId");

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_phone_numbers" ADD CONSTRAINT "whatsapp_phone_numbers_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_phone_numbers" ADD CONSTRAINT "whatsapp_phone_numbers_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "whatsapp_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_credentials" ADD CONSTRAINT "whatsapp_credentials_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_opt_ins" ADD CONSTRAINT "customer_opt_ins_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_usage_records" ADD CONSTRAINT "whatsapp_usage_records_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "whatsapp_phone_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Data backfill (UPDATE pekee - hakuna safu inayofutwa) ──────────────────
-- Mazungumzo yaliyokuwa yakisubiri mmiliki yapate hali sahihi ya handover
UPDATE "conversations" SET "handoverState" = 'HUMAN_REQUESTED', "handoverAt" = "updatedAt"
WHERE "needsHuman" = true;

-- Namba ya mteja (wa_id) kutoka kwenye JID ya Baileys: 255712345678@s.whatsapp.net -> 255712345678
-- (JID za @lid hazina namba ya simu, hivyo zinabaki NULL)
UPDATE "conversations" SET "customerWaId" = split_part(split_part("customerPhone", '@', 1), ':', 1)
WHERE "customerPhone" LIKE '%@s.whatsapp.net' AND "customerWaId" IS NULL;
