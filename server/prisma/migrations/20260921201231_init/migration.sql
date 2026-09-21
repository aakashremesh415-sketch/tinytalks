-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('GUEST', 'REGULAR', 'ADMIN');

-- CreateEnum
CREATE TYPE "GenderClaim" AS ENUM ('MALE', 'FEMALE', 'NONBINARY', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('HARASSMENT_OR_ABUSE', 'UNDERAGE_SUSPICION', 'NUDITY_OR_SEXUAL_CONTENT', 'SPAM_OR_SCAM', 'IMPERSONATION_OR_FAKE_PROFILE', 'GENDER_MISREPRESENTATION', 'THREATS_OR_VIOLENCE', 'HATE_SPEECH', 'OTHER');

-- CreateEnum
CREATE TYPE "ImageViewMode" AS ENUM ('TIMED_10S', 'ONE_TIME');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL DEFAULT 'GUEST',
    "email" TEXT,
    "passwordHash" TEXT,
    "displayName" TEXT,
    "ageConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "ageConfirmedAt" TIMESTAMP(3),
    "genderClaimed" "GenderClaim" NOT NULL DEFAULT 'UNSPECIFIED',
    "genderPhotoPath" TEXT,
    "genderVerification" "VerificationStatus" NOT NULL DEFAULT 'NONE',
    "genderReviewedBy" TEXT,
    "genderReviewedAt" TIMESTAMP(3),
    "otpVerified" BOOLEAN NOT NULL DEFAULT false,
    "ageEstimationPassed" BOOLEAN NOT NULL DEFAULT false,
    "ageEstimationScore" DOUBLE PRECISION,
    "imageVerifiedAt" TIMESTAMP(3),
    "premiumGenderFilter" BOOLEAN NOT NULL DEFAULT false,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "bannedAt" TIMESTAMP(3),
    "banReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BanRecord" (
    "id" TEXT NOT NULL,
    "identifierHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "category" "TicketCategory",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BanRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitingQueueEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "genderClaimed" "GenderClaim" NOT NULL,
    "desiredGender" TEXT,
    "canFilter" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitingQueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'image_verification',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "participantAId" TEXT NOT NULL,
    "participantBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "senderPubKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "viewMode" "ImageViewMode" NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstViewedAt" TIMESTAMP(3),
    "viewedComplete" BOOLEAN NOT NULL DEFAULT false,
    "deletedByUser" BOOLEAN NOT NULL DEFAULT false,
    "deletedFromChatAt" TIMESTAMP(3),
    "hardDeleteAt" TIMESTAMP(3),
    "hardDeletedAt" TIMESTAMP(3),

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminImageAccessLog" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "reason" TEXT,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminImageAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "conversationId" TEXT,
    "category" "TicketCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedAdminId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_expiresAt_idx" ON "User"("expiresAt");

-- CreateIndex
CREATE INDEX "User_imageVerifiedAt_idx" ON "User"("imageVerifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BanRecord_identifierHash_key" ON "BanRecord"("identifierHash");

-- CreateIndex
CREATE INDEX "BanRecord_identifierHash_idx" ON "BanRecord"("identifierHash");

-- CreateIndex
CREATE UNIQUE INDEX "WaitingQueueEntry_userId_key" ON "WaitingQueueEntry"("userId");

-- CreateIndex
CREATE INDEX "WaitingQueueEntry_createdAt_idx" ON "WaitingQueueEntry"("createdAt");

-- CreateIndex
CREATE INDEX "OtpCode_userId_purpose_idx" ON "OtpCode"("userId", "purpose");

-- CreateIndex
CREATE INDEX "PublicKey_userId_idx" ON "PublicKey"("userId");

-- CreateIndex
CREATE INDEX "Conversation_participantAId_idx" ON "Conversation"("participantAId");

-- CreateIndex
CREATE INDEX "Conversation_participantBId_idx" ON "Conversation"("participantBId");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Image_messageId_key" ON "Image"("messageId");

-- CreateIndex
CREATE INDEX "Image_deletedFromChatAt_idx" ON "Image"("deletedFromChatAt");

-- CreateIndex
CREATE INDEX "Image_hardDeleteAt_idx" ON "Image"("hardDeleteAt");

-- CreateIndex
CREATE INDEX "AdminImageAccessLog_imageId_idx" ON "AdminImageAccessLog"("imageId");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "Report_reportedUserId_idx" ON "Report"("reportedUserId");

-- AddForeignKey
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicKey" ADD CONSTRAINT "PublicKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_participantAId_fkey" FOREIGN KEY ("participantAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_participantBId_fkey" FOREIGN KEY ("participantBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
