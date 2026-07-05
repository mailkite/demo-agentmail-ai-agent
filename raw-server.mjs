// RAW ALTERNATIVE (prefer ./server.mjs, which uses the MailKite SDK).
// Zero-dependency receiver for when you can't take a dependency: hand-verifies the
// `x-mailkite-signature` header (t=<unix-ms>,v1=<hmac-sha256 hex over "<t>.<rawBody>">)
// — everything `MailKite.verifyWebhook` does in one line. AgentMail contrast: ./agentmail-contrast/.
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT ?? 3000);
const SECRET = process.env.MAILKITE_WEBHOOK_SECRET ?? "whsec_demo_secret";
const TOLERANCE_MS = 300_000; // reject signatures older than 5 minutes (replay guard)

// `t` is MILLISECONDS since the epoch (matches MailKite's delivery worker) — getting
// this unit wrong is exactly the kind of bug MailKite.verifyWebhook exists to absorb.
export function verifySignature(header, rawBody, secret, nowMs = Date.now()) {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header ?? "");
  if (!m) return false;
  const [, t, theirHex] = m;
  if (Math.abs(nowMs - Number(t)) > TOLERANCE_MS) return false;
  const ourHex = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const ours = Buffer.from(ourHex, "hex");
  const theirs = Buffer.from(theirHex, "hex");
  return ours.length === theirs.length && timingSafeEqual(ours, theirs);
}

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/hooks/mailkite") {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (!verifySignature(req.headers["x-mailkite-signature"], rawBody, SECRET)) {
    res.writeHead(401).end("invalid signature");
    return;
  }

  const event = JSON.parse(rawBody);
  if (event.type === "email.received") {
    console.log(`from:    ${event.from.address}`);
    console.log(`subject: ${event.subject}`);
    // One normalized field, always present. AgentMail's documented event has no such
    // verdict (see ./agentmail-contrast/handler.mjs → authVerdict returns null).
    console.log(`auth:    spf=${event.auth.spf} dkim=${event.auth.dkim} dmarc=${event.auth.dmarc}`);
    console.log(`text:    ${event.text}`);
    for (const a of event.attachments ?? []) {
      console.log(`attach:  ${a.filename} (${a.contentType}, ${a.size} bytes) → ${a.url}`);
    }
  }
  res.writeHead(200).end("ok"); // ack fast; do heavy work out of band
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => console.log(`listening on http://localhost:${PORT}/hooks/mailkite`));
}
