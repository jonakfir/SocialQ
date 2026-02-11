/**
 * Sends a form-submission style email when a new user signs up, including
 * exactly what they clicked and the full registration flow.
 * Set NOTIFY_EMAIL (defaults to jonakfir@gmail.com) and SMTP_* env vars.
 * If SMTP not set, does nothing.
 */

const NOTIFY_EMAIL = (process.env.NOTIFY_EMAIL || 'jonakfir@gmail.com').trim().toLowerCase();
const SMTP_HOST = (process.env.SMTP_HOST || '').trim();
const SMTP_PORT = parseInt(String(process.env.SMTP_PORT || '587').trim(), 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1';
const SMTP_USER = (process.env.SMTP_USER || '').trim();
// Gmail "App Password" is often pasted with spaces (xxxx xxxx xxxx xxxx). Normalize that safely.
const SMTP_PASS = normalizeSmtpPass(process.env.SMTP_PASS || '');
const SMTP_FROM = (process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@socialq.app').trim();

// Optional HTTPS email fallback (works even when SMTP ports are blocked on hosting providers)
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim();
const RESEND_FROM = String(process.env.RESEND_FROM || '').trim(); // e.g. "SocialQ <onboarding@resend.dev>"

function normalizeSmtpPass(raw) {
  const p = String(raw || '').trim();
  if (!p) return '';
  // Only strip whitespace if it looks like a grouped app password.
  // Example: "abcd efgh ijkl mnop" -> "abcdefghijklmnop"
  if (/\s/.test(p)) {
    const compact = p.replace(/\s+/g, '');
    // If compact looks like a reasonable app password length, prefer it.
    if (compact.length >= 12) return compact;
  }
  return p;
}

function isConfigured() {
  return NOTIFY_EMAIL.length > 0 && SMTP_HOST.length > 0 && SMTP_USER.length > 0 && SMTP_PASS.length > 0;
}

function isResendConfigured() {
  return NOTIFY_EMAIL.length > 0 && RESEND_API_KEY.length > 0 && RESEND_FROM.length > 0;
}

async function sendViaResend({ to, subject, text, html }) {
  // node-fetch v3 is ESM — dynamic import wrapper:
  const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject,
      text,
      html
    })
  });
  const bodyText = await res.text().catch(() => '');
  let body = null;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch { /* ignore */ }
  if (!res.ok) {
    const msg = (body && (body.message || body.error)) || bodyText || `HTTP ${res.status}`;
    throw new Error(`Resend failed: ${msg}`);
  }
  return body;
}

const GOAL_LABELS = {
  just_try: 'Just here to try (daily free play)',
  learn_emotions: 'Learn to Recognize Emotions (free trial)',
  join_pro: 'Join AboutFace Pro! (membership)'
};

const USER_TYPE_LABELS = {
  myself: 'Myself',
  my_child: 'My Child',
  my_student: 'My Student / Patient',
  someone_else: 'Someone Else'
};

function formatValue(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v).trim();
}

/**
 * Build plain-text and HTML bodies for the registration form submission email.
 * @param {{ id: number, email: string, role?: string }} user
 * @param {object} [profile] - Raw profile from registration (goal, user_type, etc.)
 */
function buildBodies(user, profile) {
  const email = (user && user.email) ? String(user.email).trim() : '';
  const id = user && user.id != null ? user.id : '?';
  const role = (user && user.role) ? String(user.role) : 'personal';
  const p = profile && typeof profile === 'object' ? profile : {};

  const goalRaw = (p.goal || '').trim().toLowerCase().replace(/-/g, '_');
  const goalLabel = GOAL_LABELS[goalRaw] || (p.goal ? String(p.goal) : '—');
  const userTypeRaw = (p.user_type || 'myself').toString().replace(/-/g, '_').toLowerCase();
  const userTypeLabel = USER_TYPE_LABELS[userTypeRaw] || (p.user_type ? String(p.user_type) : '—');

  const rows = [
    ['Email', email],
    ['User ID', String(id)],
    ['Role', role],
    ['———', '———'],
    ['Goal selected (what they clicked)', goalLabel],
    ['Account type', userTypeLabel],
    ['Beneficiary / Name', formatValue(p.beneficiary_name)],
    ['Over 18?', formatValue(p.is_over_18)],
    ['Birthday', formatValue(p.birthday)],
    ['Can read?', formatValue(p.is_literate)],
    ['Is verbal?', formatValue(p.is_verbal)],
    ['Teacher email', formatValue(p.teacher_email)],
    ['Doctor email', formatValue(p.doctor_email)],
    ['Doctor name', formatValue(p.doctor_name)],
    ['Parent name', formatValue(p.parent_name)],
    ['Parent email', formatValue(p.parent_email)]
  ];

  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  const html = [
    '<p><strong>New registration – form submission</strong></p>',
    '<table style="border-collapse: collapse; max-width: 480px;">',
    ...rows.map(([k, v]) => `<tr><td style="padding: 6px 12px 6px 0; vertical-align: top; color: #64748b;">${escapeHtml(k)}</td><td style="padding: 6px 0;">${escapeHtml(v)}</td></tr>`),
    '</table>'
  ].join('');

  return { text, html };
}

