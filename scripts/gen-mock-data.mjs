// Generates src/mocks/mock-data.json: deterministic sample data that follows
// the contract in src/bindings/. Used by the frontend until the backend is ready
// (and by the mockups). Run: npm run mock:gen
import { writeFileSync, mkdirSync } from "node:fs";

let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const int = (a, b) => Math.floor(a + rand() * (b - a + 1));

// Illustrative prices for mock data only (USD/MTok: input, output, cache read, cache write).
// Real pricing lives in src-tauri/src/pricing.rs.
const PRICES = {
  "gpt-6.1-sol": [2, 10, 0.1, 2.5],
  "gpt-5.6-sol": [4, 20, 0.4, 5],
  "gpt-5.6-terra": [2, 12, 0.2, 2.5],
  "gpt-6-luna": [0.1, 0.5, 0.01, 0.125],
  "gpt-5.6-luna": [0.2, 1.2, 0.02, 0.25],
  "gpt-5.5": [5, 30, 0.5, 0],
  "gpt-5.4-mini": [0.75, 4.5, 0.075, 0],
  "claude-opus-5-5": [4, 20, 0.2, 5],
  "claude-opus-5": [5, 25, 0.5, 6.25],
  "claude-sonnet-5-5": [2, 10, 0.2, 2.5],
  "claude-sonnet-4-6": [3, 15, 0.3, 3.75],
  "claude-haiku-4-5-20251001": [1, 5, 0.1, 1.25],
};
const costBreakdown = (m, u) => {
  const p = PRICES[m];
  if (!p) return { ...zeroCost };
  return {
    input: u.inputTokens * p[0] / 1e6,
    output: u.outputTokens * p[1] / 1e6,
    cacheRead: u.cacheReadTokens * p[2] / 1e6,
    cacheWrite: u.cacheCreationTokens * p[3] / 1e6,
  };
};
const zeroCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const addCost = (a, b) => ({ input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite });
const roundCost = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, round(v)]));
const totalCost = (b) => b.input + b.output + b.cacheRead + b.cacheWrite;
const addUsage = (a, b) => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
  ...(a.reasoningTokens != null || b.reasoningTokens != null
    ? { reasoningTokens: (a.reasoningTokens ?? 0) + (b.reasoningTokens ?? 0) }
    : {}),
});
const zero = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
const round = (x) => Math.round(x * 10000) / 10000;

const PROJECTS = [
  "C:\\Users\\dev\\Desktop\\dev\\dashboard-v1",
  "C:\\Users\\dev\\Desktop\\dev\\sandbox\\acme-shop",
  "C:\\Users\\dev\\Desktop\\dev\\inventory-service",
  "C:\\Users\\dev\\Desktop\\dev\\sandbox\\todo-api",
  "C:\\Users\\dev\\Desktop\\dev\\dotfiles",
];
const MODELS = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
const TOOLS = ["Read", "Bash", "Edit", "Grep", "Write", "Glob", "Agent", "WebSearch", "TodoWrite"];
const TOOL_W = [30, 25, 18, 12, 6, 5, 2, 1, 1];
const pickTool = () => {
  let r = rand() * TOOL_W.reduce((a, b) => a + b);
  for (let i = 0; i < TOOLS.length; i++) if ((r -= TOOL_W[i]) < 0) return TOOLS[i];
  return TOOLS[0];
};
const TITLES = [
  "Add JWT refresh token rotation", "Fix flaky checkout integration test", "Scaffold Tauri dashboard",
  "Refactor order service to hexagonal", "Investigate N+1 queries in product listing",
  "Configure hooks and permissions", "Write README and architecture docs", "Migrate CSS to Tailwind v4",
  "Debug WebSocket reconnect loop", "Add pagination to tasks API", "Set up CI with GitHub Actions",
  "Review PR #42 security issues",
];
const PROMPTS = [
  "Necesito que agregues rotación de refresh tokens al auth-api",
  "El test de checkout falla a veces en CI, investigá por qué",
  "Armá el scaffold del dashboard con Tauri y React",
  "Refactorizá el servicio de órdenes siguiendo arquitectura hexagonal",
];

