-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "company" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
