import { resend } from "../resend.js";

export async function sendVerificationEmail(email, token) {
  const verifyUrl =
    `https://www.getminidesk.com/verify-email?token=${token}`;

  await resend.emails.send({
    from: "MiniDesk <onboarding@resend.dev>",
    to: email,
    subject: "Verify your MiniDesk account",
    html: `
      <h2>Welcome to MiniDesk</h2>

      <p>Click below to verify your email.</p>

      <a href="${verifyUrl}">
        Verify Email
      </a>
    `,
  });
}