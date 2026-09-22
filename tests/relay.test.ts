import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createRelay } from "../server/relay";
import { FIXTURE_CLOCK as NOW, makeFixtures } from "../src/core/fixtures";
import { parsePolicy, presets } from "../src/core/policy";
import { signFixture } from "../src/core/protocol";
import { replay } from "../src/core/replay";
async function client(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
  const queue: unknown[][] = [];
  let resolve: ((v: unknown[]) => void) | undefined;
  ws.on("message", (data) => {
    const value = JSON.parse(data.toString());
    if (resolve) {
      const r = resolve;
      resolve = undefined;
      r(value);
    } else queue.push(value);
  });
  await new Promise<void>((r, j) => {
    ws.once("open", r);
    ws.once("error", j);
  });
  return {
    ws,
    send: (v: unknown) => ws.send(JSON.stringify(v)),
    next: () =>
      new Promise<unknown[]>((r, j) => {
        if (queue.length) {
          r(queue.shift()!);
          return;
        }
        const timeout = setTimeout(() => {
          resolve = undefined;
          j(new Error("test reply timeout"));
        }, 2000);
        resolve = (v) => {
          clearTimeout(timeout);
          r(v);
        };
      }),
  };
}
test("actual WebSocket replay matches pure decisions; live vs retained delivery differs correctly", async () => {
  const relay = createRelay({ port: 0 });
  const port = await relay.listen();
  const c = await client(port);
  try {
    c.send(["REQ", "live", { limit: 0 }]);
    assert.deepEqual(await c.next(), ["EOSE", "live"]);
    const cases = makeFixtures(),
      expected = replay(cases, presets.quiet);
    let liveEvents = 0;
    for (let i = 0; i < cases.length; i++) {
      c.send(["EVENT", cases[i].event]);
      assert.deepEqual(await c.next(), expected.decisions[i].ok);
      if (
        expected.decisions[i].verdict === "admit" &&
        expected.decisions[i].effect !== "superseded"
      ) {
        const msg = await c.next();
        assert.equal(msg[0], "EVENT");
        assert.equal(msg[1], "live");
        liveEvents++;
      }
    }
    assert.equal(liveEvents, 11);
    c.send(["REQ", "snapshot", {}]);
    const retained: string[] = [];
    for (;;) {
      const msg = await c.next();
      if (msg[0] === "EOSE") break;
      assert.equal(msg[1], "snapshot");
      retained.push((msg[2] as { id: string }).id);
    }
    assert.deepEqual(new Set(retained), new Set(expected.state.events.keys()));
    assert.equal(retained.length, 7);
  } finally {
    c.ws.terminate();
    await relay.close();
  }
});
test("subscriptions are per connection; replacement REQ, CLOSE, malformed input and unsupported filters", async () => {
  const relay = createRelay({
    port: 0,
    policy: parsePolicy({ ...presets.open, burstLimit: 100 }),
  });
  const port = await relay.listen();
  const a = await client(port),
    b = await client(port);
  try {
    a.send(["REQ", "same", { kinds: [1] }]);
    assert.deepEqual(await a.next(), ["EOSE", "same"]);
    b.send(["REQ", "same", { kinds: [7] }]);
    assert.deepEqual(await b.next(), ["EOSE", "same"]);
    const note = signFixture(
      { kind: 1, content: "note", created_at: NOW, tags: [] },
      "socket",
    );
    b.send(["EVENT", note]);
    assert.equal((await b.next())[0], "OK");
    assert.equal((await a.next())[0], "EVENT");
    b.send(["REQ", "same", { kinds: [1], limit: 0 }]);
    assert.deepEqual(await b.next(), ["EOSE", "same"]);
    a.send(["CLOSE", "same"]);
    const note2 = signFixture(
      { kind: 1, content: "note2", created_at: NOW, tags: [] },
      "socket",
    );
    a.send(["EVENT", note2]);
    assert.equal((await a.next())[0], "OK");
    assert.equal((await b.next())[0], "EVENT");
    a.send(["REQ", "bad", { search: "unsupported" }]);
    assert.equal((await a.next())[0], "CLOSED");
    a.ws.send("{");
    assert.equal((await a.next())[0], "NOTICE");
    a.send(["REQ", ""]);
    assert.equal((await a.next())[0], "NOTICE");
  } finally {
    a.ws.terminate();
    b.ws.terminate();
    await relay.close();
  }
});
test("loopback service rejects foreign browser origins, oversized frames, bad reset payloads and path-based relays", async () => {
  const relay = createRelay({ port: 0 });
  const port = await relay.listen();
  try {
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${port}/health`, {
          headers: { Origin: "https://foreign.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${port}/lab/reset`, {
          method: "POST",
          body: JSON.stringify({ clock: NOW, policy: {} }),
        })
      ).status,
      400,
    );
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/foreign`);
      ws.once("error", () => resolve());
      ws.once("open", () => {
        ws.terminate();
        reject(new Error("path accepted"));
      });
    });
    const c = await client(port);
    const closed = new Promise<number>((resolve) =>
      c.ws.once("close", resolve),
    );
    c.ws.send("x".repeat(70000));
    assert.equal(await closed, 1009);
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
  } finally {
    await relay.close();
  }
});
