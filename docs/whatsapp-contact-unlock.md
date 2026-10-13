# HK$99 seller WhatsApp contact unlock

A buyer pays HK$99 for one listing's explicitly advertised WhatsApp number. The
original 28car listing remains freely accessible and linked. This purchase does
not require Render, OpenWA, a WhatsApp QR session or a three-party group.

`scripts/scrape_28car_market.py` parses only the listing contact field and writes
explicit WhatsApp numbers to `data/market/28car.active.contacts.json`. Plain phone
numbers, ambiguous multiple numbers and unrelated advertising are excluded.
The existing minimal market signal schema is unchanged. Both snapshots must
match; only complete, fresh source records qualify. A source label is evidence
of advertisement, not proof the account is active or the seller owns the plate.

The asset builder shards private contacts under `/_market/28car/contacts/`.
The Worker denies all direct `/_market/` reads. Public market responses contain
only eligibility and price. Service Worker caching excludes contact pages/APIs.

Stripe Checkout charges exactly 9900 HKD minor units. The encrypted purchased
contact snapshot is bound to a random HttpOnly browser cookie; Stripe session
metadata contains ciphertext and a hash, never a plaintext seller number. The reveal
endpoint verifies ownership, mode, amount, currency, payment success, test/live
mode and refunded/disputed charge status directly with Stripe before decrypting.
The purchased snapshot can still be delivered if the listing later disappears.
Signed Stripe webhooks at `/api/contact/webhook` process
`checkout.session.completed` and `checkout.session.async_payment_succeeded`.
They retrieve the current payment, verify the purchased encrypted contact, and
mark the durable Stripe Session metadata with `contact_fulfillment_version=1`.
The browser return uses the same fulfillment function for immediate access;
retries share a deterministic Stripe idempotency key. An unpaid/delayed payment
never grants access, and refunds/disputes are rechecked on each reveal. Raw
request bytes, HMAC SHA-256, v1 signatures and a five-minute timestamp tolerance
are verified before processing. Unrelated events are ignored; provider failures
return a retryable error. The contact is still retrieved in the original browser,
with receipt-based support if the browser cookie is lost.

The cookie lasts 30 days. Keep the encryption key stable to deliver earlier
purchases. Clearing cookies, changing browsers/devices or key rotation requires
manual support with the Stripe receipt. Incorrect contacts/delivery failures
are handled by an operator refund in Stripe; there is no automated validity
check or refund on seller non-response.

## Activation

1. Deploy the refresh Worker first; its authenticated `/v1/market-contacts` route
   stores/restores the separate companion in private R2. Scheduled official-data
   releases restore both files. Missing/mismatched contacts disable unlocks.
2. Run a complete market refresh and confirm companion persistence and that raw
   private contact URLs return 404. Never upload contact files as CI artifacts
   or commit them.
3. Create a one-time Stripe Product/Price for 9900 HKD and set its
   `CONTACT_UNLOCK_PRICE_ID` in the target deployment. Create separate prices
   in sandbox and live mode. Checkout verifies that the price is active,
   one-time, HKD 9900, untransformed, and in the same mode before charging.
   Register the two Checkout events with a webhook destination for the target
   deployment's `/api/contact/webhook` URL, using its pinned API version.
   Set `STRIPE_WEBHOOK_SECRET` from that destination in managed Worker secrets;
   sandbox and live endpoints have separate signing secrets. New checkout
   remains disabled until this secret exists. Existing paid contacts can still
   be retrieved if the new-sales feature switch is turned off.
   Set `STRIPE_SECRET_KEY` and `CONTACT_UNLOCK_ENCRYPTION_KEY` with managed
   Worker secrets. Prefer an account-scoped restricted key (`rk_test_` or
   `rk_live_`); existing account secret keys are also supported. Publishable
   and organisation keys are rejected. The runtime needs Checkout Sessions
   Write, Prices Read, Products Read, Payment Intents Read and Charges Read;
   grant no refunds, payouts, account management or subscription writes.
   Test these permissions against actual Checkout creation and expanded
   payment retrieval before enabling production. The encryption key must be
   32 random bytes encoded as 64 hex characters. Do not reuse the legacy
   introduction service's encryption key.
4. Use a test Stripe key and `CONTACT_UNLOCK_ENABLED=true` in a protected test
   deployment. Exercise an actual test checkout, return/reload, another browser,
   cancelled payment, webhook delivery/retry, delayed-payment gating, and a
   Stripe refund. Local mocks are not provider proof.
5. Only after those canaries pass, set the live Stripe key and enable the flag
   in the production configuration. Keep it disabled until qualification passes.

The old introduction service remains available as a separate disabled pilot;
its seller-funded HK$199 contract is not the new buyer-funded unlock.

## Buyer experience and payment methods

The contact screen separates the seller's asking price from the HK$99 fee and
shows the source observation time. No account signup is needed. Stripe Checkout
requires an email and its native phone field (`phone_number_collection.enabled`).
Bilingual copy asks buyers to use their own WhatsApp number for purchase support
and refunds, including after leaving the page. This does not verify WhatsApp
account ownership. Contacts are retained by Stripe as `customer_details.email`
and `customer_details.phone` on the completed Checkout Session; they are not
placed in URLs, public APIs, analytics, custom fields or metadata. Operators can
retrieve the Session associated with a payment in Stripe to contact the buyer.
The runtime does not require Customer Write or store complete card details.
The free source listing remains visible. After payment, buyers get a prepared
WhatsApp draft, copy-number action, and receipt-based support link. Pending
payments receive at most three automatic checks; no repeat purchase is offered
while verifying an existing payment. Cancelling checkout retains plate context.
An expired, unpaid checkout with no processing or successful Payment Intent
shows a clear expiry message and a link back to that listing; pending or paid
payments never receive a restart link.
A refunded purchase shows a clear refund status without exposing the number,
offering another checkout, or suggesting that the buyer keep rechecking.

Hosted Stripe Checkout uses dynamic payment methods configured in the account,
including eligible Apple Pay/Google Pay wallets without a custom wallet UI.
This integration explicitly uses standard payments and disables Managed
Payments and adaptive pricing, keeping the checkout charge fixed at HKD 99.
Available
methods depend on the device and Stripe account settings. Delayed payments
remain pending until Stripe confirms payment; they never reveal a contact early.
The runtime pins Stripe API version `2026-09-30.endive`.
PayMe is not listed among Stripe's native supported
methods. An automatic PayMe unlock would require a separate PayMe for Business
API integration and server-side payment confirmation; a static PayCode/manual
receipt workflow would not give immediate verified delivery.

References: [Stripe payment methods](https://docs.stripe.com/payments/payment-methods/payment-method-support),
[Apple Pay](https://docs.stripe.com/apple-pay?platform=web),
[Google Pay](https://docs.stripe.com/google-pay?platform=web),
[HSBC PayMe for Business](https://payme.hsbc.com.hk/en/business/).