/**
 * Send "New signup" email with full registration flow.
 * @param {{ id: number, email: string, role?: string }} user - Newly created user
 * @param {object} [profile] - Registration profile (goal, user_type, beneficiary_name, etc.)
 * @returns {Promise<void>}
 */
async function notifyNewSignup(user, profile) {
  const email = (user && user.email) ? String(user.email).trim() : '';
  const { text, html } = buildBodies(user, profile);

  // If SMTP isn't configured but Resend is, still send the notification.
  if (!isConfigured() && isResendConfigured()) {
    await sendViaResend({
      to: NOTIFY_EMAIL,
      subject: `New signup: ${email}`,
      text: `New registration – form submission\n\n${text}`,
      html
    });
    console.log('[notifyNewSignup] Email sent to', NOTIFY_EMAIL, 'for new signup:', email, '(resend)');
    return;
  }

  if (!isConfigured()) {
    const { text } = buildBodies(user, profile);
    console.log('[notifyNewSignup] Signup notification skipped (SMTP not configured). Set SMTP_HOST, SMTP_USER, SMTP_PASS and optionally NOTIFY_EMAIL to receive signup emails.');
    console.log('[notifyNewSignup] Signup details:', text.replace(/\n/g, ' | '));
    return;
  }
  // SMTP configured; attempt SMTP first, then fallback to Resend on timeout/connection issues.

  let transporter;
  try {
    const nodemailer = require('nodemailer');
    function makeTransport({ host, port, secure }) {
      return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
        // Fail fast in hosted envs where SMTP is blocked.
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 20_000,
        tls: { servername: host }
      });
    }

    async function trySend({ host, port, secure, label }) {
      const t = makeTransport({ host, port, secure });
      // Fail fast with a clearer error if SMTP credentials/host are wrong.
      await t.verify();
      await t.sendMail({
        from: SMTP_FROM,
        to: NOTIFY_EMAIL,
        subject: `New signup: ${email}`,
        text: `New registration – form submission\n\n${text}`,
        html: html
      });
      console.log('[notifyNewSignup] Email sent to', NOTIFY_EMAIL, 'for new signup:', email, `(${label || `${host}:${port}`})`);
    }

    function isTimeoutError(err) {
      const msg = String(err?.message || '').toLowerCase();
      const code = String(err?.code || '').toUpperCase();
      return (
        code === 'ETIMEDOUT' ||
        code === 'ESOCKET' ||
        msg.includes('timeout') ||
        msg.includes('timed out')
      );
    }

    // Attempt 1: configured SMTP_* (usually 587 STARTTLS for Gmail)
    try {
      await trySend({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE, label: 'primary' });
      return;
    } catch (err) {
      // Optional: fallback to Resend (HTTPS) if SMTP is blocked/timing out on the host.
      if (isResendConfigured() && isTimeoutError(err)) {
        console.warn('[notifyNewSignup] SMTP timed out; falling back to Resend');
        await sendViaResend({
          to: NOTIFY_EMAIL,
          subject: `New signup: ${email}`,
          text: `New registration – form submission\n\n${text}`,
          html
        });
        console.log('[notifyNewSignup] Email sent to', NOTIFY_EMAIL, 'for new signup:', email, '(resend-fallback)');
        return;
      }

      // If primary times out and host looks like Gmail, try the alternate port (465 SSL) once.
      const isGmail = SMTP_HOST.includes('gmail.com');
      const canFallback = isGmail && isTimeoutError(err) && (SMTP_PORT === 587 || SMTP_PORT === 465);
      if (!canFallback) {
        console.error('[notifyNewSignup] Failed to send email (primary):', err.message || err);
        throw err;
      }
      const altPort = SMTP_PORT === 587 ? 465 : 587;
      const altSecure = altPort === 465;
      console.warn('[notifyNewSignup] Primary SMTP timed out; retrying on', `${SMTP_HOST}:${altPort}`, 'secure=', altSecure);
      try {
        await trySend({ host: SMTP_HOST, port: altPort, secure: altSecure, label: 'fallback' });
        return;
      } catch (err2) {
        // If Gmail fallback also times out and Resend is configured, use it.
        if (isResendConfigured() && isTimeoutError(err2)) {
          console.warn('[notifyNewSignup] SMTP fallback timed out; falling back to Resend');
          await sendViaResend({
            to: NOTIFY_EMAIL,
            subject: `New signup: ${email}`,
            text: `New registration – form submission\n\n${text}`,
            html
          });
          console.log('[notifyNewSignup] Email sent to', NOTIFY_EMAIL, 'for new signup:', email, '(resend-fallback)');
          return;
        }
        console.error('[notifyNewSignup] Failed to send email (fallback):', err2.message || err2);
        throw err2;
      }
    }
  } catch (err) {
    console.warn('[notifyNewSignup] nodemailer not available:', err.message);
    return;
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
