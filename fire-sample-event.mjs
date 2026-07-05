// Fires a signed sample `email.received` event at a running agent server — exactly
// the shape MailKite's delivery worker POSTs. Run `node server.mjs` first, then this
// (or just `npm start`, which boots the server and self-fires this in one command).
import { fireSampleEvent } from "./sample-event.mjs";

const SECRET = process.env.MAILKITE_WEBHOOK_SECRET ?? "whsec_demo_secret";
const URL = process.env.HOOK_URL ?? "http://localhost:3000/hooks/agent";

const { status, text } = await fireSampleEvent({ url: URL, secret: SECRET });
console.log(`POST ${URL} → ${status} ${text}`);
