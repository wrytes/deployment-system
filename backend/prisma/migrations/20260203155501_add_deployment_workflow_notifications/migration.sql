-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notify_deployment_started" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_deployment_stopped" BOOLEAN NOT NULL DEFAULT true;
