// Runs Next.js and the live support chat on one port.
//
// Next.js route handlers can't keep a WebSocket open, so this custom server starts Next and
// answers WebSocket upgrades itself: /ws/support goes to the support chat, everything else
// (Next's own hot reload in development) is handed back to Next.
//
//   npm run dev     -> development, with hot reload
//   npm run build && npm start -> production
import { createServer } from "node:http";
import next from "next";
import { SUPPORT_PATH, createSupportSocket } from "./server/support-socket";

// Next reads .env.local itself, but the chat needs DATABASE_URL and SESSION_SECRET before it starts.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No file: the variables come from the environment instead (as in production).
}

const dev = !process.argv.includes("--production");
// Set here rather than in the npm script, where VAR=value doesn't work on Windows.
(process.env as Record<string, string>).NODE_ENV = dev ? "development" : "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "localhost";

async function main() {
  const app = next({ dev, hostname, port });
  await app.prepare();
  const handle = app.getRequestHandler();
  const nextUpgrade = app.getUpgradeHandler();
  const support = createSupportSocket();

  const server = createServer((req, res) => handle(req, res));
  server.on("upgrade", (req, socket, head) => {
    const path = (req.url ?? "").split("?")[0];
    if (path === SUPPORT_PATH) {
      support.handleUpgrade(req, socket, head).catch((err) => {
        console.error("[support] upgrade failed:", err);
        socket.destroy();
      });
    } else {
      nextUpgrade(req, socket, head);
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port} (${dev ? "development" : "production"}), support chat at ${SUPPORT_PATH}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
