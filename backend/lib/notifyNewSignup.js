/**
 * Sends you an email when a new user signs up.
 * Set NOTIFY_EMAIL (where to send) and SMTP_* env vars on Railway.
 * If not set, does nothing.
 */

const NOTIFY_EMAIL = (process.env.NOTIFY_EMAIL || '').trim().toLowerCase();
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@socialq.app').trim();

function isConfigured() {
  return NOTIFY_EMAIL.length > 0 && SMTP_HOST.length > 0 && SMTP_USER.length > 0 && SMTP_PASS.length > 0;
}

/**
 * Send "New signup" email. Resolves when done or when not configured.
 * @param {{ id: number, email: string, role?: string }} user - Newly created user
 * @returns {Promise<void>}
 */
async function notifyNewSignup(user) {
  if (!isConfigured()) return;
  const email = (user && user.email) ? String(user.email).trim() : '';
  const id = user && user.id != null ? user.id : '?';
  const role = (user && user.role) ? String(user.role) : 'personal';

  let transporter;
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
    });
  } catch (err) {
    console.warn('[notifyNewSignup] nodemailer not available:', err.message);
    return;
  }

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: NOTIFY_EMAIL,
      subject: `New signup: ${email}`,
      text: `A new user signed up.\n\nEmail: ${email}\nUser ID: ${id}\nRole: ${role}\n`,
      html: `<p>A new user signed up.</p><ul><li>Email: <strong>${escapeHtml(email)}</strong></li><li>User ID: ${escapeHtml(String(id))}</li><li>Role: ${escapeHtml(role)}</li></ul>`
    });
    console.log('[notifyNewSignup] Email sent to', NOTIFY_EMAIL, 'for new signup:', email);
  } catch (err) {
    console.error('[notifyNewSignup] Failed to send email:', err.message);
    throw err;
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { notifyNewSignup, isConfigured };