const NOW = Date.parse("2026-10-05T18:00:00Z");
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const ymd = (ms) => iso(ms).slice(0, 10);
const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const r = int(0, 15);
  return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
});

function toolInput(name) {
  switch (name) {
    case "Read": return { file_path: pick(["src/App.tsx", "src-tauri/src/lib.rs", "package.json", "README.md"]) };
    case "Bash": return { command: pick(["npm test", "cargo build", "git status", "ls -la"]), description: "Run command" };
    case "Edit": return { file_path: "src/routes/orders.ts", old_string: "const x = 1", new_string: "const x = 2" };
    case "Grep": return { pattern: pick(["TODO", "useQuery", "fn main"]), output_mode: "files_with_matches" };
    case "Write": return { file_path: "src/new-file.ts", content: "export {}\n" };
    case "Glob": return { pattern: "**/*.ts" };
    case "Agent": return { subagent_type: "Explore", description: "Find auth code", prompt: "Search for auth handlers" };
    case "WebSearch": return { query: "tauri v2 capabilities", mode: "standard" };
    default: return { todos: [] };
  }
}

function genMessages(start, model, nTurns) {
  const messages = [];
  let t = start;
  let usage = zero, tools = 0, errors = 0, costBreakdown = zeroCost;
  for (let i = 0; i < nTurns; i++) {
    messages.push({
      id: uuid(), role: "user", timestamp: iso(t), model: null, usage: null,
      blocks: [{ type: "text", text: i === 0 ? pick(PROMPTS) : pick(["ok, seguí", "si", "Probá de nuevo", "Perfecto, ahora agregá tests"]) }],
    });
    t += int(2, 20) * 1000;
    const nCalls = int(0, 5);
    const blocks = [{ type: "thinking", text: "" }, { type: "text", text: "Voy a revisar los archivos relevantes primero." }];
    for (let c = 0; c < nCalls; c++) {
      const name = pickTool();
      const isError = rand() < 0.07;
      const durationMs = int(80, name === "Bash" ? 45000 : 2500);
      blocks.push({
        type: "toolCall", id: "toolu_" + uuid().replace(/-/g, "").slice(0, 24), name, input: toolInput(name),
        result: isError ? "Error: command failed with exit code 1" : "…output…", isError, durationMs,
      });
      tools++; if (isError) errors++;
      t += durationMs;
    }
    blocks.push({ type: "text", text: "Listo. Hice los cambios y verifiqué que compila." });
    const u = {
      inputTokens: int(3, 40), outputTokens: int(200, 4000),
      cacheReadTokens: int(20000, 180000), cacheCreationTokens: int(500, 15000),
    };
    usage = addUsage(usage, u);
    costBreakdown = addCost(costBreakdown, costBreakdownFor(model, u));
    messages.push({ id: "msg_" + uuid().replace(/-/g, "").slice(0, 24), role: "assistant", timestamp: iso(t), model, blocks, usage: u });
    t += int(20, 300) * 1000;
  }
  return { messages, end: t, usage, tools, errors, costBreakdown: roundCost(costBreakdown) };
}

function costBreakdownFor(model, usage) { return costBreakdown(model, usage); }

