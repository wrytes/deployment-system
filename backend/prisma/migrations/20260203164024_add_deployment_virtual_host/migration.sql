-- AlterTable
ALTER TABLE "deployments" ADD COLUMN     "virtual_host" TEXT,
ADD COLUMN     "virtual_port" INTEGER;

-- CreateIndex
CREATE INDEX "deployments_virtual_host_idx" ON "deployments"("virtual_host");
