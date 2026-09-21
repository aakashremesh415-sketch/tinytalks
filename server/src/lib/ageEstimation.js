// Facial age-estimation adapter.
//
// tinytalks never collects government ID. Instead, before an account can
// send/receive images, it must pass BOTH:
//   1. Email OTP (proves a reachable, real identifier — see routes/otp.js)
//   2. A facial age-estimation + liveness check (this file)
//
// This is a genuine third-party integration point, not something to build
// in-house: reliable liveness detection (telling a real live face apart
// from a photo/video held up to the camera) is a serious biometric ML
// problem, and a homegrown version without it is trivially spoofed —
// which would be worse than having no check at all, because it would look
// like a safety gate while providing none of the protection.
//
// Until AGE_ESTIMATION_PROVIDER is set to a real vendor with valid
// credentials, this runs in "sandbox" mode and ALWAYS reports not-passed,
// so image sharing stays disabled by default rather than silently open.
//
// Wiring up a real vendor (Yoti Age Scan, Persona, Veriff, Incode, etc.)
// means implementing `callVendor()` below against that vendor's API docs
// and setting the env vars in .env — nothing else in the app needs to
// change, every caller just uses `estimateAge()`.

const MIN_AGE = Number(process.env.AGE_ESTIMATION_MIN_AGE || 23);

export async function estimateAge({ selfieBuffer, mimeType }) {
  const provider = process.env.AGE_ESTIMATION_PROVIDER || 'sandbox';

  if (provider === 'sandbox' || !process.env.AGE_ESTIMATION_API_KEY) {
    return {
      passed: false,
      estimatedAge: null,
      confidence: null,
      provider: 'sandbox',
      note:
        'Age-estimation vendor not configured. Set AGE_ESTIMATION_PROVIDER, ' +
        'AGE_ESTIMATION_API_KEY and AGE_ESTIMATION_API_URL to a real facial ' +
        'age-estimation + liveness provider to enable image sharing.',
    };
  }

  const result = await callVendor(provider, { selfieBuffer, mimeType });
  return {
    passed: result.livenessOk && result.estimatedAge >= MIN_AGE,
    estimatedAge: result.estimatedAge,
    confidence: result.confidence,
    provider,
  };
}

async function callVendor(provider, { selfieBuffer, mimeType }) {
  const url = process.env.AGE_ESTIMATION_API_URL;
  if (!url) {
    throw new Error(
      `AGE_ESTIMATION_PROVIDER=${provider} but AGE_ESTIMATION_API_URL is not set.`
    );
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AGE_ESTIMATION_API_KEY}`,
      'Content-Type': mimeType || 'application/octet-stream',
    },
    body: selfieBuffer,
  });

  if (!res.ok) {
    throw new Error(`Age-estimation vendor error: ${res.status} ${await res.text()}`);
  }

  // NOTE: response shape here is a placeholder — adjust to match the
  // specific vendor's actual response schema once one is chosen.
  const data = await res.json();
  return {
    livenessOk: Boolean(data.liveness_passed),
    estimatedAge: Number(data.estimated_age),
    confidence: Number(data.confidence ?? 0),
  };
}
