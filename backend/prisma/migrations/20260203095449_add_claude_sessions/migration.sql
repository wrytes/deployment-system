-- CreateEnum
CREATE TYPE "ClaudeSessionStatus" AS ENUM ('CREATING', 'STARTING', 'ACTIVE', 'IDLE', 'STOPPING', 'STOPPED', 'DELETING', 'DELETED', 'ERROR');

-- CreateTable
CREATE TABLE "claude_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_name" TEXT NOT NULL,
    "container_id" TEXT,
    "container_name" TEXT NOT NULL,
    "workspace_volume" TEXT NOT NULL,
    "status" "ClaudeSessionStatus" NOT NULL DEFAULT 'CREATING',
    "environment_id" TEXT,
    "cpu_limit" DOUBLE PRECISION,
    "memory_limit" BIGINT,
    "allow_docker_access" BOOLEAN NOT NULL DEFAULT true,
    "anthropic_api_key" TEXT,
    "last_active_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claude_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claude_conversations" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "telegram_msg_id" BIGINT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claude_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claude_deployments" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "deployment_type" TEXT NOT NULL,
    "deployment_id" TEXT,
    "docker_id" TEXT,
    "name" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claude_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "claude_sessions_container_id_key" ON "claude_sessions"("container_id");

-- CreateIndex
CREATE UNIQUE INDEX "claude_sessions_container_name_key" ON "claude_sessions"("container_name");

-- CreateIndex
CREATE INDEX "claude_sessions_user_id_idx" ON "claude_sessions"("user_id");

-- CreateIndex
CREATE INDEX "claude_sessions_status_idx" ON "claude_sessions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "claude_sessions_user_id_project_name_key" ON "claude_sessions"("user_id", "project_name");

-- CreateIndex
CREATE UNIQUE INDEX "claude_conversations_message_id_key" ON "claude_conversations"("message_id");

-- CreateIndex
CREATE INDEX "claude_conversations_session_id_idx" ON "claude_conversations"("session_id");

-- CreateIndex
CREATE INDEX "claude_deployments_session_id_idx" ON "claude_deployments"("session_id");

-- AddForeignKey
ALTER TABLE "claude_sessions" ADD CONSTRAINT "claude_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claude_sessions" ADD CONSTRAINT "claude_sessions_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claude_conversations" ADD CONSTRAINT "claude_conversations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "claude_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claude_deployments" ADD CONSTRAINT "claude_deployments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "claude_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
