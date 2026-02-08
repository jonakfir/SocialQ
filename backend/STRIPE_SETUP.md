# Stripe setup for access levels

Access level can be **set manually** in the Admin Panel (Users → Access Level dropdown) or **updated automatically** when users pay via Stripe.

## Environment variables

Add to your backend `.env`:

- **STRIPE_SECRET_KEY** – Your Stripe secret key (e.g. `sk_live_...` or `sk_test_...`).
- **STRIPE_WEBHOOK_SECRET** – Webhook signing secret (e.g. `whsec_...`) from Stripe Dashboard → Developers → Webhooks.
- **STRIPE_PRICE_PRO** – Stripe Price ID for Pro Access (subscription). Create a Product in Stripe, add a recurring Price, copy the Price ID (e.g. `price_...`).
- **STRIPE_PRICE_FREE_TRIAL** – (Optional) Stripe Price ID for Free Trial (one-time payment). Create a Product/Price for one-time payment and copy the Price ID.

## Stripe Dashboard

1. Create two products (or one): e.g. "Pro Access" (subscription) and "Free Trial" (one-time).
2. Create a **Webhook** endpoint: `https://your-api.com/stripe/webhook`  
   Events to send: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
3. Copy the webhook signing secret into **STRIPE_WEBHOOK_SECRET**.

## Flow

- **Manual:** Admins change Access Level in the Admin Panel (Users table). This is saved in the DB and used by the iOS app.
- **Stripe:** When a user completes Checkout (`checkout.session.completed`), the webhook sets their `access_level` from session metadata (`pro` or `free_trial`). When a subscription is cancelled (`customer.subscription.deleted`) or no longer active (`customer.subscription.updated`), access is set back to `none`. Stripe customer and subscription IDs are stored on the user for future webhooks.

## API

- **POST /stripe/create-checkout-session** (auth required)  
  Body: `{ "successUrl": "https://...", "cancelUrl": "https://...", "accessLevel": "pro" | "free_trial" }`  
  Returns: `{ "url": "https://checkout.stripe.com/..." }` – redirect the user to `url` to pay.

- **POST /stripe/webhook** – Called by Stripe (raw body, signature verified). Do not call this yourself.
