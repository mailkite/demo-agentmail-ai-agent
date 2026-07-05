// CONTRAST (not the MailKite path — a faithful, fair sketch of the AgentMail one).
// AgentMail is a direct peer, and a good one: it gives an AI agent its own inbox over
// a clean API in one call, and receives by webhook, WebSocket, or poll (message.received).
// This file mirrors that path next to MailKite's so the two HONEST differences the post
// argues are something you can diff and test, not take on faith:
//
//   1. The default inbox address lives on the shared agentmail.to domain. An inbox on
//      your OWN domain is a paid-plan feature (Developer, $20/mo+, SPF/DKIM/DMARC on your
//      DNS). On MailKite an inbox on a domain you own is the baseline — free, unlimited.
//   2. The documented message.received event carries no normalized SPF/DKIM/DMARC verdict.
//      MailKite hands the agent one field, event.auth, computed at the edge.
//
// Neither is a knock on AgentMail's code — they're the shape of a focused product. See
// ../server.mjs for the MailKite side and ../server.test.mjs for the two contrast tests.

// AgentMail creates an inbox in one call: client.inboxes.create({ clientId }). With no
// domain the address is on the SHARED agentmail.to domain; an inbox on your own domain
// requires a paid plan. This returns the address AgentMail assigns for a given inbox.
export function inboxAddress({ username = "support-agent", domain } = {}) {
  // `domain` is only set on a paid custom-domain inbox; the default is the shared domain.
  return `${username}@${domain ?? "agentmail.to"}`;
}

// The trust verdict an agent can read STRAIGHT OFF AgentMail's documented message.received
// payload. That event carries from/to/subject/text/html/attachments — but no normalized
// spf/dkim/dmarc field, so there's nothing to weight a sender by out of the box. Returns
// null on the documented shape: the agent trusts blindly or reconstructs the verdict from
// raw headers itself. Compare event.auth in ../server.mjs, which is always present.
export function authVerdict(message) {
  return message?.auth ?? null; // documented AgentMail shape has no `auth` → null
}

// An AgentMail inbound webhook handler: one message.received per event (not a batch),
// body may be html-only (text is absent for HTML-only mail or payloads over 1 MB), and
// the reply goes back through client.inboxes.messages.send from the SAME inbox.
export async function handleAgentMailInbound(body, { runAgent, sendFromInbox, inboxId }) {
  const { event_type, message } = body;
  if (event_type !== "message.received") return;

  // text may be absent — fall back to html.
  const task = message.text ?? message.html ?? "";

  // No normalized auth verdict in the documented event → nothing to weight the sender by.
  const verdict = authVerdict(message); // null on the documented shape

  const answer = await runAgent({
    task,
    from: message.from,
    trusted: verdict ? verdict.spf === "pass" && verdict.dmarc === "pass" : false,
  });

  // Reply from the same inbox; AgentMail's thread model handles threading for you.
  await sendFromInbox(inboxId, {
    to: message.from,
    subject: `Re: ${message.subject}`,
    ...answer,
  });
}
