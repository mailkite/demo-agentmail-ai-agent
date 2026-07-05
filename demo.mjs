// One-command demo: boot the agent server, self-fire the signed sample event at it,
// print the round trip, and stay up. This is `npm start` — first authenticated result
// in one command, no domain, no account, no LLM. A webhook needs a public URL in
// production; here the demo POSTs to its own localhost, so the whole loop runs anywhere
// (your machine, StackBlitz, Codespaces). Point real email at server.mjs when you're ready.
import { app } from "./server.mjs";
import { fireSampleEvent } from "./sample-event.mjs";

const PORT = Number(process.env.PORT ?? 3000);
const SECRET = process.env.MAILKITE_WEBHOOK_SECRET ?? "whsec_demo_secret";

app.listen(PORT, async () => {
  console.log(`listening on http://localhost:${PORT}/hooks/agent\n`);

  const { status, text } = await fireSampleEvent({
    url: `http://localhost:${PORT}/hooks/agent`,
    secret: SECRET,
  });

  // The handler acks 200 and runs the agent out of band, so its logs (runAgent → reply)
  // land just above this line. Small pause so the round trip reads top-to-bottom.
  await new Promise((r) => setTimeout(r, 300));
  console.log(`\n— self-fired one signed email.received event → ${status} ${text}`);
  console.log(`  server's still up: POST your own events to :${PORT}/hooks/agent, or point real email here.`);
});
