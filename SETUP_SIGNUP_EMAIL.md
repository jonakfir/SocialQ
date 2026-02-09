# Get an email when a new user signs up

The backend sends you one email per new signup when these variables are set on **Railway** (SocialQ service).

## 1. Your inbox (required)

| Variable        | Example              | Description                    |
|-----------------|----------------------|--------------------------------|
| `NOTIFY_EMAIL`  | `you@gmail.com`      | Email address that receives the “New signup” message. |

## 2. SMTP (required to actually send)

Add the same variables you’d use for any SMTP client (Gmail, SendGrid, Mailgun, etc.):

| Variable     | Example                | Description                          |
|--------------|------------------------|--------------------------------------|
| `SMTP_HOST`  | `smtp.gmail.com`       | SMTP server host.                    |
| `SMTP_PORT`  | `587`                  | Usually 587 (TLS) or 465 (SSL).      |
| `SMTP_USER`  | `your@gmail.com`       | SMTP login.                          |
| `SMTP_PASS`  | `xxxx xxxx xxxx xxxx`   | SMTP password or app password.      |
| `SMTP_FROM`  | `noreply@yourdomain.com` | Optional. “From” address; default is `SMTP_USER`. |
| `SMTP_SECURE`| `false`                | Optional. Set `true` for port 465.   |

If `NOTIFY_EMAIL` or SMTP is not set, the app still works; it just won’t send signup emails.

### Gmail

1. Turn on 2FA for your Google account.
2. Create an **App password**: Google Account → Security → 2-Step Verification → App passwords.
3. On Railway set:
   - `SMTP_HOST` = `smtp.gmail.com`
   - `SMTP_PORT` = `587`
   - `SMTP_USER` = your Gmail address
   - `SMTP_PASS` = the 16-character app password
   - `NOTIFY_EMAIL` = same or another address where you want the notifications

### SendGrid / Mailgun / other

Use the SMTP host, port, user, and password from your provider’s docs (e.g. SendGrid “SMTP relay” or Mailgun “SMTP credentials”). Set those and `NOTIFY_EMAIL` on Railway.

## 3. Deploy

After saving the variables, redeploy the SocialQ service so the new env is used. New signups will trigger an email to `NOTIFY_EMAIL` with the new user’s email and role.
