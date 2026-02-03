/*
  Warnings:

  - You are about to drop the column `public_domain` on the `environments` table. All the data in the column will be lost.

*/

-- Migrate existing publicDomain to all RUNNING deployments
DO $$
DECLARE
  env_record RECORD;
BEGIN
  FOR env_record IN
    SELECT id, public_domain
    FROM environments
    WHERE public_domain IS NOT NULL
  LOOP
    UPDATE deployments
    SET virtual_host = env_record.public_domain,
        virtual_port = COALESCE(
          (ports::jsonb->0->>'container')::int,
          80
        )
    WHERE environment_id = env_record.id
      AND status = 'RUNNING';
  END LOOP;
END $$;

-- DropIndex
DROP INDEX "environments_public_domain_key";

-- AlterTable
ALTER TABLE "environments" DROP COLUMN "public_domain";
