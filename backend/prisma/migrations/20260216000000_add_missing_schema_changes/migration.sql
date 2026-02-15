-- Add missing columns to deployments table
ALTER TABLE "deployments" ADD COLUMN IF NOT EXISTS "current_version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "deployments" ADD COLUMN IF NOT EXISTS "git_url" TEXT;
ALTER TABLE "deployments" ADD COLUMN IF NOT EXISTS "git_branch" TEXT;
ALTER TABLE "deployments" ADD COLUMN IF NOT EXISTS "git_commit_sha" TEXT;
ALTER TABLE "deployments" ADD COLUMN IF NOT EXISTS "auto_rebuild" BOOLEAN NOT NULL DEFAULT false;

-- Rename containers table to services if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'containers') THEN
        -- Rename the table
        ALTER TABLE "containers" RENAME TO "services";

        -- Recreate indexes with new names
        DROP INDEX IF EXISTS "containers_docker_id_key";
        DROP INDEX IF EXISTS "containers_deployment_id_idx";
        DROP INDEX IF EXISTS "containers_docker_id_idx";

        CREATE UNIQUE INDEX IF NOT EXISTS "services_docker_id_key" ON "services"("docker_id");
        CREATE INDEX IF NOT EXISTS "services_deployment_id_idx" ON "services"("deployment_id");
        CREATE INDEX IF NOT EXISTS "services_docker_id_idx" ON "services"("docker_id");

        -- Update foreign key constraint name
        ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "containers_deployment_id_fkey";
        ALTER TABLE "services" ADD CONSTRAINT "services_deployment_id_fkey"
            FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Rename the enum (separate block to avoid nesting)
DO $$
BEGIN
    ALTER TYPE "ContainerStatus" RENAME TO "ServiceStatus";
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN undefined_object THEN null;
END $$;

-- Create DeploymentUpdateStrategy enum if not exists
DO $$ BEGIN
    CREATE TYPE "DeploymentUpdateStrategy" AS ENUM ('IN_PLACE', 'BLUE_GREEN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create DeploymentUpdateStatus enum if not exists
DO $$ BEGIN
    CREATE TYPE "DeploymentUpdateStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ROLLED_BACK');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create deployment_versions table if not exists
CREATE TABLE IF NOT EXISTS "deployment_versions" (
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

-- Create deployment_updates table if not exists
CREATE TABLE IF NOT EXISTS "deployment_updates" (
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

-- Create indexes for deployment_versions
CREATE UNIQUE INDEX IF NOT EXISTS "deployment_versions_deployment_id_version_key"
    ON "deployment_versions"("deployment_id", "version");
CREATE INDEX IF NOT EXISTS "deployment_versions_deployment_id_idx"
    ON "deployment_versions"("deployment_id");

-- Create indexes for deployment_updates
CREATE INDEX IF NOT EXISTS "deployment_updates_deployment_id_idx"
    ON "deployment_updates"("deployment_id");
CREATE INDEX IF NOT EXISTS "deployment_updates_status_idx"
    ON "deployment_updates"("status");

-- Add foreign keys for deployment_versions
DO $$ BEGIN
    ALTER TABLE "deployment_versions" ADD CONSTRAINT "deployment_versions_deployment_id_fkey"
        FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add foreign keys for deployment_updates
DO $$ BEGIN
    ALTER TABLE "deployment_updates" ADD CONSTRAINT "deployment_updates_deployment_id_fkey"
        FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Make services.deployment_id unique if not already
DO $$ BEGIN
    ALTER TABLE "services" ADD CONSTRAINT "services_deployment_id_key" UNIQUE ("deployment_id");
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
