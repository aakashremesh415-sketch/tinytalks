import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { estimateAge } from '../lib/ageEstimation.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

// Age-estimation selfie is processed in memory and NEVER written to disk
// or the database — only the pass/fail + numeric estimate are kept. No
// government ID is collected anywhere in this flow.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

router.post('/age-estimation', requireAuth, upload.single('selfie'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A live selfie is required.' });

  try {
    const result = await estimateAge({ selfieBuffer: req.file.buffer, mimeType: req.file.mimetype });

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ageEstimationPassed: result.passed,
        ageEstimationScore: result.confidence ?? null,
        imageVerifiedAt: result.passed && req.user.otpVerified ? new Date() : req.user.imageVerifiedAt,
      },
    });

    res.json({
      passed: result.passed,
      provider: result.provider,
      note: result.note,
    });
  } catch (err) {
    console.error('[age-estimation] vendor call failed:', err.message);
    res.status(502).json({ error: 'Age verification service is unavailable. Try again shortly.' });
  }
});

router.get('/status', requireAuth, asyncHandler(async (req, res) => {
  res.json({
    otpVerified: req.user.otpVerified,
    ageEstimationPassed: req.user.ageEstimationPassed,
    imageVerified: Boolean(req.user.otpVerified && req.user.ageEstimationPassed),
  });
}));

export default router;
