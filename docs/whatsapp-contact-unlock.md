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
metadata contains ciphertext and a hash, never a plaintext number. The reveal
endpoint verifies ownership, mode, amount, currency, payment success, test/live
mode and refunded/disputed charge status directly with Stripe before decrypting.
The purchased snapshot can still be delivered if the listing later disappears.
There is no asynchronous WhatsApp delivery job: repeated verified reads return
the same purchased contact. No webhook endpoint is required for this on-demand
reveal; customers who do not return use their receipt for manual support.

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
3. Set `STRIPE_SECRET_KEY` and `CONTACT_UNLOCK_ENCRYPTION_KEY` with managed
   Worker secrets. The encryption key must be 32 random bytes encoded as 64 hex
   characters. Do not reuse the legacy introduction service's encryption key.
4. Use a test Stripe key and `CONTACT_UNLOCK_ENABLED=true` in a protected test
   deployment. Exercise an actual test checkout, return/reload, another browser,
   cancelled payment, and a Stripe refund. Local mocks are not provider proof.
5. Only after those canaries pass, set the live Stripe key and enable the flag
   in the production configuration. The repository default is disabled.

The old introduction service remains available as a separate disabled pilot;
its seller-funded HK$199 contract is not the new buyer-funded unlock.