const sessions = [];
const details = {};
for (let i = 0; i < 28; i++) {
  const projectPath = pick(PROJECTS);
  const model = pick(MODELS);
  const start = NOW - int(0, 29) * DAY - int(0, 10 * 3600) * 1000;
  const g = genMessages(start, model, int(2, 9));
  const subagents = [];
  const nSub = rand() < 0.35 ? int(1, 3) : 0;
  let totalUsage = g.usage, totalCostBreakdown = g.costBreakdown;
  let totalTools = g.tools, totalErrors = g.errors, totalMessages = g.messages.length;
  const perModelUsage = new Map([[model, g.usage]]);
  for (let s = 0; s < nSub; s++) {
    const sg = genMessages(start + 60000, "claude-haiku-4-5-20251001", int(1, 3));
    const sc = sg.costBreakdown;
    subagents.push({
      id: "agent-" + uuid().slice(0, 17).replace(/-/g, ""), agentType: pick(["Explore", "Plan", "general-purpose"]),
      parentToolCallId: null, startedAt: iso(start + 60000), endedAt: iso(sg.end),
      messages: sg.messages, usage: sg.usage, costBreakdown: sc, costUsd: totalCost(sc),
    });
    totalUsage = addUsage(totalUsage, sg.usage);
    totalCostBreakdown = addCost(totalCostBreakdown, sc);
    totalTools += sg.tools; totalErrors += sg.errors; totalMessages += sg.messages.length;
    perModelUsage.set("claude-haiku-4-5-20251001", addUsage(perModelUsage.get("claude-haiku-4-5-20251001") ?? zero, sg.usage));
  }
  const id = uuid();
  totalCostBreakdown = roundCost(totalCostBreakdown);
  const orderedModels = [...perModelUsage].sort((a, b) => {
    const tokenCount = ([, u]) => u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreationTokens;
    return tokenCount(b) - tokenCount(a) || a[0].localeCompare(b[0]);
  }).map(([name]) => name);
  const summary = {
    id, provider: "claude", projectPath, projectName: projectPath.split("\\").pop(),
    title: rand() < 0.9 ? pick(TITLES) : null, firstPrompt: g.messages[0].blocks[0].text,
    startedAt: iso(start), endedAt: iso(g.end), durationMs: g.end - start,
    models: orderedModels,
    gitBranch: pick(["main", "feat/auth", "fix/checkout", null]), cliVersion: "2.1.285",
    messageCount: totalMessages, toolCallCount: totalTools, toolErrorCount: totalErrors, subagentCount: nSub,
    usage: totalUsage, costBreakdown: totalCostBreakdown, costUsd: totalCost(totalCostBreakdown),
  };
  sessions.push(summary);
  details[id] = { summary, messages: g.messages, subagents };
}

// Codex sessions exercise the v2 contract: GPT model families, `exec` wrappers with nested
// calls, reasoning, guardian/explorer sub-agents, discarded branches and unpriced models.
// Illustrative shapes, not real logs.
const CODEX_MODELS = ["gpt-5.6-sol", "gpt-6.1-sol", "gpt-5.6-terra", "gpt-6-luna", "gpt-5.6-sol",
  "gpt-5.6-luna", "gpt-5.5", "gpt-5.6-terra", "gpt-5.4-mini", "gpt-5.5-mini"];
const CODEX_TITLES = ["Corregir test de pagos intermitente", "Agregar endpoint de exportación CSV",
  "Revisar dependencias vulnerables", "Migrar scripts de build a ESM", "Documentar el flujo de deploy",
  "Optimizar consultas del listado de productos", "Agregar validación al formulario de alta"];
const CODEX_PROMPTS = ["Revisá por qué falla el test de pagos en CI", "Agregá un endpoint para exportar a CSV",
  "Fijate si hay dependencias con vulnerabilidades conocidas", "Pasá los scripts de build a ESM"];
