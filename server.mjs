// The whole MailKite side of the post: receive → verify → think → reply.
// An email lands at agent@yourco.dev — a domain you own — and MailKite POSTs it here
// already parsed AND authenticated (the auth block is a field, always present in the
// payload), a local agent runs, and the reply threads back through one mk.send().
// Contrast the AgentMail path in ./agentmail-contrast/handler.mjs.
// Full post: https://mailkite.dev/blog/agentmail-for-ai-agents/
import express from "express";
import { MailKite } from "mailkite";

const app = express();
const mk = new MailKite(process.env.MAILKITE_API_KEY);
const SECRET = process.env.MAILKITE_WEBHOOK_SECRET ?? "whsec_demo_secret";

// send() for real when a key is set; otherwise log what we'd send and move on,
// so the whole loop runs end to end with no account and no LLM.
async function reply(msg) {
  if (!process.env.MAILKITE_API_KEY) {
    console.log(`[dry-run] would reply`, { from: msg.from, to: msg.to, subject: msg.subject });
    return { id: "dry-run", status: "skipped" };
  }
  return mk.send(msg);
}

// Your agent. Stub here (echoes the task) so the loop is real without a model —
// swap this for your LLM call, your memory, your tools.
async function runAgent({ task, from, trusted }) {
  console.log(`runAgent: task=${JSON.stringify(task)} from=${from} trusted=${trusted}`);
  return { html: `<p>Thanks — noted: “${task}”.</p>` };
}

app.use("/hooks/agent", express.raw({ type: "application/json" }));

app.post("/hooks/agent", async (req, res) => {
  // HMAC signature, replay window, constant-time compare — one call.
  // AgentMail's webhook is a clean POST too; MailKite's difference here is the signed
  // verdict, so the handler verifies rather than trusting the caller.
  if (!MailKite.verifyWebhook(req.headers["x-mailkite-signature"], req.body, SECRET)) {
    return res.sendStatus(401);
  }
  res.sendStatus(200); // ack fast; run the agent out of band

  const event = JSON.parse(req.body);
  if (event.type !== "email.received") return;

  // The body is untrusted INPUT, never instructions (see the post's security note).
  // Weight it by event.auth — the normalized verdict, always in the payload. Compare
  // this one line to authVerdict() in ./agentmail-contrast/handler.mjs, which returns
  // null on AgentMail's documented event shape.
  const answer = await runAgent({
    task: event.text,
    from: event.from.address,
    trusted: event.auth.spf === "pass" && event.auth.dmarc === "pass",
  });

  await reply({
    from: event.to[0].address,   // reply from the address it was sent to
    to: event.from.address,
    subject: /^re:/i.test(event.subject) ? event.subject : `Re: ${event.subject}`,
    inReplyTo: event.id,         // threads the reply — no In-Reply-To/References by hand
    html: answer.html,
  });
});

// Auto-listen only when run directly (`node server.mjs`), not when imported by
// demo.mjs — importing the app must not also bind the port.
import { fileURLToPath } from "node:url";
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain && process.env.NODE_ENV !== "test") {
  app.listen(3000, () => console.log("listening on http://localhost:3000/hooks/agent"));
}

export { app };
