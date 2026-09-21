import nodemailer from 'nodemailer';

let transporterPromise = null;

// Free, in-house email OTP delivery. If real SMTP creds are configured,
// use them. Otherwise fall back to nodemailer's Ethereal test service
// (a free throwaway inbox meant exactly for this kind of dev/demo use) so
// the OTP flow works end-to-end out of the box with zero signup.
async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (process.env.SMTP_HOST) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    }
    const testAccount = await nodemailer.createTestAccount();
    console.warn(
      '[mailer] No SMTP_HOST configured — using a free Ethereal test inbox for OTP emails.\n' +
      '[mailer] Real emails will NOT be delivered. Preview links print to this console.'
    );
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  })();

  return transporterPromise;
}

export async function sendOtpEmail(to, code) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || 'tinytalks.live <no-reply@tinytalks.live>',
    to,
    subject: 'Your tinytalks.live verification code',
    text: `Your verification code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`,
    html: `<p>Your verification code is <b style="font-size:20px">${code}</b>.</p><p>It expires in 10 minutes. If you didn't request this, ignore this email.</p>`,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[mailer] OTP email preview (Ethereal sandbox, not a real inbox): ${previewUrl}`);
  }
  return { previewUrl };
}
