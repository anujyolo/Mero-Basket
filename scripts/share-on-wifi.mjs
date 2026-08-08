// Share the dev server with teammates on the same Wi-Fi.
//
// vinext binds the dev server to localhost only and ignores --host, so every
// other device on the network gets ERR_CONNECTION_REFUSED. This forwards a
// port on all interfaces to that localhost server.
//
//   node scripts/share-on-wifi.mjs
//
// Then open the printed http://<lan-ip>:3003 URL on any device on the same network.

import net from "node:net";
import os from "node:os";

const LISTEN_PORT = Number(process.env.SHARE_PORT || 3003);
const TARGET_PORT = Number(process.env.TARGET_PORT || 3002);
const TARGET_HOST = process.env.TARGET_HOST || "::1"; // vinext listens on IPv6 localhost

const server = net.createServer((client) => {
  const upstream = net.connect(TARGET_PORT, TARGET_HOST);
  client.pipe(upstream);
  upstream.pipe(client);
  const drop = () => { client.destroy(); upstream.destroy(); };
  client.on("error", drop);
  upstream.on("error", drop);
});

server.on("error", (error) => {
  console.error(`Could not listen on ${LISTEN_PORT}: ${error.message}`);
  process.exit(1);
});

server.listen(LISTEN_PORT, "0.0.0.0", () => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);

  console.log(`Forwarding 0.0.0.0:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}\n`);
  if (addresses.length === 0) {
    console.log("No network address found. Are you connected to Wi-Fi?");
  } else {
    console.log("Share these with teammates on the SAME Wi-Fi or hotspot:");
    addresses.forEach((address) => console.log(`  http://${address}:${LISTEN_PORT}`));
  }
  console.log("\nStop with Ctrl-C.");
});
