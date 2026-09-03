/**
 * Handles info@avenegtechnologies.com: forwards to a personal inbox (same as
 * the old Cloudflare Email Routing "forward" action did) AND sends an
 * immediate acknowledgment from noreply@avenegtechnologies.com, so a sender
 * never sees a personal address and nobody has to reply by hand from Gmail.
 *
 * Cloudflare's Email Routing rule for info@ can only run ONE action (send to
 * email, send to a Worker, or drop) — not both at once — so this Worker does
 * the job of both: it is the only action on the rule.
 *
 * This is the corporate/parent-entity address, not a product waitlist —
 * the acknowledgment reads as general business correspondence and points a
 * sender at the right specific address (commercial licensing, or Watch
 * Vault Archive support) rather than confirming enrollment in anything.
 *
 * This Worker does not read or store the incoming message. It only needs the
 * sender's address, which Cloudflare Email Routing hands it directly as
 * `message.from` — no MIME parsing required for this use case.
 */

import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";

const FORWARD_TO = "bradwaye@gmail.com";

// Addresses that must never receive an auto-reply, however they got in here.
// Not exhaustive spam/bounce filtering — just the trivial case of an
// autoresponder replying to another autoresponder (or to itself) forever.
const NEVER_REPLY_TO = [/^noreply@/i, /^no-reply@/i, /^mailer-daemon@/i, /^postmaster@/i];

const ACK_BODY =
  `Thank you for contacting Aveneg Technologies, LLC.\n\n` +
  `This is an automated acknowledgment confirming your message was received. ` +
  `If your inquiry is about a specific matter, it may reach the right person ` +
  `faster at one of these instead:\n\n` +
  `Commercial licensing: legal@avenegtechnologies.com\n` +
  `Watch Vault Archive support: support@watchvaultarchive.com\n\n` +
  `Replies to this address are not monitored.\n\n` +
  `— Aveneg Technologies, LLC\n` +
  `https://avenegtechnologies.com\n\n` +
  `Aveneg Technologies, LLC\n` +
  `8735 Dunwoody Place, Ste R\n` +
  `Atlanta, GA 30350`;

export default {
  async email(message, env, ctx) {
    const from = message.from;

    try {
      await message.forward(FORWARD_TO);
    } catch (err) {
      // Forwarding is the important half of this Worker's job — if it fails,
      // let Cloudflare know by rethrowing, since a lost original email is
      // worse than a delivery-status bounce.
      console.error("forward failed:", err.message);
      throw err;
    }

    if (NEVER_REPLY_TO.some((re) => re.test(from))) return;

    // env.EMAIL.send() can only target pre-verified destination addresses,
    // which doesn't work here — the sender is a new, arbitrary address every
    // time. message.reply() is the method built for exactly this: replying to
    // whoever emailed in, with no destination-verification requirement,
    // because Cloudflare already knows this address just sent to us.
    const msg = createMimeMessage();
    msg.setSender({ addr: "noreply@avenegtechnologies.com", name: "Aveneg Technologies" });
    msg.setRecipient(from);
    msg.setSubject("Message received — Aveneg Technologies");
    msg.addMessage({ contentType: "text/plain", data: ACK_BODY });

    const replyMessage = new EmailMessage("noreply@avenegtechnologies.com", from, msg.asRaw());

    try {
      await message.reply(replyMessage);
    } catch (err) {
      // Swallow rather than throw: a failed auto-reply must never cause
      // Cloudflare to treat the ORIGINAL email as undeliverable and bounce
      // it back to the sender. The forward above already succeeded and is
      // unaffected either way.
      console.error("auto-reply failed:", err.message);
    }
  },
};
