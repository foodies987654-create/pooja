# Creator Checkout (Stripe Connect + Checkout)

A small payment-collection website: a landing page with three sample offers,
a backend that creates a Stripe Checkout Session for whichever one is picked,
and success/cancel pages. Money is split automatically between your
platform and the creator using Stripe Connect **destination charges**.

## 1. Install dependencies

```bash
npm install
```

## 2. Configure your keys

```bash
cp .env.example .env
```

Then edit `.env`:

- `STRIPE_SECRET_KEY` — your test secret key (`sk_test_...`) from
  https://dashboard.stripe.com/test/apikeys. **Never commit this or put it
  in frontend code.**
- `STRIPE_PUBLISHABLE_KEY` — already filled in with the test key you shared.
- `CREATOR_ACCOUNT_ID` — a connected account id (`acct_...`). Create one by
  onboarding a test creator through Stripe Connect:
  https://docs.stripe.com/connect/onboarding — until you have a real one,
  checkout session creation will fail because the placeholder account
  doesn't exist.

## 3. Run it

```bash
npm start
```

Visit http://localhost:4242. Click "Support this creator" on any offer —
you'll be redirected to a real Stripe-hosted Checkout page.

Use a test card to pay: `4242 4242 4242 4242`, any future expiry, any CVC.

## 4. (Optional) Listen for webhooks locally

```bash
stripe listen --forward-to localhost:4242/webhook
```

Copy the printed webhook signing secret into `STRIPE_WEBHOOK_SECRET` in
`.env` and restart the server. This is how you'd reliably mark an order as
paid and fulfill it server-side.

## How the split works

Each offer in `server.js` (`ITEMS`) names a `creatorAccountId`. When a
Checkout Session is created, `payment_intent_data.transfer_data.destination`
sends the funds to that connected account, and
`payment_intent_data.application_fee_amount` (10% by default — see
`PLATFORM_FEE_PERCENT`) is kept on your platform account. Adjust the
percentage or make it per-item as your pricing model needs.

## Files

- `server.js` — Express server, creates Checkout Sessions, handles the webhook.
- `public/index.html` — the offers page and checkout trigger.
- `public/success.html` / `public/cancel.html` — post-checkout redirects.
- `.env.example` — required environment variables.