const tokensOf = (u) => u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreationTokens;
const isPriced = (m) => !!PRICES[m];
const callId = () => "call_" + uuid().replace(/-/g, "").slice(0, 22);
function codexCall(name, parentCallId) {
  const input = name === "shell" ? { command: ["bash", "-lc", pick(["npm test", "rg TODO src", "git status --short", "cargo test"])] }
    : name === "apply_patch" ? { input: "*** Begin Patch\n*** Update File: src/api/export.ts\n@@\n-const rows = []\n+const rows = await load()\n*** End Patch" }
    : name === "update_plan" ? { plan: [{ step: "Reproducir el fallo", status: "completed" }, { step: "Corregir", status: "in_progress" }] }
    : name === "web_search" ? { query: "vitest fake timers flaky" }
    : { code: "const r = await tools.shell({ command: \"npm test\" });\nconsole.log(r.exit_code);" };
  const isError = name !== "exec" && rand() < 0.08;
  return { type: "toolCall", id: callId(), name, input, result: isError ? "exit code 1: 2 tests failed" : "…output…",
    isError, durationMs: int(60, name === "shell" || name === "exec" ? 30000 : 1500), ...(parentCallId ? { parentCallId } : {}) };
}
function codexAssistant(t, model, { branch } = {}) {
  const blocks = [{ type: "thinking", text: rand() < 0.7 ? pick(["**Revisando el test**\n\nPrimero reproduzco el fallo localmente.",
    "**Planificando el cambio**\n\nEl endpoint necesita paginar la consulta.", "**Verificando**\n\nCorro la suite completa antes de cerrar."]) : "" }];
  let calls = 0, errors = 0;
  const nCalls = branch ? int(0, 1) : int(0, 3);
  for (let c = 0; c < nCalls; c++) {
    if (rand() < 0.4) {
      const wrapper = codexCall("exec");
      blocks.push(wrapper); calls++;
      for (let k = int(1, 3); k > 0; k--) {
        const inner = codexCall(pick(["shell", "shell", "apply_patch"]), wrapper.id);
        blocks.push(inner); calls++; errors += Number(inner.isError);
      }
    } else {
      const call = codexCall(pick(["shell", "shell", "apply_patch", "update_plan", "web_search"]));
      blocks.push(call); calls++; errors += Number(call.isError);
    }
  }
  blocks.push({ type: "text", text: branch ? "Probé otra variante del cambio, pero la descarté." : "Listo: apliqué el cambio y la suite pasa." });
  const outputTokens = int(400, 6000);
  const usage = { inputTokens: int(2000, 30000), outputTokens, cacheReadTokens: int(20000, 220000),
    cacheCreationTokens: 0, reasoningTokens: Math.round(outputTokens * (0.2 + rand() * 0.4)) };
  return { message: { id: "msg_" + uuid().replace(/-/g, "").slice(0, 24), role: "assistant", timestamp: iso(t), model, usage, blocks,
    ...(branch ? { branch } : {}) }, calls, errors };
}
function codexSubagent(kind, start, parentToolCallId) {
  const model = kind === "guardian" ? "codex-auto-review" : "gpt-6-luna";
  const messages = [], t0 = start + int(5, 60) * 1000;
  let calls = 0, errors = 0;
  messages.push({ id: uuid(), role: "user", timestamp: iso(t0), model: null, usage: null,
    blocks: [{ type: "text", text: kind === "guardian" ? "Revisá si el comando es seguro de ejecutar." : "Buscá dónde se arma la consulta del listado." }] });
  const a = codexAssistant(t0 + int(3, 30) * 1000, model);
  if (kind === "guardian") a.message.blocks = [a.message.blocks[0], { type: "text", text: pick(["Aprobado: el comando solo lee archivos.", "Aprobado con advertencia: modifica el lockfile."]) }];
  else { calls += a.calls; errors += a.errors; }
  messages.push(a.message);
  const usage = addUsage(zero, a.message.usage), cost = roundCost(costBreakdown(model, a.message.usage));
  const end = Date.parse(a.message.timestamp) + 2000;
  return { calls, errors, agent: {
    id: kind + "-" + uuid().slice(0, 13), agentType: kind, parentToolCallId, startedAt: iso(t0), endedAt: iso(end),
    messages, usage, costBreakdown: cost, costUsd: totalCost(cost),
    ...(isPriced(model) ? {} : { unpricedTokens: tokensOf(usage) }) } };
}
// Spread over the range and cycle through the models so every family shows up.
for (let i = 0; i < 12; i++) {
  const projectPath = pick(PROJECTS.slice(0, 4)), model = CODEX_MODELS[i % CODEX_MODELS.length];
  const start = NOW - (i * 2 + int(0, 1)) * DAY - int(0, 9 * 3600) * 1000;
  const messages = [], subagents = [];
  let t = start, usage = zero, cost = zeroCost, unpriced = 0, calls = 0, errors = 0;
  const add = (m) => {
    messages.push(m);
    if (!m.usage) return;
    usage = addUsage(usage, m.usage); cost = addCost(cost, costBreakdown(m.model, m.usage));
    if (!isPriced(m.model)) unpriced += tokensOf(m.usage);
  };
  const nTurns = int(2, 6), branchAt = rand() < 0.45 ? int(1, nTurns - 1) : -1;
  for (let turn = 0; turn < nTurns; turn++) {
    if (turn === branchAt) {
      const branch = "rollback-" + uuid().slice(0, 8);
      add({ id: uuid(), role: "user", timestamp: iso(t), model: null, usage: null, branch, blocks: [{ type: "text", text: "Probá con otro enfoque" }] });
      t += int(5, 30) * 1000;
      const b = codexAssistant(t, model, { branch }); add(b.message); calls += b.calls; errors += b.errors;
      t += int(30, 200) * 1000;
    }
    add({ id: uuid(), role: "user", timestamp: iso(t), model: null, usage: null,
      blocks: [{ type: "text", text: turn === 0 ? pick(CODEX_PROMPTS) : pick(["seguí", "Ahora agregá tests", "Revisá el error de nuevo"]) }] });
    t += int(3, 20) * 1000;
    const a = codexAssistant(t, model); add(a.message); calls += a.calls; errors += a.errors;
    for (const call of a.message.blocks.filter((b) => b.name === "shell" || b.name === "exec"))
      if (rand() < 0.5) subagents.push(codexSubagent("guardian", t, call.id));
    if (rand() < 0.2) subagents.push(codexSubagent("explorer", t, null));
    t += int(20, 400) * 1000;
  }
  for (const { agent, calls: c, errors: e } of subagents) {
    usage = addUsage(usage, agent.usage); cost = addCost(cost, agent.costBreakdown);
    unpriced += agent.unpricedTokens ?? 0; calls += c; errors += e;
  }
  cost = roundCost(cost);
  const end = Math.max(t, ...subagents.map((s) => Date.parse(s.agent.endedAt)));
  const perModel = new Map();
  for (const m of [...messages, ...subagents.flatMap((s) => s.agent.messages)]) if (m.usage)
    perModel.set(m.model, (perModel.get(m.model) ?? 0) + tokensOf(m.usage));
  const id = uuid();
  const summary = {
    id, provider: "codex", projectPath, projectName: projectPath.split("\\").pop(),
    title: rand() < 0.85 ? pick(CODEX_TITLES) : null,
    firstPrompt: messages.find((m) => m.role === "user" && !m.branch).blocks[0].text,
    startedAt: iso(start), endedAt: iso(end), durationMs: end - start,
    models: [...perModel].sort((a, b) => b[1] - a[1]).map(([m]) => m),
    gitBranch: pick(["main", "feat/export", "fix/payments", null]), cliVersion: pick(["0.149.0", "0.152.1"]),
    messageCount: messages.length + subagents.reduce((n, s) => n + s.agent.messages.length, 0),
    toolCallCount: calls, toolErrorCount: errors, subagentCount: subagents.length,
    usage, costBreakdown: cost, costUsd: totalCost(cost), ...(unpriced ? { unpricedTokens: unpriced } : {}),
  };
  sessions.push(summary);
  details[id] = { summary, messages, subagents: subagents.map((s) => s.agent) };
}
sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

