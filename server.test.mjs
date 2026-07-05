import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { MailKite } from "mailkite";
import { verifySignature } from "./raw-server.mjs";
import { inboxAddress, authVerdict, authSignalFromEventType } from "./agentmail-contrast/handler.mjs";

const SECRET = "whsec_test";
const body = JSON.stringify({ type: "email.received" });
const t = 1_750_000_000_000; // ms since epoch — the unit MailKite signs with
const sign = (secret, ts, raw) =>
  `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex")}`;

test("accepts a valid signature within tolerance", () => {
  assert.equal(verifySignature(sign(SECRET, t, body), body, SECRET, t + 10_000), true);
});

test("rejects a wrong secret", () => {
  assert.equal(verifySignature(sign("whsec_other", t, body), body, SECRET, t + 10_000), false);
});

test("rejects a tampered body", () => {
  assert.equal(verifySignature(sign(SECRET, t, body), body + " ", SECRET, t + 10_000), false);
});

test("rejects a stale timestamp (replay)", () => {
  assert.equal(verifySignature(sign(SECRET, t, body), body, SECRET, t + 3_600_000), false);
});

test("rejects malformed headers", () => {
  assert.equal(verifySignature("v1=deadbeef", body, SECRET, t), false);
  assert.equal(verifySignature(undefined, body, SECRET, t), false);
});

test("SDK and raw implementations agree on a fresh valid signature", () => {
  const nowMs = Date.now();
  const header = sign(SECRET, nowMs, body);
  assert.equal(MailKite.verifyWebhook(header, body, SECRET), true);
  assert.equal(verifySignature(header, body, SECRET, nowMs), true);
  assert.equal(MailKite.verifyWebhook(header, body + "x", SECRET), false);
});

// ── The AgentMail contrast, made concrete ────────────────────────────────────
// AgentMail is a direct peer that also gives agents inboxes and does evaluate sender
// authentication; these two tests pin down the one HONEST, verifiable shape difference the
// post argues (agentmail-contrast/handler.mjs): AgentMail surfaces the auth signal as a
// separate EVENT TYPE (message.received.unauthenticated / .spam / .blocked), not as a
// normalized SPF/DKIM/DMARC verdict inline on the plain message.received payload — where
// MailKite's event.auth is always a field on every event.

test("AgentMail: the default inbox is on the shared agentmail.to domain (own-domain is a paid plan)", () => {
  // No domain → an address on agentmail.to. An own-domain inbox is a paid-plan feature
  // (Free includes 0 custom domains; Developer $20/mo adds 10). On MailKite an own-domain
  // inbox is the baseline — that's the address in sample-event.mjs (agent@yourco.dev).
  assert.equal(inboxAddress({ username: "support-agent" }), "support-agent@agentmail.to");
  assert.equal(inboxAddress({ username: "support-agent", domain: "yourco.dev" }), "support-agent@yourco.dev");
});

test("AgentMail: the auth signal is the event TYPE, not a field on the message", () => {
  // AgentMail routes authentication as a suffix on the event name — you subscribe to (and
  // are permissioned for) these extra events and branch on the type, rather than reading a
  // per-message verdict. A plain message.received is just "unflagged".
  assert.equal(authSignalFromEventType("message.received"), "unflagged");
  assert.equal(authSignalFromEventType("message.received.unauthenticated"), "unauthenticated");
  assert.equal(authSignalFromEventType("message.received.spam"), "spam");
  assert.equal(authSignalFromEventType("message.received.blocked"), "blocked");
});

test("AgentMail: the plain message.received payload carries no normalized auth verdict field", () => {
  // A message shaped like AgentMail's documented event: from/to/subject/text/html (body
  // inline) — but no per-message auth field, so trust comes from the event type, not here.
  const agentMailMessage = {
    from: "ada@example.com",
    subject: "Re: invoice #1042",
    text: "Looks good — approved!",
    html: "<p>Looks good — approved!</p>",
  };
  assert.equal(authVerdict(agentMailMessage), null); // no auth field on the payload itself

  // The SAME accessor over a MailKite email.received event finds a normalized verdict inline —
  // the field server.mjs reads to weight every sender, no extra event subscription needed.
  const mailkiteEvent = { auth: { spf: "pass", dkim: "pass", dmarc: "pass", spam: "ham" } };
  assert.deepEqual(authVerdict(mailkiteEvent), { spf: "pass", dkim: "pass", dmarc: "pass", spam: "ham" });
});
