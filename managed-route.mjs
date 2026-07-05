// The other way to run the loop from the post: hand it to a managed route.
// AgentMail gives the agent an inbox but you still host the model loop yourself. On
// MailKite a route whose action is 'agent' runs the model turns for you on a durable
// queue, with a per-run transcript — no endpoint to host. Run: `npm run route-demo`.
// Full post: https://mailkite.dev/blog/agentmail-for-ai-agents/
import { MailKite } from "mailkite";

const spec = {
  match: "support@yourco.dev",       // or "*@agent.yourco.dev" for a whole subdomain
  action: "agent",
  agentPrompt: "You are a support agent. Answer from the docs; escalate refunds to a human.",
};

if (!process.env.MAILKITE_API_KEY) {
  // No key: show exactly what we'd create, don't touch the API.
  console.log(`[dry-run] would create route`, spec);
} else {
  const mk = new MailKite(process.env.MAILKITE_API_KEY);
  const route = await mk.createRoute(spec); // the matched domain must already be verified
  console.log("created route", route);
}
