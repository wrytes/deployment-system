-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('ENVIRONMENTS_READ', 'ENVIRONMENTS_WRITE', 'DEPLOYMENTS_READ', 'DEPLOYMENTS_WRITE', 'LOGS_READ', 'ADMIN');

-- CreateEnum
CREATE TYPE "EnvironmentStatus" AS ENUM ('CREATING', 'ACTIVE', 'DELETING', 'DELETED', 'ERROR');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('PENDING', 'PULLING_IMAGE', 'CREATING_VOLUMES', 'STARTING_CONTAINERS', 'RUNNING', 'FAILED', 'STOPPED');

-- CreateEnum
CREATE TYPE "DeploymentUpdateStrategy" AS ENUM ('IN_PLACE', 'BLUE_GREEN');

-- CreateEnum
CREATE TYPE "DeploymentUpdateStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('CREATING', 'RUNNING', 'STOPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('HEALTHY', 'UNHEALTHY', 'STARTING', 'NONE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "telegram_handle" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "notify_environment_active" BOOLEAN NOT NULL DEFAULT true,
    "notify_environment_deleted" BOOLEAN NOT NULL DEFAULT true,
    "notify_environment_made_public" BOOLEAN NOT NULL DEFAULT true,
    "notify_deployment_started" BOOLEAN NOT NULL DEFAULT true,
    "notify_deployment_success" BOOLEAN NOT NULL DEFAULT true,
    "notify_deployment_stopped" BOOLEAN NOT NULL DEFAULT true,
    "notify_errors" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "scopes" "ApiKeyScope"[] DEFAULT ARRAY['ENVIRONMENTS_READ', 'DEPLOYMENTS_READ', 'LOGS_READ']::"ApiKeyScope"[],
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "overlay_network_id" TEXT NOT NULL,
    "docker_network_id" TEXT,
    "status" "EnvironmentStatus" NOT NULL DEFAULT 'CREATING',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "tag" TEXT NOT NULL DEFAULT 'latest',
    "replicas" INTEGER NOT NULL DEFAULT 1,
    "ports" JSONB,
    "env_vars" JSONB,
    "volumes" JSONB,
    "virtual_host" TEXT,
    "virtual_port" INTEGER,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "git_url" TEXT,
    "git_branch" TEXT,
    "git_commit_sha" TEXT,
    "auto_rebuild" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "magic_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "scopes" "ApiKeyScope"[] DEFAULT ARRAY['ENVIRONMENTS_READ', 'DEPLOYMENTS_READ', 'LOGS_READ']::"ApiKeyScope"[],
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "magic_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_versions" (
    "id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "image" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "replicas" INTEGER NOT NULL,
    "ports" JSONB,
    "env_vars" JSONB,
    "volumes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "deployment_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_updates" (
    "id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "from_version" INTEGER NOT NULL,
    "to_version" INTEGER NOT NULL,
    "update_strategy" "DeploymentUpdateStrategy" NOT NULL,
    "status" "DeploymentUpdateStatus" NOT NULL DEFAULT 'PENDING',
    "changes" JSONB NOT NULL,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_id_key" ON "api_keys"("key_id");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "api_keys_key_id_idx" ON "api_keys"("key_id");

-- CreateIndex
CREATE UNIQUE INDEX "environments_overlay_network_id_key" ON "environments"("overlay_network_id");

-- CreateIndex
CREATE INDEX "environments_user_id_idx" ON "environments"("user_id");

-- CreateIndex
CREATE INDEX "environments_status_idx" ON "environments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "environments_user_id_name_key" ON "environments"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "deployments_job_id_key" ON "deployments"("job_id");

-- CreateIndex
CREATE INDEX "deployments_environment_id_idx" ON "deployments"("environment_id");

-- CreateIndex
CREATE INDEX "deployments_job_id_idx" ON "deployments"("job_id");

-- CreateIndex
CREATE INDEX "deployments_status_idx" ON "deployments"("status");

-- CreateIndex
CREATE INDEX "deployments_virtual_host_idx" ON "deployments"("virtual_host");

-- CreateIndex
CREATE UNIQUE INDEX "services_deployment_id_key" ON "services"("deployment_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_docker_id_key" ON "services"("docker_id");

-- CreateIndex
CREATE INDEX "services_docker_id_idx" ON "services"("docker_id");

-- CreateIndex
CREATE UNIQUE INDEX "magic_links_token_key" ON "magic_links"("token");

-- CreateIndex
CREATE INDEX "magic_links_user_id_idx" ON "magic_links"("user_id");

-- CreateIndex
CREATE INDEX "magic_links_token_idx" ON "magic_links"("token");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_versions_deployment_id_version_key" ON "deployment_versions"("deployment_id", "version");

-- CreateIndex
CREATE INDEX "deployment_versions_deployment_id_idx" ON "deployment_versions"("deployment_id");

-- CreateIndex
CREATE INDEX "deployment_updates_deployment_id_idx" ON "deployment_updates"("deployment_id");

-- CreateIndex
CREATE INDEX "deployment_updates_status_idx" ON "deployment_updates"("status");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_versions" ADD CONSTRAINT "deployment_versions_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_updates" ADD CONSTRAINT "deployment_updates_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