// Contract v2.5: projects grouped by git, both Codex homes. Assigned without consuming the
// random sequence, so the rest of the sample stays as it was.
const WORKTREE = "C:\\Users\\dev\\orca\\workspaces\\dashboard-v1\\frontend";
const PROJECT_KEYS = {
  [PROJECTS[0]]: ["git:github.com/luchoc-dev/dashboard-v1", "dashboard-v1"],
  [WORKTREE]: ["git:github.com/luchoc-dev/dashboard-v1", "dashboard-v1"],
  [PROJECTS[1]]: ["git:github.com/example/acme-shop", "acme-shop"],
  [PROJECTS[2]]: ["git:github.com/example/inventory-service", "inventory-service"],
};
const CLAUDE_HOME = "C:\\Users\\dev\\.claude\\projects",
  CODEX_HOME = "C:\\Users\\dev\\.codex\\sessions",
  ORCA_CODEX_HOME = "C:\\Users\\dev\\AppData\\Roaming\\orca\\codex-runtime-home\\home\\sessions";
let mainRepo = 0, codexIndex = 0;
for (const s of sessions) {
  // Every third session of the dashboard ran in its worktree: same repository, other cwd.
  if (s.projectPath === PROJECTS[0] && mainRepo++ % 3 === 2) s.projectPath = WORKTREE;
  const [key, name] = PROJECT_KEYS[s.projectPath] ?? ["path:" + s.projectPath.toLowerCase(), s.projectPath.split("\\").pop()];
  s.projectKey = key;
  s.projectName = name;
  s.sourceDir = s.provider === "claude" ? CLAUDE_HOME : codexIndex++ % 4 === 3 ? ORCA_CODEX_HOME : CODEX_HOME;
}

