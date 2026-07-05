# demo-agentmail-ai-agent

The runnable companion to [The AgentMail alternative for AI agents](https://mailkite.dev/blog/agentmail-for-ai-agents/).

AgentMail is a direct peer — a focused, well-funded product that gives an AI agent its
own inbox over a clean API and receives by webhook, WebSocket, or poll. It does that job
well. This repo runs the MailKite version of the same job — an email lands at
`agent@yourco.dev` on a domain **you own**, MailKite POSTs it already parsed **and
authenticated**, a local agent runs, and the reply threads back through one `mk.send()` —
and puts the AgentMail path right next to it in
[`agentmail-contrast/`](./agentmail-contrast/handler.mjs) so the two honest differences
the post argues are something you can diff and test. It runs end to end with no MailKite
account and no LLM: the reply is a dry-run and the agent is a stub you swap for your model.

[![ci](https://github.com/mailkite/demo-agentmail-ai-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/mailkite/demo-agentmail-ai-agent/actions/workflows/ci.yml)

## Run it in one click

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/mailkite/demo-agentmail-ai-agent?file=server.mjs)
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/mailkite/demo-agentmail-ai-agent?quickstart=1)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/mailkite/demo-agentmail-ai-agent)

StackBlitz runs the whole thing in your browser tab (WebContainers — real Node, no
account needed): open it and it boots the server, self-fires a correctly signed sample
event, and prints the round trip — zero setup, no domain.

## Run it locally — one command

```sh
git clone https://github.com/mailkite/demo-agentmail-ai-agent
cd demo-agentmail-ai-agent
npm install     # mailkite + express
npm start       # boots the server, self-fires a signed email.received event, stays up
```

`npm start` prints the whole loop — the agent receives the task, reads the trust verdict
straight off `event.auth`, dry-runs the reply, and the server stays up for more:

```
listening on http://localhost:3000/hooks/agent

runAgent: task="Looks good — approved!" from=ada@example.com trusted=true
[dry-run] would reply { from: 'agent@yourco.dev', to: 'ada@example.com', subject: 'Re: invoice #1042' }

— self-fired one signed email.received event → 200 OK
  server's still up: POST your own events to :3000/hooks/agent, or point real email here.
```

A webhook needs a public URL in production; `npm start` sidesteps that by POSTing to its
own localhost, so the full loop runs anywhere. Want the halves separately? `npm run serve`
runs just the server, and `npm run fire-sample-event` fires the event from another
terminal. Set a real `MAILKITE_API_KEY` and the same code sends the reply for real instead
of dry-running it. Tamper with the body or the secret and the server answers `401`.

## The AgentMail contrast, in code (and in a test)

[`agentmail-contrast/handler.mjs`](./agentmail-contrast/handler.mjs) is a faithful, fair
sketch of the AgentMail inbound path: create an inbox in one call, receive a
`message.received` event (body inline), run the agent, and reply from the same inbox.
AgentMail is a legitimate peer and the code is clean — this isn't a "can't," and it *does*
evaluate sender authentication. The file pins the one honest, verifiable shape difference
the post argues. `npm test` makes it concrete:

```
✔ AgentMail: the auth signal is the event TYPE, not a field on the message
✔ AgentMail: the plain message.received payload carries no normalized auth verdict field
```

AgentMail surfaces authentication as a suffix on the event **name** —
`message.received.unauthenticated`, `message.received.spam`, `message.received.blocked` —
which you subscribe to and are permissioned for, then branch on the type. The plain
`message.received` payload carries no per-message SPF/DKIM/DMARC verdict, so the second test
runs the *same* `authVerdict()` accessor over both payloads: on AgentMail's documented
`message.received` it returns `null`, and on a MailKite `email.received` event it returns
the inline `auth` block — the field [`server.mjs`](./server.mjs) reads to weight every
sender without an extra event subscription. (AgentMail's default inbox is on the shared
`agentmail.to` domain; you can add your own via DNS. MailKite is domain-first — an
own-domain inbox is the baseline. Check each pricing page for current plan details.)

`npm test` also runs the five webhook-signature cases (valid, wrong secret, tampered
body, replayed timestamp, malformed header) plus an SDK/raw parity check.

## The two ways to run the loop

- **[`server.mjs`](./server.mjs) — bring your own agent.** The webhook hits your
  endpoint, your model runs (here a stub `runAgent` that echoes the task), and you reply
  with `mk.send()`. This is the `?file=server.mjs` StackBlitz target and the code at the
  top of the post.
- **[`managed-route.mjs`](./managed-route.mjs) — hand it to a managed route.**
  `mk.createRoute({ match, action: "agent", agentPrompt })` points a route at MailKite's
  hosted runner: the model turns run for you on a durable queue with a per-run
  transcript, no endpoint to host. AgentMail gives the agent an inbox but you still host
  the model loop yourself. Run with `npm run route-demo` (dry-runs unless
  `MAILKITE_API_KEY` is set).

## The rest

- [`fire-sample-event.mjs`](./fire-sample-event.mjs) — signs and POSTs the same payload
  shape MailKite's delivery worker sends (ms-timestamp HMAC), so the demo works with no
  account. The `auth` block is right in the payload.
- [`raw-server.mjs`](./raw-server.mjs) — **labeled raw alternative** (zero dependencies):
  hand-rolled HMAC-SHA256 over `"<t>.<rawBody>"` with a 5-minute replay window and
  constant-time compare — everything `MailKite.verifyWebhook` absorbs in one call.
- [`server.test.mjs`](./server.test.mjs) — signature vectors, SDK/raw parity, and the two
  AgentMail-contrast tests (`node --test`).

To point real email at it: [verify a domain on MailKite](https://mailkite.dev/docs/quickstart),
set your webhook URL to this server, and set `MAILKITE_WEBHOOK_SECRET` to your account's
signing secret. The body is untrusted input — treat it as data, not instructions, and
bound what the agent can do ([agent inbox security by design](https://mailkite.dev/blog/agent-inbox-security-by-design/)).

## License

MIT — built by the MailKite team. This demo accompanies
[The AgentMail alternative for AI agents](https://mailkite.dev/blog/agentmail-for-ai-agents/).
Questions or issues → [open an issue](https://github.com/mailkite/demo-agentmail-ai-agent/issues).
