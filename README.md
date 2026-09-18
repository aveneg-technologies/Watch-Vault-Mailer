# aveneg-technologies-mailer

Auto-reply for `info@avenegtechnologies.com`, so a sender never sees a
personal Gmail address and nobody has to reply from Gmail by hand.

Adapted from `watchregister-mailer` (the same pattern already live on
`info@watchvaultarchive.com`), with the copy rewritten for a general
corporate contact address rather than a product waitlist.

Cloudflare Email Routing rules only support a single action each (send to
email, send to a Worker, or drop) — attaching this Worker to the `info@` rule
replaces the old "forward to my inbox" action rather than adding to it. So
this Worker does both jobs itself: it forwards to the personal inbox via
`message.forward()`, then replies immediately from
`noreply@avenegtechnologies.com` with a canned acknowledgment.

Uses `message.reply()` (from `cloudflare:email` + `mimetext`), not
`env.EMAIL.send()`, for the same reason as the original: `env.EMAIL.send()`
only works for pre-verified destination addresses, which doesn't fit here
since the sender is a new address every time.

## Deploy

```bash
cd ~/Projects/aveneg-technologies-mailer
npx wrangler secret put FORWARD_TO   # the mailbox the copy is forwarded to
npx wrangler deploy
```

`FORWARD_TO` is a secret rather than a constant in `src/index.js` because the
destination is a personal mailbox and this repo is public. The Worker throws
if it is unset, so set it before the first deploy — otherwise mail to `info@`
bounces instead of arriving.

You're already logged in via the same Cloudflare account used for the site
and the other mailer — no separate `wrangler login` needed.

That publishes the Worker but does **not** route any mail to it yet — Workers
and Email Routing rules are wired together in the dashboard, next.

## Wire it up in the dashboard

1. Cloudflare dashboard → **avenegtechnologies.com** → **Email** → **Email
   Routing** → **Routing rules**.
2. Find the existing rule for `info@avenegtechnologies.com`.
3. Change its action from **Send to email** to **Send to a Worker** →
   `aveneg-technologies-mailer`. This replaces the plain forward — the Worker
   does the forwarding itself, so nothing is lost.

**Test before trusting it in production:**

1. Send a real email to `info@avenegtechnologies.com` from an address you can
   check (a personal account, not this domain).
2. Confirm it's forwarded to the mailbox held in the `FORWARD_TO` secret,
   same as before.
3. Confirm the sending account *also* receives the auto-reply from
   `noreply@avenegtechnologies.com`.

## Changing the reply text

Edit the `ACK_BODY` string in `src/index.js`, then `npx wrangler deploy`
again. There is no build step.

**Keep the postal address block.** Not strictly required here the way it was
for the original's "you're on the launch list" acknowledgment — a plain
receipt of an inbound inquiry is transactional, not commercial, under
CAN-SPAM — but it costs nothing to keep and matches the other mailer's
convention.

## Safety notes

- `NEVER_REPLY_TO` in `src/index.js` stops this from replying to another
  autoresponder (or itself) and looping. Not a spam filter — just loop
  prevention.
- `message.reply()` itself caps abuse: only one reply per incoming email, and
  Cloudflare refuses to reply to a message with more than 100 `References`
  entries (a sign of a forwarding loop).
- A failed reply is logged and swallowed, not thrown — an error there must
  never cause Cloudflare to treat the *original* incoming email as
  undeliverable and bounce it back to the sender. Forwarding happens first
  and is unaffected if the reply fails.
