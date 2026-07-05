import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { MailKite } from "mailkite";
import { verifySignature } from "./raw-server.mjs";
import { inboxAddress, authVerdict } from "./agentmail-contrast/handler.mjs";

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
// AgentMail is a direct peer that also gives agents inboxes; these two tests pin down
// the two HONEST differences the post argues (agentmail-contrast/handler.mjs), neither a
// knock on its code: (1) the default inbox is on the shared agentmail.to domain, an
// own-domain inbox being a paid-plan feature; (2) the documented message.received event
// carries no normalized auth verdict, where MailKite's event.auth is always a field.

test("AgentMail: the default inbox lives on the shared agentmail.to domain, not one you own", () => {
  // create() with no domain (Free tier) → an address on agentmail.to. An inbox on your
  // OWN domain is a paid-plan feature. On MailKite an own-domain inbox is the baseline,
  // free and unlimited — that's the address in sample-event.mjs (agent@yourco.dev).
  assert.equal(inboxAddress({ username: "support-agent" }), "support-agent@agentmail.to");
  assert.equal(inboxAddress({ username: "support-agent", domain: "yourco.dev" }), "support-agent@yourco.dev");
});

test("AgentMail: the documented message.received event carries no normalized auth verdict", () => {
  // A message shaped like AgentMail's documented event: from/to/subject/text/html — no
  // auth field, so an agent has nothing to weight the sender by out of the box.
  const agentMailMessage = {
    from: "ada@example.com",
    subject: "Re: invoice #1042",
    text: "Looks good — approved!",
    html: "<p>Looks good — approved!</p>",
  };
  assert.equal(authVerdict(agentMailMessage), null); // nothing to read

  // The SAME accessor over a MailKite email.received event finds a normalized verdict —
  // the field server.mjs reads to weight a sender. This is the difference, in one assert.
  const mailkiteEvent = { auth: { spf: "pass", dkim: "pass", dmarc: "pass", spam: "ham" } };
  assert.deepEqual(authVerdict(mailkiteEvent), { spf: "pass", dkim: "pass", dmarc: "pass", spam: "ham" });
});
