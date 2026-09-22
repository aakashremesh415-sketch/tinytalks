/*
  Warnings:

  - A unique constraint covering the columns `[userId,deviceId]` on the table `PublicKey` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `PublicKey` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PublicKey" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastIp" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "IpLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageCopy" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceNote" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "durationSec" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hardDeleteAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IpLog_userId_createdAt_idx" ON "IpLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageCopy_messageId_idx" ON "MessageCopy"("messageId");

-- CreateIndex
CREATE INDEX "MessageCopy_deviceId_idx" ON "MessageCopy"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageCopy_messageId_deviceId_key" ON "MessageCopy"("messageId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceNote_messageId_key" ON "VoiceNote"("messageId");

-- CreateIndex
CREATE INDEX "VoiceNote_hardDeleteAt_idx" ON "VoiceNote"("hardDeleteAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublicKey_userId_deviceId_key" ON "PublicKey"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "User_lastSeenAt_idx" ON "User"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "IpLog" ADD CONSTRAINT "IpLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageCopy" ADD CONSTRAINT "MessageCopy_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceNote" ADD CONSTRAINT "VoiceNote_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
