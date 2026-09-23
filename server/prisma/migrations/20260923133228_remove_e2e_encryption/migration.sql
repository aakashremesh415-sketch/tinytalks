DELETE FROM "Message";
/*
  Warnings:

  - You are about to drop the column `ciphertext` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `nonce` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `senderPubKey` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the `MessageCopy` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PublicKey` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "MessageCopy" DROP CONSTRAINT "MessageCopy_messageId_fkey";

-- DropForeignKey
ALTER TABLE "PublicKey" DROP CONSTRAINT "PublicKey_userId_fkey";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "ciphertext",
DROP COLUMN "nonce",
DROP COLUMN "senderPubKey",
ADD COLUMN     "text" TEXT NOT NULL DEFAULT '';

-- DropTable
DROP TABLE "MessageCopy";

-- DropTable
DROP TABLE "PublicKey";
