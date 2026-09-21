-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locationTags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "WaitingQueueEntry" ADD COLUMN     "locationTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