// Metrics over the last 30 days.
const from = ymd(NOW - 29 * DAY), to = ymd(NOW);
const byDay = [];
for (let d = 29; d >= 0; d--) byDay.push({ date: ymd(NOW - d * DAY), sessions: 0, toolCalls: 0, usage: { ...zero }, costBreakdown: { ...zeroCost }, costUsd: 0, unpricedTokens: 0 });
const group = (entriesOf) => {
  const m = new Map();
  for (const s of sessions) for (const entry of entriesOf(s)) {
    const g = m.get(entry.key) ?? { key: entry.key, label: entry.label, sessions: 0, usage: { ...zero }, costBreakdown: { ...zeroCost }, costUsd: 0, unpricedTokens: 0 };
    g.sessions++; g.usage = addUsage(g.usage, entry.usage); g.costBreakdown = addCost(g.costBreakdown, entry.costBreakdown); g.costUsd = totalCost(g.costBreakdown); g.unpricedTokens += entry.unpricedTokens ?? 0;
    m.set(entry.key, g);
  }
  return [...m.values()].sort((a, b) => b.costUsd - a.costUsd);
};
const totals = { sessions: 0, messages: 0, toolCalls: 0, toolErrors: 0, subagents: 0, usage: { ...zero }, costBreakdown: { ...zeroCost }, costUsd: 0, activeMs: 0, unpricedTokens: 0 };
for (const s of sessions) {
  const b = byDay.find((x) => x.date === s.startedAt.slice(0, 10));
  if (b) { b.sessions++; b.toolCalls += s.toolCallCount; b.usage = addUsage(b.usage, s.usage); b.costBreakdown = addCost(b.costBreakdown, s.costBreakdown); b.costUsd = totalCost(b.costBreakdown); b.unpricedTokens += s.unpricedTokens ?? 0; }
  totals.sessions++; totals.messages += s.messageCount; totals.toolCalls += s.toolCallCount;
  totals.toolErrors += s.toolErrorCount; totals.subagents += s.subagentCount;
  totals.usage = addUsage(totals.usage, s.usage); totals.costBreakdown = addCost(totals.costBreakdown, s.costBreakdown); totals.costUsd = totalCost(totals.costBreakdown); totals.activeMs += s.durationMs;
  totals.unpricedTokens += s.unpricedTokens ?? 0;
}
const perModel = (session) => {
  const data = new Map();
  const messages = [...details[session.id].messages, ...details[session.id].subagents.flatMap((s) => s.messages)];
  for (const m of messages) if (m.role === "assistant" && m.model && m.usage) {
    const x = data.get(m.model) ?? { usage: { ...zero }, costBreakdown: { ...zeroCost }, unpricedTokens: 0 };
    x.usage = addUsage(x.usage, m.usage); x.costBreakdown = addCost(x.costBreakdown, costBreakdown(m.model, m.usage)); data.set(m.model, x);
    if (!PRICES[m.model]) x.unpricedTokens += m.usage.inputTokens + m.usage.outputTokens + m.usage.cacheReadTokens + m.usage.cacheCreationTokens;
  }
  return [...data].map(([key, value]) => ({ key, label: key, sessions: 1, ...value, costUsd: totalCost(value.costBreakdown) }));
};
const metrics = {
  range: { from, to }, totals, byDay,
  byProvider: ["claude", "codex"].map((provider) => {
    const entries = sessions.filter((s) => s.provider === provider);
    const usage = entries.reduce((sum, s) => addUsage(sum, s.usage), { ...zero });
    const cost = entries.reduce((sum, s) => addCost(sum, s.costBreakdown), { ...zeroCost });
    return { key: provider, label: provider === "claude" ? "Claude" : "Codex",
      sessions: entries.length, usage, costBreakdown: cost, costUsd: totalCost(cost),
      unpricedTokens: entries.reduce((n, s) => n + (s.unpricedTokens ?? 0), 0) };
  }).sort((a, b) => b.costUsd - a.costUsd),
  byProject: group((s) => [{ key: s.projectKey, label: s.projectName, usage: s.usage, costBreakdown: s.costBreakdown, unpricedTokens: s.unpricedTokens ?? 0 }]),
  byModel: group(perModel),
};

