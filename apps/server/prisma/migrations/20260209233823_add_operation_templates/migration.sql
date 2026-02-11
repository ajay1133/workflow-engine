-- CreateTable
CREATE TABLE "OperationTemplate" (
    "id" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "callbackType" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperationTemplate_op_key" ON "OperationTemplate"("op");

-- CreateIndex
CREATE INDEX "OperationTemplate_created_by_idx" ON "OperationTemplate"("created_by");

-- CreateIndex
CREATE INDEX "OperationTemplate_visibility_idx" ON "OperationTemplate"("visibility");

-- AddForeignKey
ALTER TABLE "OperationTemplate" ADD CONSTRAINT "OperationTemplate_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
