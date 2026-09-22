import http from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { FIXTURE_CLOCK } from "../src/core/fixtures";
import {
  emptyState,
  evaluate,
  parsePolicy,
  presets,
  type Policy,
} from "../src/core/policy";
import {
  byteLength,
  matches,
  MAX_WIRE_BYTES,
  parseFilters,
  query,
  validInt,
  type Filter,
} from "../src/core/protocol";

const origins = new Set(["http://127.0.0.1:4326", "http://localhost:4326"]);
export function createRelay({
  port = 7337,
  policy = presets.quiet,
  clock = FIXTURE_CLOCK,
}: { port?: number; policy?: Policy; clock?: number } = {}) {
  let state = emptyState(),
    activePolicy = parsePolicy(policy),
    startClock = clock;
  const subscriptions = new Map<WebSocket, Map<string, Filter[]>>();
  const send = (ws: WebSocket, message: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 1_048_576) {
        ws.close(1013, "Slow reader");
        return;
      }
      ws.send(JSON.stringify(message));
    }
  };
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) {
      res.writeHead(403).end("Origin not permitted");
      return;
    }
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.writeHead(204).end();
      return;
    }
    if (req.url === "/health" && req.method === "GET") {
      res.end(
        JSON.stringify({
          name: "QuietRelay",
          mode: "local fixture rehearsal",
          clock: startClock,
          processed: state.processed,
          stored: state.events.size,
          policy: activePolicy.name,
        }),
      );
      return;
    }
    if (req.url === "/lab/reset" && req.method === "POST") {
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString();
          if (byteLength(body) > 32_768)
            throw new Error("Reset payload too large.");
        }
        const config = JSON.parse(body);
        if (!validInt(config.clock))
          throw new Error("Clock must be a nonnegative integer.");
        const nextPolicy = parsePolicy(config.policy);
        for (const [ws, subs] of subscriptions) {
          for (const id of subs.keys())
            send(ws, ["CLOSED", id, "error: local rehearsal reset"]);
          subs.clear();
        }
        state = emptyState();
        activePolicy = nextPolicy;
        startClock = config.clock;
        res.end(
          JSON.stringify({
            ok: true,
            clock: startClock,
            policy: activePolicy.name,
          }),
        );
      } catch (error) {
        res.writeHead(400).end(JSON.stringify({ error: String(error) }));
      }
      return;
    }
    res
      .writeHead(404)
      .end(
        JSON.stringify({ error: "Only /health and /lab/reset are available." }),
      );
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_WIRE_BYTES,
    perMessageDeflate: false,
  });
  server.on("upgrade", (req, socket, head) => {
    if (
      req.url !== "/" ||
      (req.headers.origin && !origins.has(req.headers.origin)) ||
      wss.clients.size >= 8
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });
  wss.on("connection", (ws) => {
    subscriptions.set(ws, new Map());
    let frames = 0;
    ws.on("error", () => {});
    ws.on("close", () => subscriptions.delete(ws));
    ws.on("message", (data, isBinary) => {
      if (++frames > 2000) {
        ws.close(1008, "Frame ceiling reached");
        return;
      }
      if (isBinary) {
        send(ws, ["NOTICE", "invalid: text JSON frames only"]);
        return;
      }
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        send(ws, ["NOTICE", "invalid: malformed JSON"]);
        return;
      }
      if (!Array.isArray(msg) || typeof msg[0] !== "string") {
        send(ws, ["NOTICE", "invalid: message must be a JSON array"]);
        return;
      }
      if (msg[0] === "EVENT") {
        if (msg.length !== 2) {
          send(ws, ["NOTICE", "invalid: EVENT needs exactly one event object"]);
          return;
        }
        const decision = evaluate(
          msg[1],
          activePolicy,
          state,
          startClock + state.processed,
        );
        send(ws, decision.ok);
        if (
          decision.verdict === "admit" &&
          decision.event &&
          decision.effect !== "superseded"
        ) {
          for (const [peer, subs] of subscriptions)
            for (const [id, filters] of subs)
              if (filters.some((f) => matches(decision.event!, f)))
                send(peer, ["EVENT", id, decision.event]);
        }
        return;
      }
      if (msg[0] === "REQ") {
        const id = msg[1];
        if (typeof id !== "string" || !id.length || id.length > 64) {
          send(ws, [
            "NOTICE",
            "invalid: subscription id must contain 1–64 characters",
          ]);
          return;
        }
        const subs = subscriptions.get(ws)!;
        // A replacement REQ also replaces a formerly valid subscription if refused.
        subs.delete(id);
        try {
          if (subs.size >= 16)
            throw new Error("At most 16 subscriptions per connection.");
          const filters = parseFilters(msg.slice(2));
          subs.set(id, filters);
          for (const event of query(state.events.values(), filters))
            send(ws, ["EVENT", id, event]);
          send(ws, ["EOSE", id]);
        } catch (error) {
          send(ws, ["CLOSED", id, `restricted: ${String(error)}`]);
        }
        return;
      }
      if (
        msg[0] === "CLOSE" &&
        msg.length === 2 &&
        typeof msg[1] === "string"
      ) {
        subscriptions.get(ws)?.delete(msg[1]);
        return;
      }
      send(ws, [
        "NOTICE",
        "invalid: supported messages are EVENT, REQ and CLOSE",
      ]);
    });
  });
  return {
    listen: () =>
      new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          resolve((server.address() as import("node:net").AddressInfo).port);
        });
      }),
    close: () =>
      new Promise<void>((resolve) => {
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => server.close(() => resolve()));
      }),
    state: () => state,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const relay = createRelay();
  relay
    .listen()
    .then((port) =>
      console.log(
        `QuietRelay listening only at ws://127.0.0.1:${port}\nSynthetic rehearsal clock: ${new Date(FIXTURE_CLOCK * 1000).toISOString()}\nNo upstream relay connections. HTTP reset is a separate lab endpoint.`,
      ),
    );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => relay.close().then(() => process.exit(0)));
}
