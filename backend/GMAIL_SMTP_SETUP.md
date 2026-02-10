# Sending signup emails from Gmail (jonakfir@gmail.com)

You don’t need a separate SMTP server. Use Gmail with an **App Password**.

## 1. Turn on 2-Step Verification (if it’s not already)

1. Go to [Google Account → Security](https://myaccount.google.com/security).
2. Under “How you sign in to Google”, turn on **2-Step Verification**.

## 2. Create a Gmail App Password

1. In the same Security page, open **2-Step Verification**.
2. At the bottom, click **App passwords**.
3. Select app: **Mail**, device: **Other** (e.g. “SocialQ backend”).
4. Click **Generate**.
5. Copy the **16-character password** (no spaces). You’ll use this as `SMTP_PASS`.

## 3. Set environment variables

In your backend `.env` (or Railway/env vars), add:

```bash
NOTIFY_EMAIL=jonakfir@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=jonakfir@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
SMTP_FROM=jonakfir@gmail.com
```

- Replace `xxxx xxxx xxxx xxxx` with the 16-character App Password (you can paste it with or without spaces).
- Emails will be **sent from** `jonakfir@gmail.com` and **delivered to** `NOTIFY_EMAIL` (same inbox in this setup).

## 4. Restart the backend

Restart the Node process so it picks up the new env vars. Then trigger a signup (or use the curl from the project) and check the inbox for the signup email.