const localDay = (timestamp) => {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const buildDailySeries = (kind) => {
  const groups = new Map();
  const add = (key, label, day, session, message) => {
    const group = groups.get(key) ?? { key, label, points: new Map() };
    const point = group.points.get(day) ?? {
      date: day, costUsd: 0, tokens: 0, activeMs: 0, sessions: new Set(), toolCalls: 0, messages: 0,
    };
    if (message) {
      point.sessions.add(session.id);
      point.messages++;
      point.toolCalls += message.blocks.filter((block) => block.type === "toolCall").length;
      if (message.usage) {
        point.costUsd += totalCost(costBreakdown(message.model ?? "unknown", message.usage));
        point.tokens += message.usage.inputTokens + message.usage.outputTokens + message.usage.cacheReadTokens + message.usage.cacheCreationTokens;
      }
    }
    group.points.set(day, point);
    groups.set(key, group);
    return point;
  };
  for (const session of sessions) {
    const detail = details[session.id];
    const messages = [...detail.messages, ...detail.subagents.flatMap((agent) => agent.messages)];
    let anyInRange = false;
    for (const message of messages) {
      const day = localDay(message.timestamp);
      if (day < from || day > to) continue;
      anyInRange = true;
      if (kind === "provider") add(session.provider, session.provider === "claude" ? "Claude" : "Codex", day, session, message);
      if (kind === "project") add(session.projectKey, session.projectName, day, session, message);
      const messageModel = message.model ?? (message.usage ? "unknown" : null);
      if (kind === "model" && messageModel) {
        const key = messageModel === "codex-auto-review" ? "auto-review" : messageModel;
        const label = messageModel === "codex-auto-review" ? "Revisiones automáticas" : messageModel;
        add(key, label, day, session, message);
      }
    }
    const start = localDay(session.startedAt);
    if (!anyInRange || start < from || start > to) continue;
    if (kind === "provider") add(session.provider, session.provider === "claude" ? "Claude" : "Codex", start, session).activeMs += session.durationMs;
    if (kind === "project") add(session.projectKey, session.projectName, start, session).activeMs += session.durationMs;
    if (kind === "model" && session.models[0] && session.models[0] !== "codex-auto-review")
      add(session.models[0], session.models[0], start, session).activeMs += session.durationMs;
  }
  return [...groups.values()].map((group) => ({
    key: group.key,
    label: group.label,
    points: [...group.points.values()].map((point) => ({ ...point, sessions: point.sessions.size })).sort((a, b) => a.date.localeCompare(b.date)),
  })).sort((a, b) => b.points.reduce((n, p) => n + p.costUsd, 0) - a.points.reduce((n, p) => n + p.costUsd, 0) || a.key.localeCompare(b.key));
};
metrics.seriesByProvider = buildDailySeries("provider");
metrics.seriesByModel = buildDailySeries("model");
metrics.seriesByProject = buildDailySeries("project");

// Tool stats from all detail messages.
const tools = new Map();
for (const d of Object.values(details)) {
  for (const m of [...d.messages, ...d.subagents.flatMap((s) => s.messages)]) for (const b of m.blocks) {
    if (b.type !== "toolCall") continue;
    const t = tools.get(b.name) ?? { name: b.name, calls: 0, errors: 0, durSum: 0, proj: new Map() };
    t.calls++; if (b.isError) t.errors++; t.durSum += b.durationMs;
    t.proj.set(d.summary.projectKey, [d.summary.projectName, (t.proj.get(d.summary.projectKey)?.[1] ?? 0) + 1]);
    tools.set(b.name, t);
  }
}
const toolStats = [...tools.values()].sort((a, b) => b.calls - a.calls).map((t) => ({
  name: t.name, calls: t.calls, errors: t.errors, errorRate: round(t.errors / t.calls),
  avgDurationMs: Math.round(t.durSum / t.calls),
  byProject: [...t.proj].sort((a, b) => b[1][1] - a[1][1]).map(([key, [label, count]]) => ({ key, label, count })),
}));

mkdirSync("src/mocks", { recursive: true });
const codexIn = (dir) => sessions.filter((s) => s.provider === "codex" && s.sourceDir === dir).length;
const scanErrors = {
  claude: [{ path: "C:\\Users\\dev\\.claude\\projects\\example\\partial.jsonl", message: "Skipped a partial JSONL line", provider: "claude" }],
  codex: [{ path: "C:\\Users\\dev\\.codex\\sessions\\2026\\10\\03\\rollout-2026-10-03T10-12-00-example.jsonl", message: "Skipped a partial JSONL line", provider: "codex" }],
};
const scanReport = { sourceDir: "C:\\Users\\dev\\.claude\\projects", scannedAt: iso(NOW), sessions: sessions.length,
  errors: [...scanErrors.claude, ...scanErrors.codex], scanning: false, duplicatesMerged: 2,
  sources: [
    { provider: "claude", sourceDir: "C:\\Users\\dev\\.claude\\projects", available: true, sessions: sessions.filter((s) => s.provider === "claude").length, errors: scanErrors.claude, scanning: false },
    { provider: "codex", sourceDir: CODEX_HOME, available: true, sessions: codexIn(CODEX_HOME), errors: scanErrors.codex, scanning: false },
    { provider: "codex", sourceDir: ORCA_CODEX_HOME, available: true, sessions: codexIn(ORCA_CODEX_HOME), errors: [], scanning: false },
  ] };
writeFileSync("src/mocks/mock-data.json", JSON.stringify({ sessions, details, metrics, toolStats, scanReport }, null, 2) + "\n");
console.log(`mock-data.json: ${sessions.length} sessions, ${toolStats.length} tools, $${totals.costUsd.toFixed(2)} total`);
