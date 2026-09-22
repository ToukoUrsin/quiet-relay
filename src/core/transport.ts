import type { Case } from "./fixtures";
import type { Policy } from "./policy";
export type WireFrame = { direction: "sent" | "received"; message: unknown };
export async function runLoopback(
  cases: Case[],
  policy: Policy,
  onFrame: (frame: WireFrame) => void,
) {
  if (
    !cases.length ||
    cases.some((c, i) => c.receivedAt !== cases[0].receivedAt + i)
  )
    throw new Error(
      "Loopback rehearsal requires consecutive one-second arrival offsets.",
    );
  const response = await fetch("http://127.0.0.1:7337/lab/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ policy, clock: cases[0].receivedAt }),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error("Loopback reset failed.");
  const ws = new WebSocket("ws://127.0.0.1:7337/");
  const queued: unknown[][] = [];
  let waiting: ((m: unknown[]) => void) | undefined;
  const send = (m: unknown[]) => {
    onFrame({ direction: "sent", message: m });
    ws.send(JSON.stringify(m));
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    onFrame({ direction: "received", message: m });
    if (waiting) {
      const fn = waiting;
      waiting = undefined;
      fn(m);
    } else queued.push(m);
  };
  const next = () =>
    new Promise<unknown[]>((resolve, reject) => {
      if (queued.length) {
        resolve(queued.shift()!);
        return;
      }
      const timer = setTimeout(() => {
        waiting = undefined;
        reject(new Error("Relay reply timed out."));
      }, 4000);
      waiting = (m) => {
        clearTimeout(timer);
        resolve(m);
      };
    });
  const until = async (type: string, sub?: string) => {
    for (let i = 0; i < 2000; i++) {
      const m = await next();
      if (m[0] === type && (sub === undefined || m[1] === sub)) return m;
    }
    throw new Error("Unexpected reply volume.");
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("Could not open local relay."));
      }, 4000);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Run npm run relay in another terminal."));
      };
    });
    send(["REQ", "live", { limit: 0 }]);
    await until("EOSE", "live");
    const acknowledgements: unknown[][] = [];
    for (const row of cases) {
      send(["EVENT", row.event]);
      acknowledgements.push(await until("OK"));
    }
    send(["REQ", "snapshot", {}]);
    await until("EOSE", "snapshot");
    send(["CLOSE", "live"]);
    send(["CLOSE", "snapshot"]);
    return acknowledgements;
  } finally {
    ws.close();
  }
}
