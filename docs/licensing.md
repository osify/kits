# Paid features and license keys (Kitroid owner)

Kitroid has no server, so paid features are unlocked with **signed license keys** that each
device checks offline with the public key built into the app.

## How it works
- `src/core/license/index.ts`: `FEATURE_PLANS` decides which plan each feature needs.
  **Today everything is `free`.** To make a feature paid, change its value to `'pro'` or `'business'`
  and deploy. Screens check `hasFeature('stock')` etc.
- A key looks like `KIT1.<payload>.<signature>`. The payload has the licensee name, plan, optional extra
  features and an optional expiry date. The signature is ECDSA P-256.
- Users paste the key in **Menu & shop → Plan**. It is stored in the shop database, so it is
  included in backups and restores.
- The licensee name is shown in the app and printed small on direct-printed receipts.
  An offline app cannot stop a key from being copied; the visible name discourages that.

## Plan limits
- `PLAN_LIMITS` in `src/core/license/index.ts`: **Free = 50 items on sale**, Pro and Business = unlimited.
- "On sale" = items shown on the sell screen; hidden items don't count, so shops can hide items they stopped selling.
- Checked when adding an item, un-hiding one, or adding a ready menu that would go over the limit.
- Existing data is never locked: a restored backup or another synced device with more items keeps working;
  the shop just cannot add more until it is under the limit or upgrades.
- A key with `--features unlimitedItems` lifts the item limit without changing the plan.

## The signing key (keep it secret)
- Created once with `node scripts/license/keygen.mjs` into `.license/kitroid-license-private.jwk`
  (git-ignored). **Move it to a safe offline place and back it up.** If it is lost you cannot issue
  new keys that work with the current app; if it leaks, anyone can make keys.
- The matching public key is in `src/core/license/publicKey.ts` (safe to publish).
- To rotate keys, run keygen into a new folder, update `publicKey.ts`, deploy, and re-issue keys.

## Issuing a key
```bash
node scripts/license/issue.mjs --name "LomOr & Co" --plan pro --exp 2027-12-31
node scripts/license/issue.mjs --name "Shop B" --plan free --features unlimitedItems   # lift the 50-item limit only
```
Send the printed `KIT1...` key to the customer.
