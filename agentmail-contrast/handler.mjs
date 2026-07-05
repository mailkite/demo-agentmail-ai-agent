// CONTRAST (not the MailKite path — a faithful, fair sketch of the AgentMail one).
// AgentMail is a direct peer, and a good one: it gives an AI agent its own inbox over
// a clean API in one call, receives by webhook/WebSocket/poll (message.received), and
// delivers the parsed body (text + html) inline. This file mirrors that path next to
// MailKite's so the HONEST, verifiable shape difference the post argues is something you
// can diff and test, not take on faith:
//
//   Authentication is surfaced as separate, permission-gated EVENT TYPES —
//   `message.received.unauthenticated`, `message.received.spam`,
//   `message.received.blocked` — rather than a normalized SPF/DKIM/DMARC verdict inline
//   on the plain `message.received` payload. So to weight a sender, an AgentMail agent
//   subscribes to (and is permissioned for) those extra events and branches on the event
//   TYPE. MailKite hands the agent one field, `event.auth`, on every `email.received`, so
//   one handler weights every sender without extra subscriptions.
//
// This is not a knock on AgentMail — it's the shape of a focused product, and AgentMail
// clearly does evaluate authentication (that's what the `.unauthenticated` event is). See
// ../server.mjs for the MailKite side and ../server.test.mjs for the contrast tests.
// (AgentMail's default inbox address is on the shared `agentmail.to` domain; you can add
// your own domain via DNS. MailKite is domain-first — an inbox on a domain you own is the
// baseline. Confirm current plan details on each pricing page before you rely on them.)

// AgentMail's documented webhook event types, for reference. Authentication shows up as a
// SUFFIX on the event name, not as a field on the payload.
export const AGENTMAIL_EVENT_TYPES = [
  "message.received",
  "message.received.spam",            // requires label_spam_read permission
  "message.received.blocked",         // requires label_blocked_read permission
  "message.received.unauthenticated", // received without authentication headers
  "message.sent", "message.delivered", "message.bounced",
  "message.complained", "message.rejected", "domain.verified",
];

// Can an agent read a normalized SPF/DKIM/DMARC verdict off the plain `message.received`
// payload? No — the documented payload carries from/to/subject/text/html/attachments but
// no `auth` field. The authentication signal lives in the event TYPE instead
// (`message.received.unauthenticated` vs plain `message.received`), which you subscribe to
// and are permissioned for. Returns null on the plain shape.
export function authVerdict(message) {
  return message?.auth ?? null; // no `auth` field on the plain message.received
}

// Where AgentMail carries the auth signal: on the event NAME, not the message body. A
// plain `message.received` means "not flagged"; `.unauthenticated`/`.spam`/`.blocked` are
// separate events. To act on trust you branch on this, not on a per-message verdict field.
export function authSignalFromEventType(eventType) {
  if (eventType === "message.received.unauthenticated") return "unauthenticated";
  if (eventType === "message.received.spam") return "spam";
  if (eventType === "message.received.blocked") return "blocked";
  if (eventType === "message.received") return "unflagged"; // no granular spf/dkim/dmarc here
  return "other";
}

// An AgentMail inbound handler: one message per event (not a batch); the body is inline
// (text may be absent for HTML-only mail or payloads over 1 MB, then you fetch via API);
// trust comes from the event TYPE you're handling, not an `auth` field; and the reply goes
// back through client.inboxes.messages.send from the SAME inbox (threading handled for you).
export async function handleAgentMailInbound(body, { runAgent, sendFromInbox, inboxId }) {
  const signal = authSignalFromEventType(body.event_type);
  if (signal === "other" || signal === "blocked") return; // not an inbound to act on

  const { message } = body;
  const task = message.text ?? message.html ?? ""; // text may be absent → fall back to html

  // Trust is the event type, not a payload field: a plain message.received is "unflagged",
  // and there's no granular spf/dkim/dmarc verdict to weight by out of the box.
  const answer = await runAgent({
    task,
    from: message.from,
    trusted: signal === "unflagged", // best you can say without the granular verdict
  });

  await sendFromInbox(inboxId, {
    to: message.from,
    subject: `Re: ${message.subject}`,
    ...answer,
  });
}
