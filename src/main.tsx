import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Braces,
  Check,
  ChevronRight,
  Code2,
  Copy,
  FileCheck2,
  Fingerprint,
  FlaskConical,
  GitCompareArrows,
  Globe2,
  Info,
  Layers3,
  LockKeyhole,
  MapPin,
  Network,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  SlidersHorizontal,
  Sparkles,
  StepForward,
  Terminal,
  Wifi,
  X,
} from "lucide-react";
import {
  authorNames,
  FIXTURE_CLOCK,
  fixtureAuthor,
  identities,
  makeFixtures,
  type Case,
} from "./core/fixtures";
import {
  presets,
  parsePolicy,
  policyHash,
  type Policy,
  type Verdict,
} from "./core/policy";
import { digest, signFixture, type NostrEvent } from "./core/protocol";
import { evidence, parseCases, replay, verifyEvidence } from "./core/replay";
import { runLoopback, type WireFrame } from "./core/transport";
import "./style.css";

const short = (s: string, n = 8) =>
  s ? `${s.slice(0, n)}…${s.slice(-4)}` : "unavailable";
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const verdictLabel: Record<Verdict, string> = {
  admit: "Admit",
  quarantine: "Hold",
  reject: "Reject",
  duplicate: "Duplicate",
};
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([pretty(value) + "\n"], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function initial() {
  try {
    const saved = JSON.parse(localStorage.getItem("quiet-relay-v1") ?? "null");
    if (saved)
      return {
        cases: parseCases(saved.cases),
        policy: parsePolicy(saved.policy),
        dataset: String(saved.dataset ?? "Local rehearsal"),
      };
  } catch {
    /* Broken or old local state is safely replaced by public fixtures. */
  }
  return {
    cases: makeFixtures(),
    policy: parsePolicy(presets.quiet),
    dataset: "Public fixture rehearsal",
  };
}
const loaded = initial();
function App() {
  const [cases, setCases] = useState<Case[]>(loaded.cases),
    [policy, setPolicy] = useState<Policy>(loaded.policy),
    [dataset, setDataset] = useState(loaded.dataset);
  const [cursor, setCursor] = useState(cases.length),
    [playing, setPlaying] = useState(false),
    [selected, setSelected] = useState(1),
    [tab, setTab] = useState("traffic"),
    [filter, setFilter] = useState("all"),
    [inspectTab, setInspectTab] = useState("reason");
  const [modal, setModal] = useState<
      "compose" | "import" | "method" | "policy" | null
    >(null),
    [toast, setToast] = useState(""),
    [input, setInput] = useState(""),
    [error, setError] = useState("");
  const [composer, setComposer] = useState({
    author: "Nila",
    content: "The seed exchange is open. Everyone is welcome.",
    kind: 1,
    location: false,
    mention: false,
    tamper: false,
  });
  const [wire, setWire] = useState<WireFrame[]>([]),
    [liveBusy, setLiveBusy] = useState(false),
    [liveStatus, setLiveStatus] = useState("Not connected"),
    [liveParity, setLiveParity] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = useMemo(
    () => replay(cases.slice(0, cursor), policy),
    [cases, policy, cursor],
  );
  const comparisons = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(presets).map(([k, p]) => [k, replay(cases, p)]),
      ),
    [cases],
  );
  const current = run.decisions[selected],
    row = cases[selected];
  const packet = row?.event as NostrEvent | undefined;
  const stored = [...run.state.events.values()].sort(
    (a, b) => b.created_at - a.created_at,
  );
  useEffect(() => {
    try {
      localStorage.setItem(
        "quiet-relay-v1",
        JSON.stringify({ cases, policy, dataset }),
      );
    } catch {
      setToast("Browser storage is full. Export evidence before closing.");
    }
  }, [cases, policy, dataset]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setCursor((n) => {
          if (n >= cases.length) {
            setPlaying(false);
            return n;
          }
          return n + 1;
        }),
      140,
    );
    return () => clearInterval(timer);
  }, [playing, cases.length]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!modal) return;
    const fn = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [modal]);
  const changePolicy = (patch: Partial<Policy>) => {
    setPlaying(false);
    setPolicy((p) => parsePolicy({ ...p, ...patch }));
    setCursor(cases.length);
    setLiveParity(null);
  };
  const choosePreset = (key: string) => {
    setPolicy(parsePolicy(presets[key]));
    setCursor(cases.length);
    setPlaying(false);
    setLiveParity(null);
  };
  const openModal = (value: typeof modal) => {
    setError("");
    setInput(value === "policy" ? pretty(policy) : "");
    setModal(value);
  };
  const doExport = () => {
    download(
      "quiet-relay-evidence.json",
      evidence(cases.slice(0, cursor), policy),
    );
    setToast(
      "Replay evidence exported. Only wire events, policy and decisions; no signing keys.",
    );
  };
  function doImport() {
    try {
      if (new TextEncoder().encode(input).length > 2_000_000)
        throw new Error("Import limit is 2 MB.");
      const data = JSON.parse(input);
      if (data?.schema === "quiet-relay/evidence-v1") {
        const result = verifyEvidence(data);
        setPolicy(parsePolicy(data.policy));
        setCases(parseCases(data.cases));
        setCursor(data.cases.length);
        setToast(`Evidence verified by replay: ${result.events} events.`);
      } else {
        const rows = parseCases(data);
        setCases(rows);
        setCursor(rows.length);
        setToast("Imported wire records. Every signature is verified again.");
      }
      setDataset("Imported event rehearsal");
      setSelected(0);
      setModal(null);
      setPlaying(false);
      setWire([]);
      setLiveParity(null);
    } catch (error) {
      setError(String(error));
    }
  }
  function compose() {
    try {
      if (cases.length >= 500)
        throw new Error(
          "500-record run ceiling reached. Reset fixtures to start again.",
        );
      let tags: string[][] = [];
      if (composer.location) tags.push(["g", "9q8yyk8"]);
      if (composer.mention)
        tags.push(["p", fixtureAuthor("Moss"), "wss://relay.example.org"]);
      let event = signFixture(
        {
          content: composer.content,
          kind: composer.kind,
          tags,
          created_at: cases.at(-1)!.receivedAt + 1,
        },
        composer.author,
      );
      if (composer.tamper)
        event = {
          ...event,
          content: event.content + " [changed after signing]",
        };
      const next = {
        label: composer.tamper
          ? "Your tampering experiment"
          : "Your signed experiment",
        note: "Created in this browser with a disposable public fixture identity.",
        event,
        receivedAt: cases.at(-1)!.receivedAt + 1,
      };
      setCases((c) => [...c, next]);
      setSelected(cases.length);
      setCursor(cases.length + 1);
      setPlaying(false);
      setModal(null);
      setTab("traffic");
      setFilter("all");
      setLiveParity(null);
      setToast("A real Schnorr-signed event was added to the replay.");
    } catch (error) {
      setError(String(error));
    }
  }
  async function live() {
    setLiveBusy(true);
    setWire([]);
    setTab("wire");
    setLiveStatus("Connecting to loopback…");
    setLiveParity(null);
    const captured: WireFrame[] = [];
    try {
      const acknowledgements = await runLoopback(cases, policy, (frame) => {
        captured.push(frame);
        setWire([...captured]);
      });
      const expected = replay(cases, policy).decisions.map((d) => d.ok);
      const parity = digest(acknowledgements) === digest(expected);
      setLiveParity(parity);
      setLiveStatus(
        parity
          ? "Verified against sandbox"
          : "Replies differ — inspect transcript",
      );
      setToast(
        parity
          ? "Real WebSocket replies match every local policy decision."
          : "Live replies differ from the sandbox; inspect the wire log.",
      );
    } catch (error) {
      setLiveStatus("Relay unavailable");
      setToast(`${String(error)} Start npm run relay locally.`);
    } finally {
      setLiveBusy(false);
    }
  }
  const reset = () => {
    const seed = makeFixtures();
    setCases(seed);
    setPolicy(parsePolicy(presets.quiet));
    setDataset("Public fixture rehearsal");
    setCursor(seed.length);
    setSelected(1);
    setPlaying(false);
    setWire([]);
    setLiveParity(null);
    setLiveStatus("Not connected");
    setToast("Restored the 20 public fixtures and Quiet policy.");
  };
  return (
    <div className="shell">
      <aside className="rail">
        <a className="mark" href="#" aria-label="QuietRelay home">
          <span />
          <span />
          <span />
        </a>
        <div className="rail-item active" title="Policy workbench">
          <SlidersHorizontal size={21} />
        </div>
        <button
          className="rail-item"
          aria-label="Read the method"
          onClick={() => openModal("method")}
        >
          <FileCheck2 size={21} />
        </button>
        <div className="rail-bottom">
          <span>QR</span>
          <small>LOCAL</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="brand">
            QuietRelay<span>/</span>
            <small>policy workbench</small>
          </div>
          <div className="top-actions">
            <span className="local">
              <i /> No upstream connections
            </span>
            <button
              className="icon-button"
              title="Restore public fixtures"
              aria-label="Restore public fixtures"
              disabled={liveBusy}
              onClick={reset}
            >
              <RotateCcw size={17} />
            </button>
            <button className="subtle" onClick={() => openModal("method")}>
              <Info size={15} /> The method
            </button>
          </div>
        </header>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <Radio size={13} /> OPEN PROTOCOL. DELIBERATE BOUNDARIES.
            </div>
            <h1>
              Understand what
              <br />
              <em>gets through.</em>
            </h1>
            <p>
              A signature authenticates an event.
              <br />
              Your relay still has a decision to make.
            </p>
          </div>
          <div className="flow-card">
            <div className="flow-meta">
              <span>THE SAME TRAFFIC. YOUR RULES.</span>
              <span className="pill">NIP-01</span>
            </div>
            <div className="flow-diagram">
              <div className="flow-source">
                <Fingerprint />
                <strong>Signed events</strong>
                <small>{cases.length} inputs · reproducible</small>
              </div>
              <svg viewBox="0 0 220 100" aria-hidden="true">
                <path d="M0 50H60Q86 50 86 24T120 5H220M0 50H220M0 50H60Q86 50 86 76T120 95H220" />
                <circle cx="28" cy="50" r="4" />
                <circle cx="100" cy="9" r="4" />
                <circle cx="166" cy="50" r="4" />
                <circle cx="135" cy="95" r="4" />
              </svg>
              <div className="flow-outcomes">
                <span>
                  <i className="green" /> Admit <b>{run.counts.admit}</b>
                </span>
                <span>
                  <i className="amber" /> Hold <b>{run.counts.quarantine}</b>
                </span>
                <span>
                  <i className="red" /> Reject <b>{run.counts.reject}</b>
                </span>
              </div>
            </div>
            <div className="flow-foot">
              <LockKeyhole size={13} />
              <span>Quarantined events never enter the subscriber feed.</span>
            </div>
          </div>
        </section>
        <section className="workspace-top">
          <div>
            <span className="section-tag">01 / THE REHEARSAL</span>
            <h2>Your relay, under pressure.</h2>
          </div>
          <div className="work-actions">
            <button
              className="subtle"
              disabled={liveBusy}
              onClick={() => openModal("import")}
            >
              <ArrowUpFromLine size={15} /> Import evidence
            </button>
            <button
              className="button outline"
              onClick={() => openModal("compose")}
              disabled={liveBusy}
            >
              <Plus size={15} /> Sign an experiment
            </button>
            <button
              className="button dark"
              onClick={doExport}
              disabled={!cursor}
            >
              <ArrowDownToLine size={15} /> Export evidence
            </button>
          </div>
        </section>
        <div className="workspace">
          <aside className="policy-panel">
            <div className="panel-title">
              <SlidersHorizontal size={16} />
              <h3>Relay policy</h3>
              <span className="version">v1</span>
            </div>
            <p className="muted small">
              Change a boundary. Replay the consequences.
            </p>
            <div className="preset-selector">
              {Object.keys(presets).map((key) => (
                <button
                  key={key}
                  onClick={() => choosePreset(key)}
                  disabled={liveBusy}
                  className={
                    policyHash(policy) === policyHash(presets[key])
                      ? "selected"
                      : ""
                  }
                >
                  {presets[key].name}
                </button>
              ))}
            </div>
            <label className="slider-label" htmlFor="bytes">
              Content budget
              <strong>
                {policy.maxContentBytes.toLocaleString()}
                <small> bytes</small>
              </strong>
            </label>
            <input
              id="bytes"
              type="range"
              min="100"
              max="4000"
              step="100"
              value={Math.min(policy.maxContentBytes, 4000)}
              disabled={liveBusy}
              onChange={(e) =>
                changePolicy({ maxContentBytes: Number(e.target.value) })
              }
            />
            <div className="range-labels">
              <span>100 B</span>
              <span>4 KB</span>
            </div>
            <label className="slider-label" htmlFor="burst">
              Author burst limit
              <strong>
                {policy.burstLimit}
                <small> / {policy.burstWindowSeconds}s</small>
              </strong>
            </label>
            <input
              id="burst"
              type="range"
              min="1"
              max="20"
              value={policy.burstLimit}
              disabled={liveBusy}
              onChange={(e) =>
                changePolicy({ burstLimit: Number(e.target.value) })
              }
            />
            <div className="range-labels">
              <span>1 event</span>
              <span>20 events</span>
            </div>
            <div className="control-divider" />
            <div className="control-heading">HOLD FOR REVIEW</div>
            {[
              [
                "quarantineLocation",
                "Location metadata",
                "Coordinates can outlive the note.",
              ],
              [
                "quarantineRelayHints",
                "External relay hints",
                "A destination is information, too.",
              ],
              [
                "quarantineMentions",
                "Identity links",
                "Mentions expose a relationship.",
              ],
            ].map(([key, label, note]) => (
              <label key={key} className="toggle-row">
                <div>
                  <strong>{label}</strong>
                  <small>{note}</small>
                </div>
                <input
                  type="checkbox"
                  checked={policy[key as keyof Policy] as boolean}
                  disabled={liveBusy}
                  onChange={(e) => changePolicy({ [key]: e.target.checked })}
                />
                <span className="toggle" />
              </label>
            ))}
            <button
              className="advanced"
              onClick={() => openModal("policy")}
              disabled={liveBusy}
            >
              <Braces size={14} /> Edit complete policy <ArrowRight size={14} />
            </button>
            <div className="policy-receipt">
              <FileCheck2 size={17} />
              <div>
                <strong>Policy fingerprint</strong>
                <code>{short(policyHash(policy), 10)}</code>
              </div>
            </div>
            <div className="footnote">
              <span className="dot" /> Signature verification is always on.
            </div>
          </aside>
          <section className="traffic-panel">
            <div className="tabs">
              {[
                ["traffic", "Traffic", Layers3],
                ["compare", "Policy diff", GitCompareArrows],
                ["retained", "Retained", FileCheck2],
                ["wire", "Wire log", Terminal],
              ].map(([key, label, Icon]) => (
                <button
                  key={String(key)}
                  className={tab === key ? "active" : ""}
                  onClick={() => setTab(String(key))}
                >
                  <Icon size={14} />
                  {String(label)}
                  {key === "retained" && <span>{stored.length}</span>}
                </button>
              ))}
            </div>
            <div className="transport-bar">
              <div>
                <span className="micro-dot" />
                {dataset}
                <small>
                  {cursor} / {cases.length}
                </small>
              </div>
              <div>
                <button
                  className="icon-button"
                  aria-label="Step one event"
                  title="Step one event"
                  disabled={playing || liveBusy}
                  onClick={() => {
                    setCursor((n) => (n >= cases.length ? 1 : n + 1));
                    setSelected(cursor >= cases.length ? 0 : cursor);
                  }}
                >
                  <StepForward size={16} />
                </button>
                <button
                  className="replay-button"
                  disabled={liveBusy}
                  onClick={() => {
                    if (playing) {
                      setPlaying(false);
                    } else {
                      setCursor(0);
                      setPlaying(true);
                      setTab("traffic");
                    }
                  }}
                >
                  {playing ? <Pause size={13} /> : <Play size={13} />}{" "}
                  {playing ? "Pause" : "Replay"}
                </button>
              </div>
            </div>
            <div className="progress">
              <span style={{ width: `${(cursor / cases.length) * 100}%` }} />
            </div>
            {tab === "traffic" && (
              <>
                <div className="filters">
                  {[
                    ["all", "All", cases.length],
                    ["admit", "Admitted", run.counts.admit],
                    ["quarantine", "Held", run.counts.quarantine],
                    ["reject", "Rejected", run.counts.reject],
                  ].map(([key, label, n]) => (
                    <button
                      className={filter === key ? "active" : ""}
                      key={key}
                      onClick={() => setFilter(String(key))}
                    >
                      {label} <span>{n}</span>
                    </button>
                  ))}
                </div>
                <div className="event-list">
                  {cases.map((c, i) => {
                    const d = run.decisions[i],
                      e = c.event as NostrEvent;
                    if (filter !== "all" && d?.verdict !== filter) return null;
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          setSelected(i);
                          setInspectTab("reason");
                        }}
                        className={`event-row ${selected === i ? "selected" : ""} ${!d ? "pending" : ""}`}
                      >
                        <span className="event-index">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className={`avatar a${i % 5}`}>
                          {(authorNames[e.pubkey] ?? "?").slice(0, 1)}
                        </span>
                        <span className="event-text">
                          <strong>{c.label}</strong>
                          <small>
                            {authorNames[e.pubkey] ?? short(e.pubkey)}
                            <span>·</span>kind {e.kind}
                            <span>·</span>
                            {d
                              ? d.effect === "none"
                                ? "not retained"
                                : d.effect
                              : "waiting"}
                          </small>
                        </span>
                        <span className={`badge ${d?.verdict ?? "pending"}`}>
                          {d ? verdictLabel[d.verdict] : "Queued"}
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {tab === "compare" && (
              <div className="compare">
                <div className="inner-heading">
                  <GitCompareArrows size={21} />
                  <div>
                    <h3>Same messages. Different boundaries.</h3>
                    <p>
                      Independent replays of the complete dataset, from an empty
                      store.
                    </p>
                  </div>
                </div>
                <div className="compare-cards">
                  {Object.entries(comparisons).map(([key, value]) => (
                    <button key={key} onClick={() => choosePreset(key)}>
                      <span>{value.policy.name}</span>
                      <strong>
                        {value.counts.admit}
                        <small> admitted</small>
                      </strong>
                      <div>
                        {value.counts.quarantine} held · {value.counts.reject}{" "}
                        rejected
                      </div>
                    </button>
                  ))}
                </div>
                <table className="diff-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Open</th>
                      <th>Quiet</th>
                      <th>Strict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map((c, i) => (
                      <tr
                        key={i}
                        onClick={() => {
                          setSelected(i);
                          setTab("traffic");
                          setFilter("all");
                        }}
                      >
                        <td>{c.label}</td>
                        {Object.values(comparisons).map((r, j) => (
                          <td key={j}>
                            <span
                              className={`status-dot ${r.decisions[i].verdict}`}
                              title={verdictLabel[r.decisions[i].verdict]}
                            />
                            <span className="sr-only">
                              {verdictLabel[r.decisions[i].verdict]}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "retained" && (
              <div className="retained">
                <div className="inner-heading">
                  <FileCheck2 size={22} />
                  <div>
                    <h3>What a new subscriber can retrieve.</h3>
                    <p>
                      {stored.length} retained events. Ephemeral, withdrawn and
                      replaced copies are absent.
                    </p>
                  </div>
                </div>
                {stored.map((e) => (
                  <button
                    className="stored-card"
                    key={e.id}
                    onClick={() =>
                      setSelected(
                        cases.findIndex(
                          (c) => (c.event as NostrEvent).id === e.id,
                        ),
                      )
                    }
                  >
                    <div>
                      <span className="kind-chip">KIND {e.kind}</span>
                      <strong>
                        {authorNames[e.pubkey] ?? short(e.pubkey)}
                      </strong>
                      <code>{short(e.id)}</code>
                    </div>
                    <p>{e.content.slice(0, 180)}</p>
                  </button>
                ))}
                <div className="inline-note">
                  <Info size={15} /> The evidence file intentionally preserves
                  the rehearsal input, including withdrawn content. This is
                  local withdrawal, not secure erasure.
                </div>
              </div>
            )}
            {tab === "wire" && (
              <div className="wire">
                <div className="inner-heading">
                  <Wifi size={23} />
                  <div>
                    <h3>From prediction to the actual wire.</h3>
                    <p>
                      Optional local WebSocket relay. No external destinations
                      are contacted.
                    </p>
                  </div>
                </div>
                <div className="live-card">
                  <div>
                    <span
                      className={`status-dot ${liveParity ? "admit" : "duplicate"}`}
                    />
                    <strong>
                      {liveBusy ? "Running live exchange…" : liveStatus}
                    </strong>
                    <code>ws://127.0.0.1:7337</code>
                  </div>
                  <button
                    className="button dark"
                    onClick={live}
                    disabled={liveBusy || playing}
                  >
                    {liveBusy ? <Radio size={15} /> : <Play size={15} />} Test
                    live relay
                  </button>
                </div>
                <div className="inline-note">
                  <Code2 size={15} />
                  <span>
                    Start <code>npm run relay</code> in a separate terminal.
                    This resets the local rehearsal store and compares all OK
                    replies.
                  </span>
                </div>
                {wire.length > 0 && (
                  <div className="wire-list">
                    {wire.map((frame, i) => {
                      const m = frame.message as unknown[];
                      return (
                        <div key={i} className={frame.direction}>
                          <span>{frame.direction === "sent" ? "→" : "←"}</span>
                          <b>{String(m[0])}</b>
                          <code>
                            {JSON.stringify(m.slice(1)).slice(0, 145)}
                          </code>
                        </div>
                      );
                    })}
                  </div>
                )}
                {wire.length > 0 && (
                  <button
                    className="advanced"
                    onClick={() =>
                      download("quiet-relay-wire.json", {
                        scope: "Actual loopback WebSocket exchange",
                        policy,
                        frames: wire,
                      })
                    }
                  >
                    <ArrowDownToLine size={14} /> Download actual wire
                    transcript
                  </button>
                )}
              </div>
            )}
            <div className="traffic-footer">
              <span>
                <i className="status-dot duplicate" />
                {run.counts.duplicate} duplicate acknowledged
              </span>
              <span>
                {stored.length} retained <ArrowRight size={12} />
              </span>
            </div>
          </section>
          <aside className="inspector">
            <div className="panel-title">
              <Fingerprint size={17} />
              <h3>Event microscope</h3>
              <span className="version">
                {String(selected + 1).padStart(2, "0")}
              </span>
            </div>
            {row && (
              <>
                <div className="inspect-hero">
                  <span className={`badge ${current?.verdict ?? "pending"}`}>
                    {current
                      ? verdictLabel[current.verdict]
                      : "Not replayed yet"}
                  </span>
                  <h3>{row.label}</h3>
                  <p>{row.note}</p>
                </div>
                <div className="inspector-tabs">
                  <button
                    className={inspectTab === "reason" ? "active" : ""}
                    onClick={() => setInspectTab("reason")}
                  >
                    Why this decision
                  </button>
                  <button
                    className={inspectTab === "json" ? "active" : ""}
                    onClick={() => setInspectTab("json")}
                  >
                    Signed event
                  </button>
                </div>
                {inspectTab === "json" ? (
                  <div className="raw-event">
                    <div>
                      <span>Canonical wire fields</span>
                      <button
                        aria-label="Copy signed event"
                        className="icon-button"
                        onClick={() =>
                          navigator.clipboard
                            .writeText(pretty(packet))
                            .then(() => setToast("Signed wire event copied."))
                            .catch(() =>
                              setToast("Clipboard unavailable; use export."),
                            )
                        }
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    <pre>{pretty(packet)}</pre>
                  </div>
                ) : (
                  <div className="reason-scroll">
                    {current ? (
                      <>
                        <div className="decision-summary">
                          {current.summary}
                        </div>
                        {current.exposures.length > 0 && (
                          <div className="exposure-box">
                            <div className="exposure-title">
                              <Globe2 size={15} /> Visible beyond the signature
                            </div>
                            {current.exposures.map((e, i) => (
                              <div className="exposure" key={i}>
                                {e.type === "location" ? (
                                  <MapPin size={13} />
                                ) : e.type === "relay" ? (
                                  <Network size={13} />
                                ) : (
                                  <Fingerprint size={13} />
                                )}
                                <div>
                                  <strong>{e.label}</strong>
                                  <code>
                                    {e.value.length > 48
                                      ? short(e.value, 22)
                                      : e.value}
                                  </code>
                                  <small>{e.field}</small>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="check-list">
                          {current.checks.map((c, i) => (
                            <div className={`check ${c.result}`} key={i}>
                              <span>
                                {c.result === "pass" ? (
                                  <Check size={12} />
                                ) : c.result === "fail" ? (
                                  <X size={12} />
                                ) : (
                                  <Pause size={11} />
                                )}
                              </span>
                              <div>
                                <strong>{c.label}</strong>
                                <p>{c.detail}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="empty">
                        <Play size={24} />
                        <p>Replay or step forward to evaluate this event.</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="inspector-foot">
                  <span>
                    {authorNames[packet?.pubkey ?? ""]
                      ? "PUBLIC FIXTURE SIGNER"
                      : "IMPORTED PUBLIC KEY"}
                  </span>
                  <code>
                    {authorNames[packet?.pubkey ?? ""] ?? "Imported author"} /{" "}
                    {short(packet?.pubkey ?? "")}
                  </code>
                </div>
              </>
            )}
          </aside>
        </div>
        <section className="principles">
          <div>
            <ShieldCheck size={20} />
            <h3>Cryptography is mandatory.</h3>
            <p>
              Every event is hashed and verified again. A friendly label never
              bypasses a failed signature.
            </p>
          </div>
          <div>
            <FlaskConical size={20} />
            <h3>A decision you can reproduce.</h3>
            <p>
              Inputs, arrival times, exact policy and final state travel
              together in one replayable evidence file.
            </p>
          </div>
          <div>
            <LockKeyhole size={20} />
            <h3>Local means local.</h3>
            <p>
              No wallets. No upstream relay. Public demo identities only.
              Withdrawal never promises global erasure.
            </p>
          </div>
        </section>
        <footer>
          <div className="brand small-brand">
            QuietRelay <span>•</span>
            <small>See the boundary. Own the decision.</small>
          </div>
          <span>
            Original prototype · AI-assisted development ·{" "}
            <button onClick={() => openModal("method")}>Method & limits</button>
          </span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button aria-label="Dismiss message" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className={`modal ${modal === "method" ? "method-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "compose" && (
              <>
                <div className="eyebrow">
                  <Fingerprint size={14} /> DISPOSABLE PUBLIC IDENTITY
                </div>
                <h2 id="modal-title">Sign your own experiment.</h2>
                <p>
                  Real Schnorr signing, with a fixture key anyone can reproduce.
                  Never use these identities for an account.
                </p>
                <div className="form-row">
                  <label>
                    Fixture signer
                    <select
                      value={composer.author}
                      onChange={(e) =>
                        setComposer((c) => ({ ...c, author: e.target.value }))
                      }
                    >
                      {identities.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Event kind
                    <select
                      value={composer.kind}
                      onChange={(e) =>
                        setComposer((c) => ({
                          ...c,
                          kind: Number(e.target.value),
                        }))
                      }
                    >
                      <option value="1">1 · text note</option>
                      <option value="0">0 · metadata</option>
                      <option value="7">7 · reaction</option>
                      <option value="20001">20001 · ephemeral</option>
                    </select>
                  </label>
                </div>
                <label className="form-label">
                  Content
                  <textarea
                    value={composer.content}
                    maxLength={12000}
                    onChange={(e) =>
                      setComposer((c) => ({ ...c, content: e.target.value }))
                    }
                  />
                </label>
                <div className="compose-options">
                  {[
                    ["location", "Add a location tag"],
                    ["mention", "Add an identity + relay hint"],
                    ["tamper", "Change content after signing"],
                  ].map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={
                          composer[key as "location" | "mention" | "tamper"]
                        }
                        onChange={(e) =>
                          setComposer((c) => ({
                            ...c,
                            [key]: e.target.checked,
                          }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {error && <div className="error">{error}</div>}
                <div className="modal-actions">
                  <span>Keys never enter the export.</span>
                  <button className="button dark" onClick={compose}>
                    <Fingerprint size={16} /> Sign & evaluate
                  </button>
                </div>
              </>
            )}
            {modal === "import" && (
              <>
                <div className="eyebrow">
                  <FileCheck2 size={14} /> VERIFY, THEN REPLAY
                </div>
                <h2 id="modal-title">Bring the evidence back.</h2>
                <p>
                  Import a QuietRelay evidence file to check its digest and
                  recompute every decision. A raw array of labeled wire records
                  is also supported. Keep private content and keys out of your
                  rehearsal.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 2_000_000) {
                        setError("Import limit is 2 MB.");
                        return;
                      }
                      setInput(await file.text());
                    }
                  }}
                />
                <button
                  className="button outline"
                  onClick={() => fileRef.current?.click()}
                >
                  <ArrowUpFromLine size={15} /> Choose JSON file
                </button>
                <label className="form-label">
                  Or paste JSON
                  <textarea
                    className="code-input"
                    placeholder="{ … evidence … }"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                </label>
                {error && <div className="error">{error}</div>}
                <div className="modal-actions">
                  <span>Replaces this tab’s current rehearsal.</span>
                  <button className="button dark" onClick={doImport}>
                    Verify & import <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}
            {modal === "policy" && (
              <>
                <div className="eyebrow">
                  <Braces size={14} /> ALL BOUNDARIES, EXPLICIT
                </div>
                <h2 id="modal-title">The complete policy.</h2>
                <p>
                  Edit allowed kinds, tag/reference budgets, age windows or
                  exact blocked public keys. This policy is included in the
                  replay evidence.
                </p>
                <textarea
                  className="policy-json code-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                {error && <div className="error">{error}</div>}
                <div className="modal-actions">
                  <span>Signature verification cannot be disabled.</span>
                  <button
                    className="button dark"
                    onClick={() => {
                      try {
                        setPolicy(parsePolicy(JSON.parse(input)));
                        setCursor(cases.length);
                        setModal(null);
                        setLiveParity(null);
                      } catch (error) {
                        setError(String(error));
                      }
                    }}
                  >
                    Apply & replay <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}
            {modal === "method" && (
              <>
                <div className="eyebrow">
                  <FileCheck2 size={14} /> A SMALL, INSPECTABLE SYSTEM
                </div>
                <h2 id="modal-title">Confidence needs a boundary.</h2>
                <p className="method-lead">
                  QuietRelay makes relay decisions legible, then checks that a
                  real local relay makes the same ones.
                </p>
                <div className="method-grid">
                  <article>
                    <span>01</span>
                    <h3>Authenticate the event.</h3>
                    <p>
                      Canonical NIP-01 content hashing and BIP-340 Schnorr
                      verification use pinned noble cryptography packages.
                      Fixture signing is real; identities are deliberately
                      public and disposable.
                    </p>
                  </article>
                  <article>
                    <span>02</span>
                    <h3>Apply your contract.</h3>
                    <p>
                      Allowed kinds, UTF-8 budgets, arrival-based accepted-event
                      limits and public metadata checks produce explicit
                      reasons. Quarantine is a local policy choice, not a Nostr
                      protocol message.
                    </p>
                  </article>
                  <article>
                    <span>03</span>
                    <h3>Observe the relay.</h3>
                    <p>
                      The optional loopback server speaks EVENT, REQ and CLOSE,
                      with OK, EVENT, EOSE, CLOSED and NOTICE replies. Ephemeral
                      events stay live-only; replacements update the retained
                      view.
                    </p>
                  </article>
                  <article>
                    <span>04</span>
                    <h3>Replay the evidence.</h3>
                    <p>
                      The SHA-256 digest detects changed content; recomputation
                      checks the claimed decisions. It is not a third-party
                      attestation. Anyone can create a new valid evidence file.
                    </p>
                  </article>
                </div>
                <div className="method-limits">
                  <h3>What this prototype does not promise</h3>
                  <p>
                    No identity authenticity beyond a signing key; no encrypted
                    messaging, content moderation, anonymity guarantee or
                    production abuse defense. Public metadata checks are
                    explicit tag checks, not a complete privacy detector. The
                    local lab stores at most 500 inputs in memory. Its fixture
                    clock is fixed for reproducibility.
                  </p>
                  <p>
                    Deletion requests withdraw eligible local records. Original
                    inputs remain in the workbench and evidence. Other relays or
                    readers can keep copies. This is not secure deletion or a
                    complete NIP suite.
                  </p>
                  <p>
                    Original implementation developed with AI assistance. No
                    inference API runs in the app. BOSS Battle eligibility and
                    submission remain separate from this prototype.
                  </p>
                </div>
                <div className="modal-actions">
                  <span>NIP-01 · scoped NIP-09 · BIP-340</span>
                  <button
                    className="button dark"
                    onClick={() => setModal(null)}
                  >
                    Back to the workbench <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
