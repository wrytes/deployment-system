/*
  Warnings:

  - You are about to drop the `containers` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('CREATING', 'RUNNING', 'STOPPED', 'FAILED');

-- DropForeignKey
ALTER TABLE "containers" DROP CONSTRAINT "containers_deployment_id_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notify_deployment_success" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_environment_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_environment_deleted" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_environment_made_public" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_errors" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "containers";

-- DropEnum
DROP TYPE "ContainerStatus";

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "docker_id" TEXT,
    "name" TEXT NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'CREATING',
    "health_status" "HealthStatus" NOT NULL DEFAULT 'NONE',
    "restart_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "services_deployment_id_key" ON "services"("deployment_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_docker_id_key" ON "services"("docker_id");

-- CreateIndex
CREATE INDEX "services_docker_id_idx" ON "services"("docker_id");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
