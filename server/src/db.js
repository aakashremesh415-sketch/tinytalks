cat << 'EOF' > /workspaces/tinytalks/server/src/db.js
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export const AccountType = Object.freeze({
  GUEST: 'GUEST',
  REGULAR: 'REGULAR',
  ADMIN: 'ADMIN',
});

export const GenderClaim = Object.freeze({
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  NONBINARY: 'NONBINARY',
  UNSPECIFIED: 'UNSPECIFIED',
});

export const VerificationStatus = Object.freeze({
  NONE: 'NONE',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

export const TicketStatus = Object.freeze({
  OPEN: 'OPEN',
  IN_REVIEW: 'IN_REVIEW',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
});

export const TicketCategory = Object.freeze({
  HARASSMENT_OR_ABUSE: 'HARASSMENT_OR_ABUSE',
  UNDERAGE_SUSPICION: 'UNDERAGE_SUSPICION',
  NUDITY_OR_SEXUAL_CONTENT: 'NUDITY_OR_SEXUAL_CONTENT',
  SPAM_OR_SCAM: 'SPAM_OR_SCAM',
  IMPERSONATION_OR_FAKE_PROFILE: 'IMPERSONATION_OR_FAKE_PROFILE',
  GENDER_MISREPRESENTATION: 'GENDER_MISREPRESENTATION',
  THREATS_OR_VIOLENCE: 'THREATS_OR_VIOLENCE',
  HATE_SPEECH: 'HATE_SPEECH',
  OTHER: 'OTHER',
});

export const ImageViewMode = Object.freeze({
  TIMED_10S: 'TIMED_10S',
  ONE_TIME: 'ONE_TIME',
});
EOF