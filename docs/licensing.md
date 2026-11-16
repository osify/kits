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

## Buy Me a Coffee members get a key

Supporters pay at https://buymeacoffee.com/mtstuffs. **Monthly members** (Buy Me a Coffee → Memberships)
get a **Pro** key; one-off coffees are thank-yous and don't come with a key.

1. In Buy Me a Coffee, create a monthly membership level, e.g. *Kitroid Pro*. In its description ask
   members to write their **shop name** (the name printed in the key and on receipts).
2. When a member joins (Buy Me a Coffee emails you), issue a key valid one month plus 7 days' grace:
   ```bash
   node scripts/license/issue.mjs --name "Shop name" --plan pro --months 1 --note "BMC member"
   ```
   Members who pay yearly: `--months 12`.
3. Send the `KIT1...` key through Buy Me a Coffee's message to the member (or Telegram/email).
   They paste it in **POS → Menu & shop → Plan**. It works offline and is kept in their backups.
4. Each month the membership renews, send a new key (same command). If a member stops paying, the key
   simply expires; their data is never locked, they only go back to the Free limits.

What Pro gives today: unlimited items on sale in POS (Free = 50). Any feature you later mark `'pro'`
in `FEATURE_PLANS` is included for members automatically.

The app links to the membership page (`MEMBERSHIP_URL` in `src/core/support.ts`) from
POS → Plan, and to the coffee page from the landing page and each tool.
