-- CreateEnum
CREATE TYPE "SignerRole" AS ENUM ('GUEST', 'STAFF');

-- CreateTable
CREATE TABLE "Contract" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "templateVersionId" UUID NOT NULL,
    "document" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "preparedById" UUID,
    "preparedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMPTZ(3),
    "voidedAt" TIMESTAMPTZ(3),
    "pdfKey" TEXT,
    "pdfGeneratedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSignature" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "role" "SignerRole" NOT NULL,
    "printedName" TEXT NOT NULL,
    "signedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "textHash" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "collectedById" UUID,

    CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contract_checkoutId_idx" ON "Contract"("checkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractSignature_contractId_role_key" ON "ContractSignature"("contractId", "role");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ContractTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written: one contract per check-out that isn't voided.
CREATE UNIQUE INDEX "Contract_checkoutId_active_key" ON "Contract"("checkoutId") WHERE "voidedAt" IS NULL;

-- Hand-written: what was signed never changes. Only the bookkeeping columns
-- (signedAt, voidedAt, the PDF, and preparedById going null when a user is
-- removed) may be updated.
CREATE FUNCTION contract_content_is_fixed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."signedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'A signed contract can''t be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."document" IS DISTINCT FROM OLD."document"
    OR NEW."text" IS DISTINCT FROM OLD."text"
    OR NEW."textHash" IS DISTINCT FROM OLD."textHash"
    OR NEW."templateVersionId" IS DISTINCT FROM OLD."templateVersionId"
    OR NEW."checkoutId" IS DISTINCT FROM OLD."checkoutId"
    OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
    RAISE EXCEPTION 'A contract''s content can''t change';
  END IF;
  IF OLD."signedAt" IS NOT NULL AND (NEW."signedAt" IS DISTINCT FROM OLD."signedAt"
    OR NEW."voidedAt" IS DISTINCT FROM OLD."voidedAt") THEN
    RAISE EXCEPTION 'A signed contract can''t be voided or re-signed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Contract_content_is_fixed"
  BEFORE UPDATE OR DELETE ON "Contract"
  FOR EACH ROW EXECUTE FUNCTION contract_content_is_fixed();

-- Hand-written: signatures are never changed or deleted (collectedById may go
-- null when the collecting user is removed).
CREATE FUNCTION contract_signature_is_fixed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Signatures can''t be deleted';
  END IF;
  IF (to_jsonb(NEW) - 'collectedById') IS DISTINCT FROM (to_jsonb(OLD) - 'collectedById') THEN
    RAISE EXCEPTION 'Signatures can''t change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ContractSignature_is_fixed"
  BEFORE UPDATE OR DELETE ON "ContractSignature"
  FOR EACH ROW EXECUTE FUNCTION contract_signature_is_fixed();

-- Hand-written: saved template versions never change either (createdById may
-- go null when the user is removed).
CREATE FUNCTION contract_template_version_is_fixed() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'createdById') IS DISTINCT FROM (to_jsonb(OLD) - 'createdById') THEN
    RAISE EXCEPTION 'Saved contract template versions can''t change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ContractTemplateVersion_is_fixed"
  BEFORE UPDATE ON "ContractTemplateVersion"
  FOR EACH ROW EXECUTE FUNCTION contract_template_version_is_fixed();
