import { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.VITE_APP_URL || 'http://localhost:5173';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, email, data } = req.body;

  if (!email || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    let subject = '';
    let html = '';
    let from = 'VoiceCamera <noreply@voicecamera.app>';

    switch (type) {
      case 'verification':
        subject = 'Verify your email address';
        html = `
          <div style="max-width: 600px; margin: 0 auto;">
            <h1>Welcome to VoiceCamera!</h1>
            <p>Please verify your email address by clicking the button below:</p>
            <p style="text-align: center;">
              <a href="${APP_URL}/verify-email?token=${data.token}" 
                 style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
                Verify Email
              </a>
            </p>
            <p>If you didn't request this, please ignore this email.</p>
          </div>
        `;
        break;

      case 'password-reset':
        subject = 'Reset your password';
        html = `
          <div style="max-width: 600px; margin: 0 auto;">
            <h1>Password Reset</h1>
            <p>You requested a password reset. Click the button below to reset your password:</p>
            <p style="text-align: center;">
              <a href="${APP_URL}/reset-password?token=${data.token}" 
                 style="display: inline-block; background: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
                Reset Password
              </a>
            </p>
            <p>If you didn't request this, please ignore this email.</p>
          </div>
        `;
        break;

      case 'welcome':
        from = 'VoiceCamera <welcome@voicecamera.app>';
        subject = 'Welcome to VoiceCamera!';
        html = `
          <div style="max-width: 600px; margin: 0 auto;">
            <h1>Welcome to VoiceCamera, ${data.name}!</h1>
            <p>Thank you for joining VoiceCamera. We're excited to have you on board.</p>
            <p>Here's what you can do next:</p>
            <ul>
              <li>Complete your profile</li>
              <li>Explore our features</li>
              <li>Connect with other users</li>
              <li>Start creating amazing content</li>
            </ul>
            <p>Need help? Check out our <a href="${APP_URL}/help">Help Center</a>.</p>
          </div>
        `;
        break;

      default:
        return res.status(400).json({ error: 'Invalid email type' });
    }

    const { data: emailData, error } = await resend.emails.send({
      from,
      to: email,
      subject,
      html
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(emailData);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Email sending error:', message);
    return res.status(500).json({ error: message || 'Internal server error' });
  }
}
