// server.js
// Backend for a creator-marketplace checkout flow using Stripe Connect.
//
// Flow:
//   1. Customer clicks "Support" on the storefront (index.html)
//   2. Browser calls POST /create-checkout-session
//   3. This server creates a Stripe Checkout Session as a DESTINATION CHARGE:
//        - the customer is charged on the PLATFORM account
//        - funds are automatically routed to the CREATOR's connected account
//        - the platform keeps `application_fee_amount` as its cut
//   4. Customer is redirected to Stripe's hosted Checkout page
//   5. On completion, Stripe sends a `checkout.session.completed` webhook,
//      which this server verifies and uses to fulfill the "purchase"

const express = require('express');
const path = require('path');
require('dotenv').config();

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn(
    '\n⚠️  STRIPE_SECRET_KEY is not set. Copy .env.example to .env and fill in your test secret key.\n'
  );
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const YOUR_DOMAIN = process.env.DOMAIN || 'http://localhost:4242';

// Stripe requires the RAW request body to verify webhook signatures, so the
// webhook route must be registered BEFORE the JSON body parser.
app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  (request, response) => {
    const sig = request.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed.', err.message);
      return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log(
          `✅ Checkout complete for session ${session.id} — ` +
          `amount_total=${session.amount_total} ${session.currency}`
        );
        break;
      }
      case 'checkout.session.async_payment_succeeded': {
        console.log('✅ Async payment succeeded:', event.data.object.id);
        break;
      }
      case 'checkout.session.async_payment_failed': {
        console.log('❌ Async payment failed:', event.data.object.id);
        break;
      }
      default:
        break;
    }

    response.json({ received: true });
  }
);

app.use(express.json());
// Serve static frontend files (index.html, success.html, cancel.html) from
// the project root, since that's where they live in this repo.
app.use(express.static(__dirname));

// The support tiers for this demo storefront.
const TIERS = {
  spark: { name: 'Spark — one-time tip', amount: 500 },
  backer: { name: 'Backer — supporter tier', amount: 1500 },
  patron: { name: 'Patron — full support tier', amount: 5000 },
};

// Platform's cut, in basis points (500 = 5%).
const PLATFORM_FEE_BPS = 500;

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { tierId } = req.body;
    // Falls back to CREATOR_ACCOUNT_ID from .env if the client doesn't send one —
    // so the frontend only needs to send which tier was picked.
    const creatorAccountId = req.body.creatorAccountId || process.env.CREATOR_ACCOUNT_ID;

    const tier = TIERS[tierId];
    if (!tier) {
      return res.status(400).json({ error: 'Unknown tier.' });
    }
    if (!creatorAccountId || creatorAccountId === 'acct_REPLACE_ME') {
      return res.status(400).json({
        error: 'Missing CREATOR_ACCOUNT_ID — set it in your .env / Render environment variables.',
      });
    }

    const applicationFeeAmount = Math.round(
      (tier.amount * PLATFORM_FEE_BPS) / 10000
    );

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: tier.name },
            unit_amount: tier.amount,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: creatorAccountId,
        },
      },
      success_url: `${YOUR_DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${YOUR_DOMAIN}/cancel.html`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server running on ${YOUR_DOMAIN}`));
