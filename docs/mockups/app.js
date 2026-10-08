/* Agent Dashboard — navigable mockup.
   Vanilla JS so it opens from file:// with no build. Structure mirrors the future
   React app: data layer (≈ src/api.ts) → screens → components. Read-only UI:
   the only "action" is Refrescar (rescan). */
"use strict";

const D = window.MOCK_DATA;
const TODAY = "2026-10-05"; // "now" of the sample data
const TZ = "America/Argentina/Buenos_Aires";

/* ======================================================================
   Icons (inline SVG, 24px grid, 1.6 stroke)
   ====================================================================== */
const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="2.4"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.3L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.3L20 15"/><path d="M20 20v-5h-5"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/>',
  x: '<circle cx="12" cy="12" r="8.5"/><path d="m14.8 9.2-5.6 5.6M9.2 9.2l5.6 5.6"/>',
  alert: '<path d="M10.3 4.2 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M16 3v4M8 3v4M3.5 10h17"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  branch: '<circle cx="6.5" cy="5.5" r="2"/><circle cx="6.5" cy="18.5" r="2"/><circle cx="17.5" cy="7.5" r="2"/><path d="M6.5 7.5v9M17.5 9.5c0 4.5-5 5-11 7"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  chip: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21"/>',
  agent: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4.5V8M9 13.5v1M15 13.5v1"/>',
  message: '<path d="M20 12a8 8 0 0 1-11.5 7.2L4 20.5l1.3-4.3A8 8 0 1 1 20 12z"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z"/>',
  monitor: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
  folderSearch: '<path d="M10.5 19.5h-5a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v2"/><circle cx="16.5" cy="15.5" r="3"/><path d="m21 20-2.3-2.3"/>',
  fileX: '<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10z"/><path d="M14 3.5v5h5M10 12.5l4 4M14 12.5l-4 4"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  thought: '<circle cx="6.5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="17.5" cy="12" r="1"/>',
};
const icon = (n, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

/* ======================================================================
   Formatting (es-AR: 1.234,5 — costs in US$, never "$" which reads as pesos)
   ====================================================================== */
const nf0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fTime = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fTimeS = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const fDay = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", day: "numeric", month: "short" });
const fDayW = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const fDayFull = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });

const clean = (s) => s.replace(/\./g, "");
const int = (n) => nf0.format(n);
const usd = (x) => (x > 0 && x < 0.005 ? "< US$ 0,01" : "US$ " + nf2.format(x));
const tok = (n) =>
  n >= 1e9 ? nf1.format(n / 1e9) + " B" : n >= 1e6 ? nf1.format(n / 1e6) + " M" : n >= 1e4 ? nf0.format(n / 1e3) + " k" : n >= 1e3 ? nf1.format(n / 1e3) + " k" : nf0.format(n);
const pct = (r) => (r > 0 && r < 0.1 ? nf1.format(r * 100) : nf0.format(r * 100)) + " %";
function dur(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return ms + " ms";
  if (ms < 60000) return nf1.format(ms / 1000) + " s";
  const m = Math.round(ms / 60000);
  if (m < 60) return m + " min";
  return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min";
}
const dayLabel = (ymd) => clean(fDay.format(new Date(ymd + "T12:00:00Z")));
const dayLabelW = (ymd) => clean(fDayW.format(new Date(ymd + "T12:00:00Z")));
const addDays = (ymd, n) => new Date(Date.parse(ymd + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
function when(iso) {
  const d = iso.slice(0, 10), t = fTime.format(new Date(iso));
  if (d === TODAY) return "hoy " + t;
  if (d === addDays(TODAY, -1)) return "ayer " + t;
  return dayLabel(d) + " " + t;
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const totalTok = (u) => u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreationTokens;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// claude-opus-5-5 → { family: "opus", version: [5, 5], name: "Opus 5.5" }
function parseModel(id) {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id);
  return m ? { family: m[1], version: [+m[2], +m[3]], name: cap(m[1]) + " " + m[2] + "." + m[3] } : { family: null, version: [0, 0], name: id };
}
const modelName = (id) => parseModel(id).name;
const shortId = (id) => id.slice(0, 8);

/* ======================================================================
   Models: hue = family, shade = version (newest = -1, each older version one
   step darker, 4th+ reuses -3). Shades come from every model in the data, not
   the filtered slice, so a filter never repaints a model.
   ====================================================================== */
const FAMILIES = ["opus", "sonnet", "haiku"];
const familyLabel = (f) => (f ? cap(f) : "Otros");
const familyRank = (f) => (FAMILIES.includes(f) ? FAMILIES.indexOf(f) : 99);
const ALL_MODELS = [...new Set(D.sessions.flatMap((s) => s.models))];
// Sort: family order, then newest version first.
const modelOrder = (a, b) => {
  const pa = parseModel(a), pb = parseModel(b);
  return familyRank(pa.family) - familyRank(pb.family) ||
    pb.version[0] - pa.version[0] || pb.version[1] - pa.version[1] || a.localeCompare(b);
};
const familyModels = (f) => ALL_MODELS.filter((m) => parseModel(m).family === f).sort(modelOrder);
const modelColor = (id) => {
  const { family } = parseModel(id);
  if (!FAMILIES.includes(family)) return "var(--color-family-other)";
  return `var(--color-${family}-${Math.min(3, familyModels(family).indexOf(id) + 1)})`;
};
const familyColor = (f) => (FAMILIES.includes(f) ? `var(--color-${f}-1)` : "var(--color-family-other)");
// Projects (and any other non-model category) use the categorical series palette,
// assigned by sorted path so a project keeps its color under every filter.
const PROJECTS = [...new Set(D.sessions.map((s) => s.projectPath))].sort();
const projName = (p) => p.split(/[\\/]/).pop();
const projColor = (p) => {
  const i = PROJECTS.indexOf(p);
  return i >= 0 && i < 5 ? `var(--color-series-${i + 1})` : "var(--color-series-other)";
};
const TOK_SHORT = { inputTokens: "Entrada", outputTokens: "Salida", cacheReadTokens: "Caché leída", cacheCreationTokens: "Caché escrita" };
// Stack/legend order: alternates hues so neighbors stay distinct (see tokens.css).
const TOK_KINDS = [
  ["cacheReadTokens", "Lectura de caché", "var(--color-tok-cache-read)"],
  ["outputTokens", "Salida", "var(--color-tok-output)"],
  ["cacheCreationTokens", "Escritura de caché", "var(--color-tok-cache-write)"],
  ["inputTokens", "Entrada", "var(--color-tok-input)"],
];

/* ======================================================================
   Data layer — same shapes as src/bindings; mirrors src/api.ts in mock mode.
   Metrics and tool stats are recomputed per range here (the backend does it
   in get_metrics / get_tool_stats).
   ====================================================================== */
const zero = () => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
const addU = (a, b) => { for (const k in a) a[k] += b[k]; return a; };
const dayOf = (s) => s.startedAt.slice(0, 10);
const FIRST_DAY = D.sessions.map(dayOf).sort()[0];

function matches(s, f) {
  const d = dayOf(s), q = f.search?.toLowerCase();
  return (!f.projectPath || s.projectPath === f.projectPath) && (!f.model || s.models.includes(f.model)) &&
    (!f.from || d >= f.from) && (!f.to || d <= f.to) &&
    (!q || [s.title, s.firstPrompt, s.projectName].some((v) => v?.toLowerCase().includes(q)));
}
const listSessions = (f = {}) => (S.mode === "vacio" ? [] : D.sessions.filter((s) => matches(s, f)));

// sc: extra SessionFilter fields (e.g. { projectPath }) to scope a whole screen.
function getMetrics(r, sc = {}) {
  const ss = listSessions({ from: r.from, to: r.to, ...sc });
  const from = r.from ?? FIRST_DAY, to = r.to ?? TODAY;
  const byDay = [];
  for (let d = from; d <= to; d = addDays(d, 1)) byDay.push({ date: d, sessions: 0, toolCalls: 0, usage: zero(), costUsd: 0 });
  const totals = { sessions: 0, messages: 0, toolCalls: 0, toolErrors: 0, subagents: 0, usage: zero(), costUsd: 0, activeMs: 0 };
  const proj = new Map(), mod = new Map();
  const bump = (m, key, label, s, share) => {
    const g = m.get(key) ?? { key, label, sessions: 0, usage: zero(), costUsd: 0 };
    g.sessions++; addU(g.usage, s.usage); g.costUsd += s.costUsd * share; m.set(key, g);
  };
  for (const s of ss) {
    const b = byDay.find((x) => x.date === dayOf(s));
    if (b) { b.sessions++; b.toolCalls += s.toolCallCount; addU(b.usage, s.usage); b.costUsd += s.costUsd; }
    totals.sessions++; totals.messages += s.messageCount; totals.toolCalls += s.toolCallCount; totals.toolErrors += s.toolErrorCount;
    totals.subagents += s.subagentCount; addU(totals.usage, s.usage); totals.costUsd += s.costUsd; totals.activeMs += s.durationMs;
    bump(proj, s.projectPath, s.projectName, s, 1);
    for (const m of s.models) bump(mod, m, m, s, 1 / s.models.length);
  }
  const desc = (a, b) => b.costUsd - a.costUsd;
  return { range: { from, to }, totals, byDay, byProject: [...proj.values()].sort(desc), byModel: [...mod.values()].sort(desc) };
}

function getToolStats(r, sc = {}) {
  const m = new Map();
  for (const s of listSessions({ from: r.from, to: r.to, ...sc })) {
    const d = D.details[s.id];
    for (const msg of [...d.messages, ...d.subagents.flatMap((x) => x.messages)]) for (const b of msg.blocks) {
      if (b.type !== "toolCall") continue;
      const t = m.get(b.name) ?? { name: b.name, calls: 0, errors: 0, dur: 0, durN: 0, proj: new Map() };
      t.calls++; if (b.isError) t.errors++;
      if (b.durationMs != null) { t.dur += b.durationMs; t.durN++; }
      t.proj.set(s.projectPath, (t.proj.get(s.projectPath) ?? 0) + 1);
      m.set(b.name, t);
    }
  }
  return [...m.values()].sort((a, b) => b.calls - a.calls).map((t) => ({
    name: t.name, calls: t.calls, errors: t.errors, errorRate: t.errors / t.calls,
    avgDurationMs: t.durN ? Math.round(t.dur / t.durN) : null,
    byProject: [...t.proj].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, label: projName(key), count })),
  }));
}

const getSession = (id) => D.details[id] ?? null;

// Per-project rollup of SessionSummary rows (what a Proyectos list needs). Client-side, no contract change.
function getProjects(r) {
  const m = new Map();
  for (const s of listSessions({ from: r.from, to: r.to })) {
    const p = m.get(s.projectPath) ?? { path: s.projectPath, name: s.projectName, sessions: [], usage: zero(), costUsd: 0, activeMs: 0,
      toolCalls: 0, toolErrors: 0, messages: 0, subagents: 0, branches: new Set(), models: new Map(), first: s.startedAt, last: s.startedAt };
    p.sessions.push(s); addU(p.usage, s.usage); p.costUsd += s.costUsd; p.activeMs += s.durationMs;
    p.toolCalls += s.toolCallCount; p.toolErrors += s.toolErrorCount; p.messages += s.messageCount; p.subagents += s.subagentCount;
    if (s.gitBranch) p.branches.add(s.gitBranch);
    for (const md of s.models) p.models.set(md, (p.models.get(md) ?? 0) + 1);
    if (s.startedAt < p.first) p.first = s.startedAt;
    if (s.startedAt > p.last) p.last = s.startedAt;
    m.set(s.projectPath, p);
  }
  return [...m.values()];
}

// Files touched by tool calls (Read/Edit/Write file_path), main session plus subagents.
function filesTouched(details) {
  const m = new Map();
  for (const d of details) for (const msg of [...d.messages, ...d.subagents.flatMap((x) => x.messages)]) for (const b of msg.blocks) {
    if (b.type !== "toolCall" || !["Read", "Edit", "Write"].includes(b.name) || !b.input?.file_path) continue;
    const f = m.get(b.input.file_path) ?? { path: b.input.file_path, Read: 0, Edit: 0, Write: 0, total: 0, errors: 0 };
    f[b.name]++; f.total++; if (b.isError) f.errors++;
    m.set(b.input.file_path, f);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

/* ======================================================================
   App state
   ====================================================================== */
// Provider theme: <html data-provider="claude|codex"> swaps the primary color (see tokens.css).
const PROVIDERS = { claude: "Claude Code", codex: "Codex" };
const S = {
  range: { preset: "30d", from: addDays(TODAY, -29), to: TODAY },
  rangePop: false,
  theme: document.documentElement.getAttribute("data-theme") ?? "system",
  provider: document.documentElement.getAttribute("data-provider") ?? "claude",
  scanning: false, scanDone: 0, scanTotal: 1204,
  lastScan: Date.now() - 4 * 60000,
  mode: null, // mockup state override: vacio | cargando | error | aviso
  sort: { sessions: { key: "start", dir: -1 }, tools: { key: "calls", dir: -1 } },
  open: new Set(), // expanded tool calls / subagents / tools rows
  bannerOpen: false,
};
const PRESETS = [["7d", "7 días", 7], ["30d", "30 días", 30], ["90d", "90 días", 90], ["todo", "Todo", null]];
function setPreset(p) {
  const n = PRESETS.find((x) => x[0] === p)[2];
  S.range = { preset: p, from: n ? addDays(TODAY, -(n - 1)) : FIRST_DAY, to: TODAY };
}
const rangeText = () => {
  const { from, to } = S.range;
  return from === to ? dayLabelW(from) : `${dayLabel(from)} – ${dayLabel(to)}`;
};

/* ======================================================================
   Router: #/resumen · #/sesiones?q=&proyecto=&modelo= · #/sesion/<id> · #/herramientas · #/estados
   Mockup-only query param: estado=vacio|cargando|error|aviso
   ====================================================================== */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  const parts = path.split("/").filter(Boolean);
  return { route: parts[0] || "resumen", arg: parts[1] ? decodeURIComponent(parts[1]) : null, q: new URLSearchParams(qs || "") };
}
const href = (route, params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  return "#/" + route + (q.toString() ? "?" + q : "");
};

/* ======================================================================
   Tooltips — one floating element; specs stored by id, rendered with textContent.
   spec: { head, value, rows: [{ color, label, value }], foot }
   ====================================================================== */
const TIPS = new Map();
let tipSeq = 0;
const tip = (spec) => { const id = "t" + ++tipSeq; TIPS.set(id, spec); return `data-tip="${id}"`; };
const tipEl = document.getElementById("tip");
function showTip(el, x, y) {
  const spec = TIPS.get(el.dataset.tip);
  if (!spec) return hideTip();
  tipEl.replaceChildren();
  const add = (cls, text) => { const d = document.createElement("div"); d.className = cls; d.textContent = text; tipEl.append(d); return d; };
  if (spec.head) add("t-head", spec.head);
  if (spec.value) add("t-val", spec.value);
  for (const r of spec.rows ?? []) {
    const row = add("t-row", "");
    if (r.color) { const k = document.createElement("span"); k.className = "t-key"; k.style.background = r.color; row.append(k); }
    row.append(document.createTextNode(r.label));
    const b = document.createElement("b"); b.textContent = r.value; row.append(b);
  }
  if (spec.foot) add("t-foot", spec.foot);
  tipEl.style.display = "block";
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  let left = x + 14, top = y + 14;
  if (left + w > innerWidth - 8) left = x - w - 14;
  if (top + h > innerHeight - 8) top = y - h - 14;
  tipEl.style.left = Math.max(8, left) + "px";
  tipEl.style.top = Math.max(8, top) + "px";
}
const hideTip = () => { tipEl.style.display = "none"; };
document.addEventListener("pointermove", (e) => {
  const el = e.target.closest?.("[data-tip]");
  el ? showTip(el, e.clientX, e.clientY) : hideTip();
});
document.addEventListener("focusin", (e) => {
  const el = e.target.closest?.("[data-tip]");
  if (!el) return hideTip();
  const r = el.getBoundingClientRect();
  showTip(el, r.left + r.width / 2, r.bottom);
});
document.addEventListener("scroll", hideTip, true);

/* ======================================================================
   Charts (SVG). Equivalent in Recharts: <BarChart> + <Bar radius={[3,3,0,0]}
   maxBarSize={22}> + <YAxis> + <ReferenceLine> + custom <Tooltip content>.
   ====================================================================== */
const CHARTS = new Map(); // element id -> draw(width) => svg string
function niceStep(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
/* Stacked columns (one series = plain columns). rows: [{ label, values: { [seriesKey]: n }, tip, go }].
   Segments are separated by a 2px surface gap; only the top one gets the rounded data end.
   Recharts: one <Bar stackId="a" fill={color}> per series, <YAxis tickFormatter>, <ReferenceLine y={avg}>,
   custom <Tooltip content>; gap via stroke="var(--color-surface)" strokeWidth={2} on each <Bar>. */
function stackChart({ rows, series, height = 220, fmtAxis, fmtCap, avg, every }) {
  return (W) => {
    const totals = rows.map((row) => series.reduce((a, se) => a + (row.values[se.key] || 0), 0));
    const maxV = Math.max(0, ...totals);
    const m = { l: 52, r: avg ? 66 : 12, t: fmtCap ? 18 : 10, b: 24 }, iw = Math.max(80, W - m.l - m.r), ih = height - m.t - m.b;
    const step = niceStep(maxV / 4), max = step * Math.max(1, Math.ceil(maxV / step - 1e-9));
    const nTicks = Math.round(max / step);
    const y = (v) => m.t + ih - (v / max) * ih;
    const band = iw / rows.length, bw = Math.min(fmtCap ? 40 : 22, Math.max(3, band * 0.66)), rad = Math.min(3, bw / 2);
    const lblEvery = every ?? Math.ceil(44 / band);
    let s = `<svg viewBox="0 0 ${W} ${height}" height="${height}" role="img" aria-label="Gráfico de columnas">`;
    s += '<g class="grid">';
    for (let i = 0; i <= nTicks; i++) {
      const v = step * i, yy = Math.round(y(v)) + 0.5;
      if (i) s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${yy}" y2="${yy}"/>`;
      s += `<text x="${m.l - 8}" y="${yy + 3.5}" text-anchor="end">${esc(fmtAxis(v))}</text>`;
    }
    const base = m.t + ih;
    s += `</g><line class="baseline" x1="${m.l}" x2="${m.l + iw}" y1="${base + 0.5}" y2="${base + 0.5}"/>`;
    rows.forEach((row, i) => {
      const x0 = m.l + i * band, cx = x0 + band / 2, bx = cx - bw / 2;
      s += `<g class="day" tabindex="0" ${row.tip ?? ""} ${row.go ? `data-go="${row.go}"` : ""}>`;
      s += `<rect class="hover-band" x="${x0}" y="${m.t}" width="${band}" height="${ih}"/>`;
      const segs = series.filter((se) => (row.values[se.key] || 0) > 0);
      let acc = 0;
      segs.forEach((se, j) => {
        const v = row.values[se.key], yb = y(acc), yt = y(acc + v), isTop = j === segs.length - 1;
        acc += v;
        const top = isTop ? yt : yt + 2, h = Math.max(isTop ? 1 : 0, yb - top);
        if (h <= 0.4) return;
        const st = `style="fill:${se.color}"`;
        s += isTop && h > rad
          ? `<path class="col" ${st} d="M${bx},${yb}V${top + rad}Q${bx},${top} ${bx + rad},${top}H${bx + bw - rad}Q${bx + bw},${top} ${bx + bw},${top + rad}V${yb}Z"/>`
          : `<rect class="col" ${st} x="${bx}" y="${yb - h}" width="${bw}" height="${h}"/>`;
      });
      if (fmtCap && totals[i] > 0) s += `<text class="cap" x="${cx}" y="${y(totals[i]) - 5}" text-anchor="middle">${esc(fmtCap(totals[i]))}</text>`;
      s += `<rect class="hit" x="${x0}" y="${m.t}" width="${band}" height="${ih + m.b}"/></g>`;
      if ((rows.length - 1 - i) % lblEvery === 0)
        s += `<text x="${cx}" y="${height - 6}" text-anchor="middle">${esc(row.label)}</text>`;
    });
    if (avg) {
      const ya = Math.round(y(avg.value)) + 0.5;
      s += `<line class="avg" x1="${m.l}" x2="${m.l + iw}" y1="${ya}" y2="${ya}"/>`;
      s += `<text x="${m.l + iw + 6}" y="${ya - 2}">${esc(avg.label)}</text><text x="${m.l + iw + 6}" y="${ya + 10}" style="fill:var(--color-ink-2)">${esc(avg.text)}</text>`;
    }
    return s + "</svg>";
  };
}
function mountCharts(root) {
  for (const el of root.querySelectorAll(".chart[id]")) {
    const draw = CHARTS.get(el.id);
    if (!draw) continue;
    const paint = () => { el.innerHTML = draw(el.clientWidth); };
    paint();
    new ResizeObserver(paint).observe(el);
  }
}

/* ======================================================================
   Shared components
   ====================================================================== */
const shareBar = (parts, cls = "") => {
  const tot = parts.reduce((a, p) => a + p.value, 0) || 1;
  return `<div class="share ${cls}">${parts.filter((p) => p.value > 0).map((p) =>
    `<span style="flex:${p.value / tot};background:${p.color}${p.gapBefore ? ";margin-left:3px" : ""}" ${p.tip ?? ""}></span>`).join("")}</div>`;
};
const tokenParts = (u) => TOK_KINDS.map(([k, label, color]) => ({
  value: u[k], color,
  tip: tip({ head: label, value: tok(u[k]) + " tokens", foot: pct(u[k] / (totalTok(u) || 1)) + " del total" }),
}));
// Primary model by name; extra models (usually subagents) as dots only. Full list on hover.
const modelsCell = (models, full = false) => {
  const ms = [...new Set(models)];  // backend order: most used first
  return `<span class="models" title="${esc(ms.map(modelName).join(" · "))}">${ms.map((m, i) =>
    `<span><i class="sw dot" style="background:${modelColor(m)}"></i>${i === 0 || full ? esc(modelName(m)) : ""}</span>`).join("")}</span>`;
};
const toolsCell = (calls, errors) => `${int(calls)}${errors ? ` <span class="st err" title="${errors} con error">${icon("x", "sm")}${errors}</span>` : ""}`;
function sessionTitle(s) {
  return s.title
    ? `<span class="trunc" title="${esc(s.firstPrompt)}">${esc(s.title)}</span>`
    : `<span class="trunc prompt" title="Sin título: se muestra el primer prompt">“${esc(s.firstPrompt ?? "Sin prompt")}”</span>`;
}

/* ======================================================================
   Shell: sidebar + topbar
   ====================================================================== */
function renderNav(route) {
  const ss = listSessions(S.range);
  const items = [
    ["resumen", "overview", "Resumen", null],
    ["sesiones", "list", "Sesiones", ss.length],
    ["proyectos", "folder", "Proyectos", new Set(ss.map((x) => x.projectPath)).size],
    ["herramientas", "tool", "Herramientas", null],
  ];
  const cur = route === "sesion" ? "sesiones" : route === "proyecto" ? "proyectos" : route;
  document.getElementById("nav").innerHTML =
    items.map(([r, ic, label, n]) => `<a href="${href(r)}" ${cur === r ? 'aria-current="page"' : ""} title="${label}">${icon(ic)}<span>${label}</span>${n != null ? `<span class="count">${int(n)}</span>` : ""}</a>`).join("") +
    `<div class="nav-sep"></div><div class="nav-label">Mockup</div>` +
    `<a href="#/estados" ${cur === "estados" ? 'aria-current="page"' : ""} title="Estados">${icon("layers")}<span>Estados</span></a>` +
    `<div class="provider-switch" title="Vista previa del color principal por proveedor (solo mockup)"><span class="nav-label">Proveedor</span>
      <div class="seg" role="group" aria-label="Proveedor">${Object.entries(PROVIDERS).map(([k, l]) =>
        `<button data-act="provider" data-v="${k}" aria-pressed="${S.provider === k}">${l.split(" ")[0]}</button>`).join("")}</div></div>`;
  document.getElementById("brand-sub").textContent = PROVIDERS[S.provider];
  const t = S.theme;
  document.getElementById("side-foot").innerHTML = `
    <div class="ro-note" title="La app solo lee los archivos de sesión. No crea, modifica ni borra nada.">
      ${icon("lock", "sm")}<div><b>Solo lectura</b>Lee <span class="mono">~/.claude/projects</span></div>
    </div>
    <div class="theme-switch" role="group" aria-label="Tema">
      <button data-act="theme" data-v="system" aria-pressed="${t === "system"}" title="Tema del sistema">${icon("monitor", "sm")}</button>
      <button data-act="theme" data-v="light" aria-pressed="${t === "light"}" title="Claro">${icon("sun", "sm")}</button>
      <button data-act="theme" data-v="dark" aria-pressed="${t === "dark"}" title="Oscuro">${icon("moon", "sm")}</button>
    </div>`;
}

function renderTopbar(route, crumbs) {
  const showRange = ["resumen", "sesiones", "proyectos", "proyecto", "herramientas"].includes(route) && !["vacio", "cargando"].includes(S.mode);
  const mins = Math.max(0, Math.round((Date.now() - S.lastScan) / 60000));
  const status = S.scanning || S.mode === "cargando"
    ? `<span class="scan-status">${icon("refresh", "sm spin")}<span>Escaneando… ${int(S.mode === "cargando" ? 412 : S.scanDone)} de ${int(S.scanTotal)}</span><span class="bar"><i style="width:${S.mode === "cargando" ? 34 : (S.scanDone / S.scanTotal) * 100}%"></i></span></span>`
    : `<span class="scan-status" title="Último escaneo de ~/.claude/projects">${icon("clock", "sm")}Escaneado ${mins < 1 ? "recién" : `hace ${mins} min`}</span>`;
  document.getElementById("topbar").innerHTML = `
    <div class="crumbs">${crumbs}</div>
    <div class="spacer"></div>
    ${showRange ? rangeControl() : ""}
    ${status}
    <button class="btn" data-act="refresh" ${S.scanning ? "disabled" : ""} title="Vuelve a leer ~/.claude/projects (no modifica nada)">
      ${icon("refresh", S.scanning ? "sm spin" : "sm")}Refrescar
    </button>`;
}

function rangeControl() {
  const p = S.range.preset;
  return `<div class="range">
    <span class="range-label">${esc(rangeText())}</span>
    <div class="seg" role="group" aria-label="Rango de fechas">
      ${PRESETS.map(([k, label]) => `<button data-act="range" data-v="${k}" aria-pressed="${p === k}">${label}</button>`).join("")}
      <button data-act="range-pop" aria-pressed="${p === "custom"}" title="Rango personalizado">${icon("calendar", "sm")}</button>
    </div>
    ${S.rangePop ? `<div class="popover" role="dialog" aria-label="Rango personalizado">
      <div class="row">
        <label>Desde<input class="field" type="date" id="r-from" value="${S.range.from}" min="${FIRST_DAY}" max="${TODAY}"></label>
        <label>Hasta<input class="field" type="date" id="r-to" value="${S.range.to}" min="${FIRST_DAY}" max="${TODAY}"></label>
      </div>
      <div class="row"><button class="btn ghost sm" data-act="range-pop">Cancelar</button><button class="btn sm" data-act="range-apply">Aplicar</button></div>
    </div>` : ""}
  </div>`;
}

/* ======================================================================
   Screen 1 — Resumen
   ====================================================================== */
/* Daily trend metrics. Everything is aggregated from SessionSummary on the client
   (startedAt day, costUsd, usage, durationMs, toolCallCount/ErrorCount, messageCount,
   models[0], projectPath): no contract change needed. */
const usdAxis = (v) => {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? "0" : "US$ " + (Number.isInteger(r) ? nf0 : Math.abs(Math.round(r * 10) - r * 10) < 1e-9 ? nf1 : nf2).format(r);
};
const hoursAxis = (h) => (h === 0 ? "0" : (Number.isInteger(Math.round(h * 100) / 100) ? nf0 : nf1).format(h) + " h");
const TREND_METRICS = [
  { key: "cost", label: "Costo", unit: "US$ estimados", val: (s) => s.costUsd, fmt: usd, axis: usdAxis },
  { key: "tokens", label: "Tokens", unit: "tokens", val: (s) => totalTok(s.usage), fmt: tok, axis: (v) => (v ? tok(v) : "0"),
    total: TOK_KINDS.map(([k, label, color]) => ({ key: k, label, color, val: (s) => s.usage[k] })) },
  { key: "active", label: "Tiempo activo", unit: "horas de sesión", val: (s) => s.durationMs / 3.6e6, fmt: (h) => dur(Math.round(h * 3.6e6)), axis: hoursAxis },
  { key: "sessions", label: "Sesiones", unit: "sesiones iniciadas", val: () => 1, fmt: int, axis: int },
  { key: "tools", label: "Herramientas", unit: "llamadas", val: (s) => s.toolCallCount, fmt: int, axis: int,
    total: [
      { key: "ok", label: "Sin error", color: "var(--color-primary)", val: (s) => s.toolCallCount - s.toolErrorCount },
      { key: "err", label: "Con error", color: "var(--color-error-mark)", val: (s) => s.toolErrorCount },
    ] },
  { key: "messages", label: "Mensajes", unit: "mensajes", val: (s) => s.messageCount, fmt: int, axis: int },
];
const TREND_GROUPS = [["total", "Total"], ["modelo", "Por modelo"], ["proyecto", "Por proyecto"]];
S.trend = { metric: "cost", group: "total" };   // Resumen
S.ptrend = { metric: "cost", group: "total" };  // Proyecto detail
S.strend = { metric: "tokens" };                // Sesión dashboard
const BRANCHES = [...new Set(D.sessions.map((s) => s.gitBranch ?? "(sin rama)"))].sort();
const branchColor = (b) => { const i = BRANCHES.indexOf(b); return i >= 0 && i < 5 ? `var(--color-series-${i + 1})` : "var(--color-series-other)"; };

function trendSeries(metric, group, ss) {
  if (group === "modelo") {
    // Each session counts once, under its main model (models[0] = most used).
    return [...new Set(ss.map((s) => s.models[0]))].sort(modelOrder)
      .map((m) => ({ key: m, label: modelName(m), color: modelColor(m), val: (s) => (s.models[0] === m ? metric.val(s) : 0) }));
  }
  if (group === "proyecto") {
    return PROJECTS.filter((p) => ss.some((s) => s.projectPath === p))
      .map((p) => ({ key: p, label: projName(p), color: projColor(p), val: (s) => (s.projectPath === p ? metric.val(s) : 0) }));
  }
  if (group === "rama") {
    const br = (s) => s.gitBranch ?? "(sin rama)";
    return BRANCHES.filter((b) => ss.some((s) => br(s) === b))
      .map((b) => ({ key: b, label: b, color: branchColor(b), val: (s) => (br(s) === b ? metric.val(s) : 0) }));
  }
  return metric.total ?? [{ key: "v", label: metric.label, color: "var(--color-primary)", val: metric.val }];
}

/* Daily trend. opts.key picks the state slot (S.trend / S.ptrend), opts.sc scopes the sessions,
   opts.groups the grouping options, opts.drill(date) the column click target. */
function trendPanel(M, opts = {}) {
  const key = opts.key ?? "trend", st = S[key], sc = opts.sc ?? {}, groups = opts.groups ?? TREND_GROUPS, chartId = key + "-chart";
  const drill = opts.drill ?? ((date) => href("sesiones", { desde: date, hasta: date }));
  if (!groups.some(([k]) => k === st.group)) st.group = "total";
  const metric = TREND_METRICS.find((x) => x.key === st.metric), group = st.group;
  const ss = listSessions({ ...S.range, ...sc });
  const series = trendSeries(metric, group, ss);
  const days = M.byDay.map((d) => d.date);
  const rows = days.map((date) => {
    const day = ss.filter((s) => dayOf(s) === date);
    const values = Object.fromEntries(series.map((se) => [se.key, day.reduce((a, s) => a + se.val(s), 0)]));
    const total = series.reduce((a, se) => a + values[se.key], 0);
    return {
      label: dayLabel(date), values, go: day.length ? drill(date) : null,
      tip: tip({
        head: dayLabelW(date), value: day.length ? metric.fmt(total) : "Sin sesiones",
        rows: day.length && series.length > 1 ? series.filter((se) => values[se.key] > 0).map((se) => ({ color: se.color, label: se.label, value: metric.fmt(values[se.key]) })) : [],
        foot: day.length ? `${int(day.length)} ${day.length === 1 ? "sesión" : "sesiones"} · hacé click para verlas` : null,
      }),
    };
  });
  const total = ss.reduce((a, s) => a + metric.val(s), 0);
  const avg = total / (days.length || 1);
  const busiest = rows.reduce((b, row, i) => { const v = series.reduce((a, se) => a + row.values[se.key], 0); return v > b.v ? { v, i } : b; }, { v: 0, i: -1 });
  CHARTS.set(chartId, stackChart({ rows, series, fmtAxis: metric.axis, avg: avg > 0 ? { value: avg, label: "promedio", text: metric.fmt(avg) } : null }));
  return `<section class="panel">
    <div class="trend-h">
      <h2>Por día</h2>
      <div class="seg" role="group" aria-label="Métrica">${TREND_METRICS.map((x) => `<button data-act="trend-metric" data-scope="${key}" data-v="${x.key}" aria-pressed="${x.key === metric.key}">${x.label}</button>`).join("")}</div>
      <span class="spacer"></span>
      <div class="seg" role="group" aria-label="Agrupar">${groups.map(([k, l]) => `<button data-act="trend-group" data-scope="${key}" data-v="${k}" aria-pressed="${k === group}">${l}</button>`).join("")}</div>
    </div>
    <div class="trend-sum">
      <span><b>${metric.fmt(total)}</b>${esc(metric.unit)} en el rango</span>
      <span><b>${metric.fmt(avg)}</b>promedio por día</span>
      ${busiest.i >= 0 ? `<span><b>${esc(dayLabel(days[busiest.i]))}</b>día con más ${esc(metric.label.toLowerCase())}</span>` : ""}
      ${series.length > 1 ? `<div class="legend">${series.map((se) => `<span><i class="sw" style="background:${se.color}"></i>${esc(se.label)}</span>`).join("")}</div>` : ""}
    </div>
    <div class="panel-b"><div class="chart" id="${chartId}" style="height:220px"></div></div>
    <div class="panel-b note" style="padding-top:0">${group === "modelo" ? "Cada sesión cuenta una vez, en su modelo principal (el más usado)." : group === "rama" ? "Cada sesión cuenta en la rama de git en la que se inició." : "Hacé click en una columna para ver las sesiones de ese día."}${metric.key === "active" ? " El tiempo activo es la duración de la sesión (de la primera a la última actividad)." : ""}</div>
  </section>`;
}

/* KPI strip shared by Resumen and Proyecto. Each KPI selects its metric in the trend chart (state slot `key`). */
function kpiStrip(M, key) {
  const T = M.totals, U = T.usage, tt = totalTok(U), days = M.byDay.length;
  const cacheShare = (U.cacheReadTokens + U.cacheCreationTokens) / (tt || 1);
  const kpi = (metric, inner) => `<button class="kpi" data-act="trend-metric" data-scope="${key}" data-v="${metric}" aria-pressed="${S[key].metric === metric}" title="Ver por día en el gráfico">${inner}</button>`;
  return `<section class="panel kpis" aria-label="Totales del rango">
      ${kpi("cost", `
        <div class="label">Costo estimado</div>
        <div class="value hero">${usd(T.costUsd)}</div>
        <div class="foot">${T.sessions ? `${usd(T.costUsd / T.sessions)}/sesión · ${usd(T.costUsd / days)}/día` : "—"}</div>`)}
      ${kpi("tokens", `
        <div class="label">Tokens</div>
        <div class="value">${tok(tt)}<small>${pct(cacheShare)} caché</small></div>
        ${shareBar(tokenParts(U), "thin")}
        <div class="legend">${TOK_KINDS.map(([k, l, c]) => `<span title="${l}"><i class="sw" style="background:${c}"></i>${TOK_SHORT[k]} <span class="muted">${tok(U[k])}</span></span>`).join("")}</div>`)}
      ${kpi("active", `
        <div class="label">Tiempo activo</div>
        <div class="value">${dur(T.activeMs)}</div>
        <div class="foot">${T.sessions ? `${dur(Math.round(T.activeMs / T.sessions))}/sesión · ${dur(Math.round(T.activeMs / days))}/día` : "—"}</div>`)}
      ${kpi("sessions", `
        <div class="label">Sesiones</div>
        <div class="value">${int(T.sessions)}</div>
        <div class="foot" title="${int(T.messages)} mensajes">${int(T.subagents)} subagentes · ${int(T.messages)} msjs.</div>`)}
      ${kpi("tools", `
        <div class="label">Llamadas a herramientas</div>
        <div class="value">${int(T.toolCalls)}</div>
        <div class="foot">${T.toolErrors
          ? `<span class="st err">${icon("x", "sm")}${int(T.toolErrors)} con error</span><span>· ${pct(T.toolErrors / T.toolCalls)}</span>`
          : `<span class="st ok">${icon("check", "sm")}Sin errores</span>`}</div>`)}
    </section>`;
}

/* Hour × weekday, Argentina time (UTC−3, no DST). Session spans are split across the hours they cover. */
const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const WEEKDAYS_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
function usageHeatmap(sc = {}) {
  const grid = WEEKDAYS.map(() => Array.from({ length: 24 }, () => ({ ms: 0, ids: new Set() })));
  const OFF = -3 * 3.6e6;
  for (const s of listSessions({ ...S.range, ...sc })) {
    let t = Date.parse(s.startedAt) + OFF;
    const end = Date.parse(s.endedAt) + OFF;
    while (t < end) {
      const d = new Date(t), next = Math.min(end, Math.floor(t / 3.6e6 + 1) * 3.6e6);
      const cell = grid[(d.getUTCDay() + 6) % 7][d.getUTCHours()];
      cell.ms += next - t; cell.ids.add(s.id);
      t = next;
    }
  }
  const max = Math.max(1, ...grid.flat().map((c) => c.ms));
  let peak = { ms: 0 };
  grid.forEach((row, d) => row.forEach((c, h) => { if (c.ms > peak.ms) peak = { ms: c.ms, d, h }; }));
  const byDay = grid.map((row) => row.reduce((a, c) => a + c.ms, 0));
  const topDay = byDay.indexOf(Math.max(...byDay));
  const cells = grid.map((row, d) => `<span class="d-lbl">${WEEKDAYS[d]}</span>` + row.map((c, h) =>
    `<span class="hm-c" style="--a:${c.ms ? (0.15 + 0.85 * c.ms / max).toFixed(2) : 0}" ${tip({
      head: `${cap(WEEKDAYS_LONG[d])} · ${h}–${h + 1} h`, value: c.ms ? dur(Math.round(c.ms)) + " activos" : "Sin actividad",
      rows: c.ms ? [{ label: "Sesiones", value: int(c.ids.size) }] : [],
    })}></span>`).join("")).join("");
  const hours = Array.from({ length: 24 }, (_, h) => `<span class="h-lbl">${h % 3 === 0 ? h : ""}</span>`).join("");
  return `<section class="panel">
    <div class="panel-h"><h2>Uso por hora</h2><span class="sub">tiempo de sesión por día de la semana y hora · hora de Argentina</span></div>
    <div class="panel-b">
      <div class="hm" role="img" aria-label="Mapa de uso por hora">${`<span></span>` + hours + cells}</div>
      <div class="hm-foot">
        ${peak.ms ? `<span>Pico: <b>${WEEKDAYS_LONG[peak.d]} ${peak.h}–${peak.h + 1} h</b></span><span>Día más activo: <b>${WEEKDAYS_LONG[topDay]}</b> (${dur(Math.round(byDay[topDay]))})</span>` : "<span>Sin actividad en el rango</span>"}
        <span class="hm-scale">menos${[0, 0.25, 0.5, 0.75, 1].map((a) => `<i style="--a:${a ? 0.15 + 0.85 * a : 0}"></i>`).join("")}más</span>
      </div>
    </div>
  </section>`;
}

/* Session length distribution. Not on Resumen: reserved for the expanded Sesiones view (see README). */
const DUR_BUCKETS = [["< 5 min", 0, 5], ["5–15 min", 5, 15], ["15–30 min", 15, 30], ["30–60 min", 30, 60], ["1–2 h", 60, 120], ["> 2 h", 120, Infinity]];
function durationHistogram(sc = {}) {
  const ss = listSessions({ ...S.range, ...sc });
  const rows = DUR_BUCKETS.map(([label, a, b]) => {
    const inB = ss.filter((s) => s.durationMs / 60000 >= a && s.durationMs / 60000 < b);
    const cost = inB.reduce((x, s) => x + s.costUsd, 0);
    return {
      label, values: { v: inB.length },
      tip: tip({ head: "Sesiones de " + label, value: int(inB.length) + (inB.length === 1 ? " sesión" : " sesiones"),
        rows: inB.length ? [{ label: "Del total", value: pct(inB.length / ss.length) }, { label: "Costo promedio", value: usd(cost / inB.length) }] : [] }),
    };
  });
  const sorted = ss.map((s) => s.durationMs).sort((x, y) => x - y);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  CHARTS.set("dur-chart", stackChart({ rows, series: [{ key: "v", label: "Sesiones", color: "var(--color-primary)" }], height: 200, fmtAxis: int, fmtCap: int, every: 1 }));
  return `<section class="panel">
    <div class="panel-h"><h2>Duración de las sesiones</h2><span class="sub">${median != null ? `mediana ${dur(median)} · más larga ${dur(sorted[sorted.length - 1])}` : "sin sesiones"}</span></div>
    <div class="panel-b"><div class="chart" id="dur-chart" style="height:200px"></div></div>
  </section>`;
}

/* Most used tools in the range: a compact summary of Herramientas. */
function topToolsPanel(sc = {}) {
  const stats = getToolStats(S.range, sc), top = stats.slice(0, 7);
  const max = Math.max(1, ...top.map((t) => t.calls));
  const calls = stats.reduce((a, t) => a + t.calls, 0), errs = stats.reduce((a, t) => a + t.errors, 0);
  return `<section class="panel">
    <div class="panel-h"><h2>Herramientas más usadas</h2><span class="sub">${int(calls)} llamadas</span>
      <a class="act nowrap" href="${href("herramientas")}">Ver todas →</a></div>
    <div class="panel-b flush tbl-wrap"><table class="tbl top-tools">
      <thead><tr><th>Herramienta</th><th class="num">Llamadas</th><th class="num">Errores</th><th class="num col-p3">Prom.</th></tr></thead>
      <tbody>${top.map((t) => `<tr class="link" data-go="${href("herramientas")}">
        <td class="mono" style="font-weight:600;font-size:12px">${esc(t.name)}</td>
        <td class="num"><div class="inline-bar"><span>${int(t.calls)}</span><div class="track" ${tip({ head: t.name, value: int(t.calls) + " llamadas", foot: pct(t.calls / (calls || 1)) + " de todas las llamadas" })}><i style="width:${(t.calls / max) * 100}%;background:var(--color-primary)"></i></div></div></td>
        <td class="num">${t.errors ? `<span class="st err" title="${pct(t.errorRate)} de tasa">${icon("x", "sm")}${int(t.errors)}<span class="muted" style="font-weight:400;margin-left:4px">${pct(t.errorRate)}</span></span>` : '<span class="st zero">0</span>'}</td>
        <td class="num col-p3 ink2">${dur(t.avgDurationMs)}</td>
      </tr>`).join("") || `<tr class="empty-row"><td colspan="4">Sin llamadas en este rango</td></tr>`}</tbody>
    </table></div>
    <div class="panel-b note">Incluye las llamadas de subagentes${errs ? ` · ${int(errs)} con error en total (${pct(errs / calls)})` : ""}.</div>
  </section>`;
}

/* Cost by model, grouped by family. */
function modelsPanel(M, sc = {}) {
  const T = M.totals;
  const families = [...new Set(M.byModel.map((g) => parseModel(g.key).family))]
    .sort((a, b) => familyRank(a) - familyRank(b))
    .map((family) => {
      const models = M.byModel.filter((g) => parseModel(g.key).family === family).sort((a, b) => modelOrder(a.key, b.key));
      const sum = (f) => models.reduce((a, g) => a + f(g), 0);
      return { family, models, sessions: sum((g) => g.sessions), tokens: sum((g) => totalTok(g.usage)), costUsd: sum((g) => g.costUsd) };
    });
  return `<section class="panel">
        <div class="panel-h"><h2>Por modelo</h2><span class="sub">participación en el costo</span>
          <span class="act muted">color = familia · tono = versión</span></div>
        <div class="panel-b" style="padding-bottom:4px">${shareBar(families.flatMap((fam) => fam.models.map((g, i) => ({
          value: g.costUsd, color: modelColor(g.key), gapBefore: i === 0,
          tip: tip({ head: modelName(g.key), value: usd(g.costUsd), rows: [{ label: "Sesiones", value: int(g.sessions) }, { label: "Tokens", value: tok(totalTok(g.usage)) }], foot: pct(g.costUsd / (T.costUsd || 1)) + " del costo · familia " + familyLabel(fam.family) }),
        }))))}</div>
        <div class="panel-b flush tbl-wrap"><table class="tbl models-tbl">
          <thead><tr><th>Modelo</th><th class="num">Sesiones</th><th class="num col-p3">Tokens</th><th class="num">Costo</th><th class="num">%</th></tr></thead>
          <tbody>${families.map((fam) => `<tr class="fam">
            <td class="name-cell"><span class="title-line"><i class="sw" style="background:${familyColor(fam.family)};margin-right:8px"></i>${esc(familyLabel(fam.family))}<span class="muted" style="margin-left:8px;font-weight:400;font-size:var(--text-xs)">${fam.models.length === 1 ? "1 versión" : fam.models.length + " versiones"}</span></span></td>
            <td class="num">${int(fam.sessions)}</td><td class="num col-p3">${tok(fam.tokens)}</td><td class="num">${usd(fam.costUsd)}</td><td class="num">${pct(fam.costUsd / (T.costUsd || 1))}</td>
          </tr>${fam.models.map((g) => `<tr class="link ver" data-go="${href("sesiones", { modelo: g.key, proyecto: sc.projectPath })}">
            <td class="name-cell"><span class="title-line" title="${esc(g.key)}"><i class="sw dot" style="background:${modelColor(g.key)};margin-right:8px"></i>${esc(modelName(g.key))}</span></td>
            <td class="num">${int(g.sessions)}</td><td class="num col-p3">${tok(totalTok(g.usage))}</td><td class="num">${usd(g.costUsd)}</td><td class="num muted">${pct(g.costUsd / (T.costUsd || 1))}</td>
          </tr>`).join("")}`).join("") || `<tr class="empty-row"><td colspan="5">Sin datos en este rango</td></tr>`}</tbody>
        </table></div>
        <div class="panel-b note">Si una sesión usó varios modelos (p. ej. subagentes en Haiku), su costo se reparte entre ellos.</div>
      </section>`;
}

/* Most touched files (Read / Edit / Write). */
function filesPanel(details, { title = "Archivos más tocados", limit = 8 } = {}) {
  const files = filesTouched(details), top = files.slice(0, limit), max = Math.max(1, ...top.map((f) => f.total));
  return `<section class="panel">
    <div class="panel-h"><h2>${title}</h2><span class="sub">${int(files.length)} archivos · Read, Edit y Write</span></div>
    <div class="panel-b flush tbl-wrap"><table class="tbl files-tbl">
      <thead><tr><th>Archivo</th><th class="num">Lecturas</th><th class="num">Ediciones</th><th class="num col-p3">Escrituras</th><th class="num">Total</th></tr></thead>
      <tbody>${top.map((f) => `<tr>
        <td class="name-cell"><span class="trunc mono" style="display:block" title="${esc(f.path)}">${esc(f.path)}</span></td>
        <td class="num">${f.Read ? int(f.Read) : '<span class="st zero">—</span>'}</td><td class="num">${f.Edit ? int(f.Edit) : '<span class="st zero">—</span>'}</td>
        <td class="num col-p3">${f.Write ? int(f.Write) : '<span class="st zero">—</span>'}</td>
        <td class="num"><div class="inline-bar"><span>${int(f.total)}</span><div class="track"><i style="width:${(f.total / max) * 100}%;background:var(--color-primary-alt-2)"></i></div></div></td>
      </tr>`).join("") || `<tr class="empty-row"><td colspan="5">No hubo lecturas ni ediciones de archivos</td></tr>`}</tbody>
    </table></div>
  </section>`;
}

function screenResumen() {
  const M = getMetrics(S.range), T = M.totals;
  const maxProj = Math.max(...M.byProject.map((g) => g.costUsd), 0.0001);
  const recent = listSessions(S.range).slice(0, 7);
  return `<div class="page">
    ${kpiStrip(M, "trend")}

    ${trendPanel(M, { key: "trend" })}

    <div class="grid-2 wide-left">
      ${usageHeatmap()}
      ${topToolsPanel()}
    </div>

    <div class="grid-2">
      <section class="panel">
        <div class="panel-h"><h2>Por proyecto</h2><span class="sub">${M.byProject.length} proyectos</span><a class="act" href="${href("proyectos")}">Ver proyectos →</a></div>
        <div class="panel-b flush tbl-wrap"><table class="tbl">
          <thead><tr><th>Proyecto</th><th class="num">Sesiones</th><th class="num col-p3">Tokens</th><th class="num">Costo</th><th class="num" style="width:84px"><span class="sr-only">Proporción</span></th></tr></thead>
          <tbody>${M.byProject.map((g) => `<tr class="link" data-go="${href("proyecto/" + encodeURIComponent(g.key))}">
            <td class="name-cell"><span class="title-line"><i class="sw" style="background:${projColor(g.key)};margin-right:8px"></i><span class="trunc" title="${esc(g.key)}">${esc(g.label)}</span></span></td>
            <td class="num">${int(g.sessions)}</td><td class="num col-p3">${tok(totalTok(g.usage))}</td><td class="num">${usd(g.costUsd)}</td>
            <td><div class="inline-bar"><div class="track" ${tip({ head: g.label, value: usd(g.costUsd), foot: pct(g.costUsd / (T.costUsd || 1)) + " del costo" })}><i style="width:${(g.costUsd / maxProj) * 100}%;background:${projColor(g.key)}"></i></div></div></td>
          </tr>`).join("") || `<tr class="empty-row"><td colspan="5">Sin datos en este rango</td></tr>`}</tbody>
        </table></div>
      </section>

      ${modelsPanel(M)}
    </div>

    <section class="panel">
      <div class="panel-h"><h2>Sesiones recientes</h2><a class="act" href="${href("sesiones")}">Ver todas (${int(T.sessions)}) →</a></div>
      <div class="panel-b flush tbl-wrap"><table class="tbl">
        <thead><tr><th>Sesión</th><th>Proyecto</th><th class="col-p2">Modelo</th><th>Inicio</th><th class="num col-p3">Duración</th><th class="num">Herram.</th><th class="num">Costo</th></tr></thead>
        <tbody>${recent.map((s) => `<tr class="link" data-go="${href("sesion/" + s.id)}">
          <td class="t-title"><a href="${href("sesion/" + s.id)}" class="title-line" style="color:inherit">${sessionTitle(s)}</a></td>
          <td class="ink2 nowrap">${esc(s.projectName)}</td><td class="col-p2">${modelsCell(s.models)}</td>
          <td class="nowrap ink2">${when(s.startedAt)}</td><td class="num col-p3">${dur(s.durationMs)}</td>
          <td class="num">${toolsCell(s.toolCallCount, s.toolErrorCount)}</td><td class="num">${usd(s.costUsd)}</td>
        </tr>`).join("") || `<tr class="empty-row"><td colspan="7">No hay sesiones en este rango</td></tr>`}</tbody>
      </table></div>
    </section>
  </div>`;
}

/* ======================================================================
   Screen — Proyectos (list) and Proyecto (dashboard scoped to one project)
   ====================================================================== */
const sparkline = (p, days) => {
  const vals = days.map((d) => p.sessions.filter((s) => dayOf(s) === d).reduce((a, s) => a + s.costUsd, 0));
  const max = Math.max(...vals, 0.0001), w = 120, h = 22, bw = w / vals.length;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${vals.map((v, i) => v > 0
    ? `<rect x="${(i * bw + 0.5).toFixed(1)}" y="${(h - Math.max(1.5, (v / max) * h)).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${Math.max(1.5, (v / max) * h).toFixed(1)}" rx="0.5"/>`
    : `<rect class="z" x="${(i * bw + 0.5).toFixed(1)}" y="${h - 1}" width="${Math.max(1, bw - 1).toFixed(1)}" height="1"/>`).join("")}</svg>`;
};
const PROJECT_COLS = [
  { key: "name", label: "Proyecto", cls: "t-title", val: (p) => p.name.toLowerCase(),
    cell: (p) => `<a href="${href("proyecto/" + encodeURIComponent(p.path))}" class="title-line" style="color:inherit"><i class="sw" style="background:${projColor(p.path)};margin-right:8px"></i><span class="trunc" title="${esc(p.path)}">${esc(p.name)}</span></a>` },
  { key: "sessions", label: "Sesiones", cls: "num", val: (p) => p.sessions.length, cell: (p) => int(p.sessions.length) },
  { key: "last", label: "Última actividad", cls: "nowrap ink2", val: (p) => p.last, cell: (p) => when(p.last) },
  { key: "activity", label: "Costo por día", cls: "col-p3", val: (p) => p.costUsd, cell: (p, days) => sparkline(p, days) },
  { key: "branches", label: "Ramas", cls: "num col-p3", val: (p) => p.branches.size,
    cell: (p) => (p.branches.size ? `<span title="${esc([...p.branches].join(", "))}">${int(p.branches.size)}</span>` : '<span class="muted">—</span>') },
  { key: "models", label: "Modelos", cls: "", val: (p) => p.models.size,
    cell: (p) => `<span class="models" title="${esc([...p.models.keys()].sort(modelOrder).map(modelName).join(" · "))}">${[...p.models.keys()].sort(modelOrder).map((m) => `<span><i class="sw dot" style="background:${modelColor(m)}"></i></span>`).join("")}</span>` },
  { key: "active", label: "Tiempo activo", cls: "num col-p2", val: (p) => p.activeMs, cell: (p) => dur(p.activeMs) },
  { key: "tools", label: "Herram.", cls: "num", val: (p) => p.toolCalls, cell: (p) => toolsCell(p.toolCalls, p.toolErrors) },
  { key: "tokens", label: "Tokens", cls: "num", val: (p) => totalTok(p.usage),
    cell: (p) => `<span ${tip({ head: "Tokens", value: tok(totalTok(p.usage)), rows: TOK_KINDS.map(([k, l, c]) => ({ color: c, label: l, value: tok(p.usage[k]) })) })}>${tok(totalTok(p.usage))}</span>` },
  { key: "cost", label: "Costo", cls: "num", val: (p) => p.costUsd, cell: (p) => usd(p.costUsd) },
];
S.sort.projects = { key: "cost", dir: -1 };

function screenProyectos(q) {
  return `<div class="page">
    <div class="filters" role="search">
      <label class="search">${icon("search", "sm")}<span class="sr-only">Buscar</span>
        <input class="field" id="f-psearch" type="search" placeholder="Buscar proyectos" title="Busca en el nombre y la ruta" value="${esc(q.get("q") ?? "")}"></label>
      <span class="spacer"></span>
      <span class="summary" id="p-summary"></span>
    </div>
    <section class="panel"><div class="tbl-wrap"><table class="tbl">
      <thead><tr>${sortHead("projects", PROJECT_COLS)}</tr></thead>
      <tbody id="projects-body"></tbody>
    </table></div></section>
    <p class="note">Solo aparecen los proyectos con sesiones en el rango. Hacé click en uno para ver su resumen.</p>
  </div>`;
}
function fillProjects() {
  const body = document.getElementById("projects-body");
  if (!body) return;
  const qs = (parseHash().q.get("q") ?? "").toLowerCase();
  const days = getMetrics(S.range).byDay.map((d) => d.date);
  const st = S.sort.projects, col = PROJECT_COLS.find((c) => c.key === st.key);
  const rows = getProjects(S.range).filter((p) => !qs || p.name.toLowerCase().includes(qs) || p.path.toLowerCase().includes(qs))
    .sort((a, b) => { const x = col.val(a), y = col.val(b); return (x < y ? -1 : x > y ? 1 : 0) * st.dir; });
  body.innerHTML = rows.map((p) => `<tr class="link" data-go="${href("proyecto/" + encodeURIComponent(p.path))}">${PROJECT_COLS.map((c) => `<td class="${c.cls}">${c.cell(p, days)}</td>`).join("")}</tr>`).join("") ||
    `<tr class="empty-row"><td colspan="${PROJECT_COLS.length}">Ningún proyecto coincide con la búsqueda.</td></tr>`;
  document.getElementById("p-summary").innerHTML = `<b>${int(rows.length)}</b> proyectos · <b>${usd(rows.reduce((a, p) => a + p.costUsd, 0))}</b> · ${esc(rangeText())}`;
}

function screenProyecto(path) {
  const sc = { projectPath: path };
  const all = D.sessions.filter((s) => s.projectPath === path);
  if (!all.length) return { crumbs: `<a href="${href("proyectos")}">Proyectos</a><span class="sep">/</span><span class="cur">No encontrado</span>`, html: `<div class="state">
    <div class="icon err">${icon("folderSearch")}</div><h2>No encontramos este proyecto</h2>
    <p>No hay sesiones registradas en esta carpeta. Puede que se haya movido desde el último escaneo.</p>
    <div class="err-box">notFound: ${esc(path)}</div>
    <div class="actions"><a class="btn" href="${href("proyectos")}">Volver a proyectos</a></div></div>` };
  const M = getMetrics(S.range, sc), ss = listSessions({ ...S.range, ...sc });
  const name = all[0].projectName;
  const branches = [...new Set(all.map((s) => s.gitBranch).filter(Boolean))].sort();
  const first = all.map((s) => s.startedAt).sort()[0], last = all.map((s) => s.startedAt).sort().at(-1);
  const cols = SESSION_COLS.filter((c) => c.key !== "project");
  const html = `<div class="page">
    <div class="detail-head">
      <h1><i class="sw" style="background:${projColor(path)};width:12px;height:12px;margin-right:10px;vertical-align:1px"></i>${esc(name)}</h1>
      <div class="meta-line">
        <span>${icon("folder", "sm")}<span class="mono">${esc(path)}</span></span>
        <span>${icon("branch", "sm")}${branches.length ? branches.map((b) => `<span class="chip mono">${esc(b)}</span>`).join("") : '<span class="muted">sin ramas</span>'}</span>
        <span>${icon("calendar", "sm")}desde ${dayLabel(first.slice(0, 10))} · última actividad ${when(last)}</span>
        <span>${int(all.length)} sesiones en total</span>
      </div>
    </div>
    ${ss.length ? `
    ${kpiStrip(M, "ptrend")}
    ${trendPanel(M, { key: "ptrend", sc, groups: [["total", "Total"], ["modelo", "Por modelo"], ["rama", "Por rama"]], drill: (date) => href("sesiones", { proyecto: path, desde: date, hasta: date }) })}
    <div class="grid-2 wide-left">
      ${usageHeatmap(sc)}
      ${topToolsPanel(sc)}
    </div>
    <div class="grid-2">
      ${modelsPanel(M, sc)}
      ${filesPanel(ss.map((s) => D.details[s.id]))}
    </div>
    <section class="panel">
      <div class="panel-h"><h2>Sesiones del proyecto</h2><span class="sub">${int(ss.length)} en el rango</span><a class="act" href="${href("sesiones", { proyecto: path })}">Abrir en Sesiones →</a></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr>${cols.map((c) => `<th class="${c.cls.replace(/nowrap|ink2/g, "")}">${c.label}</th>`).join("")}</tr></thead>
        <tbody>${ss.map((s) => `<tr class="link" data-go="${href("sesion/" + s.id)}">${cols.map((c) => `<td class="${c.cls}">${c.cell(s)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>
    </section>` : `<section class="panel"><div class="state"><div class="icon">${icon("calendar")}</div><h2>Sin sesiones en este rango</h2>
      <p>Este proyecto tiene ${int(all.length)} sesiones, pero ninguna entre ${esc(rangeText())}. Probá con un rango más amplio.</p>
      <div class="actions"><button class="btn" data-act="range" data-v="todo">Ver todo</button></div></div></section>`}
  </div>`;
  return { crumbs: `<a href="${href("proyectos")}">Proyectos</a><span class="sep">/</span><span class="cur">${esc(name)}</span>`, html };
}

/* ======================================================================
   Screen 2 — Sesiones
   ====================================================================== */
const SESSION_COLS = [
  { key: "title", label: "Sesión", cls: "t-title", val: (s) => (s.title ?? s.firstPrompt ?? "").toLowerCase(),
    cell: (s) => `<a href="${href("sesion/" + s.id)}" class="title-line" style="color:inherit">${sessionTitle(s)}${s.subagentCount ? `<span class="sub-badge" title="${s.subagentCount} subagentes">${icon("agent", "sm")}${s.subagentCount}</span>` : ""}</a>` },
  { key: "project", label: "Proyecto", cls: "nowrap", val: (s) => s.projectName.toLowerCase(),
    cell: (s) => `<span title="${esc(s.projectPath)}" class="ink2 trunc proj-name">${esc(s.projectName)}</span>` },
  { key: "branch", label: "Rama", cls: "col-p3", val: (s) => s.gitBranch ?? "~",
    cell: (s) => (s.gitBranch ? `<span class="branch trunc mono">${esc(s.gitBranch)}</span>` : `<span class="muted">—</span>`) },
  { key: "model", label: "Modelo", cls: "", val: (s) => s.models[0], cell: (s) => modelsCell(s.models) },
  { key: "start", label: "Inicio", cls: "nowrap ink2", val: (s) => s.startedAt, cell: (s) => when(s.startedAt) },
  { key: "duration", label: "Duración", cls: "num col-p2", val: (s) => s.durationMs, cell: (s) => dur(s.durationMs) },
  { key: "messages", label: "Msjs.", cls: "num col-p3", val: (s) => s.messageCount, cell: (s) => int(s.messageCount) },
  { key: "tools", label: "Herram.", cls: "num", val: (s) => s.toolCallCount, cell: (s) => toolsCell(s.toolCallCount, s.toolErrorCount) },
  { key: "tokens", label: "Tokens", cls: "num", val: (s) => totalTok(s.usage),
    cell: (s) => `<span ${tip({ head: "Tokens", value: tok(totalTok(s.usage)), rows: TOK_KINDS.map(([k, l, c]) => ({ color: c, label: l, value: tok(s.usage[k]) })) })}>${tok(totalTok(s.usage))}</span>` },
  { key: "cost", label: "Costo", cls: "num", val: (s) => s.costUsd, cell: (s) => usd(s.costUsd) },
];
const sortHead = (table, cols) => cols.map((c) => {
  const st = S.sort[table], on = st.key === c.key;
  return `<th class="${c.cls.replace(/nowrap|ink2/g, "")}" ${on ? `aria-sort="${st.dir > 0 ? "ascending" : "descending"}"` : ""}>
    <button data-act="sort" data-table="${table}" data-key="${c.key}">${c.label}<span class="arrow">${on ? (st.dir > 0 ? "▲" : "▼") : ""}</span></button></th>`;
}).join("");

function sessionFilter(q) {
  return {
    search: q.get("q") || undefined, projectPath: q.get("proyecto") || undefined, model: q.get("modelo") || undefined,
    from: S.range.from, to: S.range.to,
  };
}
function screenSesiones(q) {
  if (q.get("desde")) {
    // Day drill-down from the cost chart: becomes the global range, then leaves the URL.
    S.range = { preset: "custom", from: q.get("desde"), to: q.get("hasta") || q.get("desde") };
    q.delete("desde"); q.delete("hasta");
    history.replaceState(null, "", "#/sesiones" + (q.toString() ? "?" + q : ""));
  }
  const f = sessionFilter(q);
  const fams = [...new Set(ALL_MODELS.map((m) => parseModel(m).family))].sort((a, b) => familyRank(a) - familyRank(b));
  return `<div class="page">
    ${S.mode === "aviso" ? warnBanner() : ""}
    <div class="filters" role="search">
      <label class="search">${icon("search", "sm")}<span class="sr-only">Buscar</span>
        <input class="field" id="f-search" type="search" placeholder="Buscar sesiones" title="Busca en título, primer prompt y proyecto" value="${esc(f.search ?? "")}"></label>
      <select class="field" id="f-project" aria-label="Proyecto">
        <option value="">Todos los proyectos</option>
        ${PROJECTS.map((p) => `<option value="${esc(p)}" ${f.projectPath === p ? "selected" : ""}>${esc(projName(p))}</option>`).join("")}
      </select>
      <select class="field" id="f-model" aria-label="Modelo">
        <option value="">Todos los modelos</option>
        ${fams.map((fam) => `<optgroup label="${esc(familyLabel(fam))}">${ALL_MODELS.filter((m) => parseModel(m).family === fam).sort(modelOrder).map((m) =>
          `<option value="${esc(m)}" ${f.model === m ? "selected" : ""}>${esc(modelName(m))}</option>`).join("")}</optgroup>`).join("")}
      </select>
      <span id="f-clear"></span>
      <span class="spacer"></span>
      <span class="summary" id="f-summary"></span>
    </div>
    <section class="panel"><div class="tbl-wrap"><table class="tbl" id="sessions-tbl">
      <thead><tr>${sortHead("sessions", SESSION_COLS)}</tr></thead>
      <tbody id="sessions-body"></tbody>
    </table></div></section>
  </div>`;
}
function fillSessions() {
  const body = document.getElementById("sessions-body");
  if (!body) return;
  const { q } = parseHash();
  const f = sessionFilter(q);
  const st = S.sort.sessions, col = SESSION_COLS.find((c) => c.key === st.key);
  const rows = listSessions(f).sort((a, b) => { const x = col.val(a), y = col.val(b); return (x < y ? -1 : x > y ? 1 : 0) * st.dir; });
  body.innerHTML = rows.map((s) => `<tr class="link" data-go="${href("sesion/" + s.id)}">${SESSION_COLS.map((c) => `<td class="${c.cls}">${c.cell(s)}</td>`).join("")}</tr>`).join("") ||
    `<tr class="empty-row"><td colspan="${SESSION_COLS.length}">Ninguna sesión coincide con los filtros.<br><button class="btn sm" style="margin-top:10px" data-act="clear-filters">Limpiar filtros</button></td></tr>`;
  const cost = rows.reduce((a, s) => a + s.costUsd, 0);
  document.getElementById("f-summary").innerHTML = `<b>${int(rows.length)}</b> sesiones · <b>${usd(cost)}</b> · ${esc(rangeText())}`;
  const active = f.search || f.projectPath || f.model;
  document.getElementById("f-clear").innerHTML = active ? `<button class="btn ghost sm" data-act="clear-filters">Limpiar filtros</button>` : "";
}

/* ======================================================================
   Screen 3 — Detalle de sesión
   ====================================================================== */
const keyArg = (c) => {
  const i = c.input ?? {};
  switch (c.name) {
    case "Read": case "Edit": case "Write": return i.file_path;
    case "Bash": return i.command;
    case "Grep": case "Glob": return i.pattern;
    case "Agent": return [i.subagent_type, i.description].filter(Boolean).join(" · ");
    case "WebSearch": return i.query;
    case "TodoWrite": return `${(i.todos ?? []).length} tareas`;
    default: return Object.values(i).find((v) => typeof v === "string") ?? "";
  }
};
const jsonHtml = (v) => esc(JSON.stringify(v, null, 2)).replace(/^(\s*)(&quot;[^&]*?&quot;)(:)/gm, '$1<span class="k">$2</span>$3');

/* Mockup only: sample data has parentToolCallId = null, so we attach each subagent
   to the next unused Agent call (or place it by time) to preview the nested layout.
   The real app uses Subagent.parentToolCallId and falls back to chronological. */
function linkSubagents(d) {
  const byParent = new Map(), loose = [];
  const agentCalls = d.messages.flatMap((m) => m.blocks.filter((b) => b.type === "toolCall" && b.name === "Agent"));
  let ai = 0;
  for (const sa of d.subagents) {
    const pid = sa.parentToolCallId ?? agentCalls[ai++]?.id;
    pid ? byParent.set(pid, sa) : loose.push(sa);
  }
  return { byParent, loose };
}

function callRow(c, ctx) {
  const key = "c:" + c.id, open = S.open.has(key), sa = ctx.byParent?.get(c.id);
  const arg = keyArg(c);
  return `<div class="call ${c.isError ? "err" : ""}" id="${key}" open-state="${open ? 1 : 0}">
    <button class="call-row" data-act="toggle" data-k="${key}" aria-expanded="${open}">
      ${icon("chevron", "sm chev")}
      ${c.isError ? `<span class="st err">${icon("x", "sm")}</span>` : `<span class="st zero" title="ok">${icon("check", "sm")}</span>`}
      <span class="name">${esc(c.name)}</span>
      <span class="arg" title="${esc(arg)}">${esc(arg)}</span>
      <span class="right">${c.isError ? `<span class="st err">error</span>` : ""}<span>${dur(c.durationMs)}</span></span>
    </button>
    <div class="call-body">
      <div><h4>Entrada</h4><pre class="code">${jsonHtml(c.input)}</pre></div>
      <div><h4>Resultado${c.isError ? " · error" : ""}</h4>${c.result == null
        ? `<div class="note">Sin resultado registrado.</div>`
        : `<pre class="code ${c.isError ? "err" : ""}">${esc(c.result)}</pre>`}</div>
      <div class="note mono">${esc(c.id)} · ${dur(c.durationMs)}</div>
    </div>
    ${sa ? `<div style="padding:0 10px 8px 34px">${subagentBlock(sa)}</div>` : ""}
  </div>`;
}

function subagentBlock(sa) {
  const key = "s:" + sa.id, open = S.open.has(key);
  const calls = sa.messages.flatMap((m) => m.blocks.filter((b) => b.type === "toolCall"));
  const errs = calls.filter((c) => c.isError).length;
  const model = sa.messages.find((m) => m.model)?.model;
  return `<div class="subagent" id="${key}" open-state="${open ? 1 : 0}">
    <button class="subagent-h" data-act="toggle" data-k="${key}" aria-expanded="${open}">
      ${icon("chevron", "sm chev")}${icon("agent", "sm")}<span>Subagente</span><b>${esc(sa.agentType ?? "sin tipo")}</b>
      ${model ? `<span><i class="sw dot" style="background:${modelColor(model)};margin-right:4px"></i>${esc(modelName(model))}</span>` : ""}
      <span class="muted">· ${dur(Date.parse(sa.endedAt) - Date.parse(sa.startedAt))} · ${sa.messages.length} mensajes · ${calls.length} llamadas</span>
      ${errs ? `<span class="st err">${icon("x", "sm")}${errs}</span>` : ""}
      <span class="muted">· ${tok(totalTok(sa.usage))} tokens · ${usd(sa.costUsd)}</span>
    </button>
    <div class="subagent-b"><div class="timeline" style="padding:2px 0 6px">${timeline(sa.messages, { sub: true })}</div></div>
  </div>`;
}

function blockHtml(b, ctx, mid, i) {
  if (b.type === "text") return b.text ? `<div class="text">${esc(b.text)}</div>` : "";
  if (b.type === "thinking") {
    const key = `t:${mid}:${i}`, open = S.open.has(key);
    return `<button class="thinking" data-act="toggle-think" data-k="${key}" aria-expanded="${open}">${icon("thought", "sm")}Razonamiento<span class="muted">${b.text ? "" : "· sin contenido en el log"}</span></button>
      ${open ? `<div class="thinking-note">${b.text ? esc(b.text) : "Claude Code registra que hubo razonamiento, pero no guarda su texto en el archivo de la sesión."}</div>` : ""}`;
  }
  return null; // tool calls are grouped by the caller
}

function messageHtml(m, ctx) {
  const t = fTimeS.format(new Date(m.timestamp));
  if (m.role === "user") {
    const text = m.blocks.map((b) => b.text ?? "").join("\n");
    return `<div class="ev user" id="m:${m.id}"><div class="time">${t}</div><div class="rail"><span class="dot"></span></div>
      <div class="body"><div class="who">${icon("user", "sm")}<b>${ctx.sub ? "Prompt del agente" : "Vos"}</b></div><div class="bubble">${esc(text)}</div></div></div>`;
  }
  const parts = [];
  let group = [];
  const flush = () => { if (group.length) parts.push(`<div class="calls">${group.map((c) => callRow(c, ctx)).join("")}</div>`); group = []; };
  m.blocks.forEach((b, i) => {
    if (b.type === "toolCall") return group.push(b);
    flush();
    parts.push(blockHtml(b, ctx, m.id, i));
  });
  flush();
  const u = m.usage;
  return `<div class="ev" id="m:${m.id}"><div class="time">${t}</div><div class="rail"><span class="dot"></span></div>
    <div class="body"><div class="who"><b>Claude</b>${m.model ? `<span><i class="sw dot" style="background:${modelColor(m.model)};margin-right:4px"></i>${esc(modelName(m.model))}</span>` : ""}</div>
    ${parts.join("")}
    ${u ? `<div class="msg-foot" ${tip({ head: "Tokens de este mensaje", rows: TOK_KINDS.map(([k, l, c]) => ({ color: c, label: l, value: int(u[k]) })) })}>
      <span>${tok(u.outputTokens)} salida</span><span>${tok(u.cacheReadTokens)} caché leída</span><span>${tok(u.cacheCreationTokens)} caché escrita</span><span>${int(u.inputTokens)} entrada</span></div>` : ""}
    </div></div>`;
}

function timeline(messages, ctx) {
  let out = "", prev = null;
  for (const m of messages) {
    const ts = Date.parse(m.timestamp);
    if (prev != null && ts - prev > 3 * 60000)
      out += `<div class="gap-ev"><div></div><div class="rail"></div><div class="lbl">${dur(ts - prev)} sin actividad</div></div>`;
    out += messageHtml(m, ctx);
    for (const sa of (ctx.loose ?? []).filter((x) => x.placedAfter === m.id))
      out += `<div class="ev"><div class="time">${fTimeS.format(new Date(sa.startedAt))}</div><div class="rail"><span class="dot"></span></div><div class="body">${subagentBlock(sa)}</div></div>`;
    prev = ts;
  }
  return out;
}

/* Session dashboard (tab "Resumen"): a quick read of one SessionDetail. */
const SESSION_METRICS = [
  { key: "tokens", label: "Tokens", fmt: tok, axis: (v) => (v ? tok(v) : "0"),
    series: TOK_KINDS.map(([k, label, color]) => ({ key: k, label, color, val: (m) => m.usage?.[k] ?? 0 })) },
  { key: "context", label: "Contexto", fmt: tok, axis: (v) => (v ? tok(v) : "0"),
    series: [{ key: "ctx", label: "Caché leída (contexto)", color: "var(--color-primary)", val: (m) => m.usage?.cacheReadTokens ?? 0 }] },
  { key: "output", label: "Salida", fmt: tok, axis: (v) => (v ? tok(v) : "0"),
    series: [{ key: "out", label: "Tokens de salida", color: "var(--color-primary-alt-1)", val: (m) => m.usage?.outputTokens ?? 0 }] },
  { key: "tools", label: "Herramientas", fmt: int, axis: int,
    series: [
      { key: "ok", label: "Sin error", color: "var(--color-primary)", val: (m) => m.blocks.filter((b) => b.type === "toolCall" && !b.isError).length },
      { key: "err", label: "Con error", color: "var(--color-error-mark)", val: (m) => m.blocks.filter((b) => b.type === "toolCall" && b.isError).length },
    ] },
];
function sessionDashboard(d) {
  const s = d.summary, U = s.usage, tt = totalTok(U), id = s.id;
  const toConv = (p) => href("sesion/" + id, { vista: "conversacion", ...p });
  const asst = d.messages.filter((m) => m.role === "assistant");
  const prompts = d.messages.filter((m) => m.role === "user").length;
  const allCalls = [...d.messages, ...d.subagents.flatMap((x) => x.messages)].flatMap((m) => m.blocks.filter((b) => b.type === "toolCall"));
  const mainCalls = d.messages.flatMap((m) => m.blocks.filter((b) => b.type === "toolCall"));
  const errors = mainCalls.filter((c) => c.isError);
  const subCost = d.subagents.reduce((a, x) => a + x.costUsd, 0);
  const toolMs = allCalls.reduce((a, c) => a + (c.durationMs ?? 0), 0);
  let idle = 0;
  for (let i = 1; i < d.messages.length; i++) { const g = Date.parse(d.messages[i].timestamp) - Date.parse(d.messages[i - 1].timestamp); if (g > 3 * 60000) idle += g; }

  const metric = SESSION_METRICS.find((x) => x.key === S.strend.metric);
  const rows = asst.map((m, i) => {
    const values = Object.fromEntries(metric.series.map((se) => [se.key, se.val(m)]));
    const total = metric.series.reduce((a, se) => a + values[se.key], 0);
    const calls = m.blocks.filter((b) => b.type === "toolCall");
    return {
      label: fTime.format(new Date(m.timestamp)), values, go: toConv({ msg: m.id }),
      tip: tip({ head: `Respuesta ${i + 1} · ${fTimeS.format(new Date(m.timestamp))}`, value: metric.fmt(total),
        rows: metric.series.length > 1 ? metric.series.filter((se) => values[se.key] > 0).map((se) => ({ color: se.color, label: se.label, value: metric.fmt(values[se.key]) })) : [],
        foot: `${calls.length} llamadas · hacé click para ir al mensaje` }),
    };
  });
  CHARTS.set("strend-chart", stackChart({ rows, series: metric.series, fmtAxis: metric.axis, height: 200, every: Math.max(1, Math.ceil(rows.length / 12)) }));

  const byTool = new Map();
  for (const c of allCalls) {
    const t = byTool.get(c.name) ?? { name: c.name, n: 0, e: 0, ms: 0 };
    t.n++; if (c.isError) t.e++; t.ms += c.durationMs ?? 0; byTool.set(c.name, t);
  }
  const tools = [...byTool.values()].sort((a, b) => b.n - a.n), maxT = Math.max(1, ...tools.map((t) => t.n));
  const callTime = (c) => {
    const m = d.messages.find((mm) => mm.blocks.includes(c));
    return m ? fTimeS.format(new Date(m.timestamp)) : "";
  };

  return `
    <section class="panel kpis s-kpis" aria-label="Totales de la sesión">
      <div class="kpi"><div class="label">Costo estimado</div><div class="value hero">${usd(s.costUsd)}</div>
        <div class="foot" title="${usd(s.costUsd - subCost)} de la sesión principal">${subCost ? `incluye ${usd(subCost)} de subagentes` : "sin subagentes"}</div></div>
      <div class="kpi"><div class="label">Tokens</div><div class="value">${tok(tt)}<small>${pct((U.cacheReadTokens + U.cacheCreationTokens) / (tt || 1))} caché</small></div>
        ${shareBar(tokenParts(U), "thin")}
        <div class="legend">${TOK_KINDS.map(([k, l, c]) => `<span title="${l}"><i class="sw" style="background:${c}"></i>${TOK_SHORT[k]} <span class="muted">${tok(U[k])}</span></span>`).join("")}</div></div>
      <div class="kpi"><div class="label">Duración</div><div class="value">${dur(s.durationMs)}</div>
        <div class="foot" title="${idle ? dur(idle) + " sin actividad (pausas de más de 3 min)" : "sin pausas largas"}">${dur(toolMs)} en herramientas</div></div>
      <div class="kpi"><div class="label">Mensajes</div><div class="value">${int(s.messageCount)}</div>
        <div class="foot">${int(prompts)} prompts · ${int(asst.length)} respuestas</div></div>
      <div class="kpi"><div class="label">Llamadas a herramientas</div><div class="value">${int(mainCalls.length)}</div>
        <div class="foot">${errors.length ? `<span class="st err">${icon("x", "sm")}${int(errors.length)} con error</span><span>· ${pct(errors.length / mainCalls.length)}</span>` : `<span class="st ok">${icon("check", "sm")}Sin errores</span>`}</div></div>
    </section>

    <section class="panel">
      <div class="trend-h">
        <h2>Por respuesta</h2>
        <div class="seg" role="group" aria-label="Métrica">${SESSION_METRICS.map((x) => `<button data-act="trend-metric" data-scope="strend" data-v="${x.key}" aria-pressed="${x.key === metric.key}">${x.label}</button>`).join("")}</div>
        <span class="spacer"></span>
        ${metric.series.length > 1 ? `<div class="legend">${metric.series.map((se) => `<span><i class="sw" style="background:${se.color}"></i>${esc(se.label)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="panel-b"><div class="chart" id="strend-chart" style="height:200px"></div></div>
      <div class="panel-b note" style="padding-top:0">Una columna por respuesta de Claude, en orden. ${metric.key === "context" ? "La caché leída muestra cuánto contexto se reenvía en cada turno." : "Hacé click en una columna para ir a ese mensaje en la conversación."}</div>
    </section>

    <div class="grid-2">
      <section class="panel">
        <div class="panel-h"><h2>Herramientas</h2><span class="sub">${int(allCalls.length)} llamadas · incluye subagentes</span></div>
        <div class="panel-b flush tbl-wrap"><table class="tbl">
          <thead><tr><th>Herramienta</th><th class="num">Llamadas</th><th class="num">Errores</th><th class="num">Tiempo total</th></tr></thead>
          <tbody>${tools.map((t) => `<tr>
            <td class="mono" style="font-weight:600;font-size:12px">${esc(t.name)}</td>
            <td class="num"><div class="inline-bar"><span>${int(t.n)}</span><div class="track"><i style="width:${(t.n / maxT) * 100}%;background:var(--color-primary)"></i></div></div></td>
            <td class="num">${t.e ? `<span class="st err">${icon("x", "sm")}${int(t.e)}</span>` : '<span class="st zero">0</span>'}</td>
            <td class="num ink2">${dur(t.ms)}</td>
          </tr>`).join("") || `<tr class="empty-row"><td colspan="4">Sin llamadas</td></tr>`}</tbody>
        </table></div>
      </section>
      ${filesPanel([d], { limit: 7 })}
    </div>

    <div class="grid-2">
      <section class="panel">
        <div class="panel-h"><h2>Subagentes</h2><span class="sub">${d.subagents.length ? `${d.subagents.length} · ${usd(subCost)} (${pct(subCost / (s.costUsd || 1))} del costo)` : "ninguno"}</span></div>
        <div class="panel-b flush tbl-wrap"><table class="tbl">
          <thead><tr><th>Tipo</th><th>Modelo</th><th class="num">Duración</th><th class="num">Llamadas</th><th class="num">Costo</th></tr></thead>
          <tbody>${d.subagents.map((sa) => {
            const model = sa.messages.find((m) => m.model)?.model, n = sa.messages.flatMap((m) => m.blocks.filter((b) => b.type === "toolCall")).length;
            return `<tr class="link" data-go="${toConv({ sub: sa.id })}">
              <td><span class="title-line">${icon("agent", "sm")}<b style="font-weight:600;margin-left:6px">${esc(sa.agentType ?? "sin tipo")}</b></span></td>
              <td>${model ? modelsCell([model]) : "—"}</td>
              <td class="num">${dur(Date.parse(sa.endedAt) - Date.parse(sa.startedAt))}</td><td class="num">${int(n)}</td><td class="num">${usd(sa.costUsd)}</td></tr>`;
          }).join("") || `<tr class="empty-row"><td colspan="5">Esta sesión no lanzó subagentes</td></tr>`}</tbody>
        </table></div>
      </section>
      <section class="panel">
        <div class="panel-h"><h2>Errores</h2><span class="sub">${errors.length ? `${int(errors.length)} ${errors.length === 1 ? "llamada falló" : "llamadas fallaron"}` : "ninguno"}</span></div>
        <div class="panel-b flush tbl-wrap"><table class="tbl">
          <thead><tr><th>Hora</th><th>Herramienta</th><th>Argumento</th></tr></thead>
          <tbody>${errors.map((c) => `<tr class="link" data-go="${toConv({ call: c.id })}">
            <td class="nowrap ink2">${callTime(c)}</td>
            <td><span class="st err">${icon("x", "sm")}<span class="mono" style="font-size:12px">${esc(c.name)}</span></span></td>
            <td class="name-cell"><span class="trunc mono ink2" style="display:block;font-size:12px" title="${esc(c.result ?? "")}">${esc(keyArg(c))}</span></td></tr>`).join("") ||
            `<tr class="empty-row"><td colspan="3"><span class="st ok">${icon("check", "sm")}Todas las llamadas terminaron bien</span></td></tr>`}</tbody>
        </table></div>
      </section>
    </div>`;
}

function screenSesion(id, q = new URLSearchParams()) {
  const d = getSession(id);
  if (S.mode === "error" || !d) return { crumbs: crumbsDetail(d?.summary), html: detailError(id, !d && S.mode !== "error" ? "notFound" : "io", d?.summary) };
  const s = d.summary, U = s.usage, tt = totalTok(U);
  const view = q.get("vista") === "conversacion" ? "conversacion" : "resumen";
  const { byParent, loose } = linkSubagents(d);
  for (const sa of loose) sa.placedAfter = [...d.messages].reverse().find((m) => m.timestamp <= sa.startedAt)?.id ?? d.messages[0].id;
  const allCalls = d.messages.flatMap((m) => m.blocks.filter((b) => b.type === "toolCall"));
  const subCost = d.subagents.reduce((a, x) => a + x.costUsd, 0);
  const byTool = new Map();
  for (const c of [...allCalls, ...d.subagents.flatMap((x) => x.messages.flatMap((m) => m.blocks.filter((b) => b.type === "toolCall")))]) {
    const t = byTool.get(c.name) ?? { n: 0, e: 0 }; t.n++; if (c.isError) t.e++; byTool.set(c.name, t);
  }
  const tools = [...byTool].sort((a, b) => b[1].n - a[1].n), maxT = tools[0]?.[1].n ?? 1;
  const errors = allCalls.filter((c) => c.isError).length;

  const html = `<div class="page">
    <div class="detail-head">
      <h1>${esc(s.title ?? s.firstPrompt ?? "Sesión sin título")}</h1>
      ${s.title && s.firstPrompt ? `<div class="prompt">“${esc(s.firstPrompt)}”</div>` : ""}
      <div class="meta-line">
        <a href="${href("proyecto/" + encodeURIComponent(s.projectPath))}" title="${esc(s.projectPath)}">${icon("folder", "sm")}${esc(s.projectName)}</a>
        ${s.gitBranch ? `<span>${icon("branch", "sm")}<span class="mono">${esc(s.gitBranch)}</span></span>` : ""}
        <span>${icon("calendar", "sm")}${esc(cap(fDayFull.format(new Date(s.startedAt))))}, ${fTime.format(new Date(s.startedAt))}</span>
        <span>${icon("clock", "sm")}${dur(s.durationMs)}</span>
        <span>${modelsCell(s.models, true)}</span>
        <span class="muted">${usd(s.costUsd)}</span>
      </div>
    </div>
    <nav class="tabs" aria-label="Vista de la sesión">
      <a href="${href("sesion/" + id)}" ${view === "resumen" ? 'aria-current="page"' : ""}>Resumen</a>
      <a href="${href("sesion/" + id, { vista: "conversacion" })}" ${view === "conversacion" ? 'aria-current="page"' : ""}>Conversación <span class="muted">${int(s.messageCount)}</span></a>
    </nav>
    ${view === "resumen" ? sessionDashboard(d) : `<div class="detail">
      <section class="panel">
        <div class="tl-bar">
          <h2>Conversación</h2>
          <span class="sub">${int(s.messageCount)} mensajes · ${int(allCalls.length)} llamadas${errors ? ` · <span class="st err">${icon("x", "sm")}${errors} con error</span>` : ""}${d.subagents.length ? ` · ${d.subagents.length} subagentes` : ""}</span>
          <span class="spacer"></span>
          ${errors ? `<button class="btn ghost sm" data-act="next-error">${icon("x", "sm")}Siguiente error</button>` : ""}
          <button class="btn ghost sm" data-act="expand-all">Expandir todo</button>
          <button class="btn ghost sm" data-act="collapse-all">Contraer</button>
        </div>
        <div class="timeline" id="timeline">${timeline(d.messages, { byParent, loose })}</div>
      </section>
      <aside class="aside">
        <section class="panel">
          <div class="panel-h"><h2>Tokens y costo</h2></div>
          <div class="panel-b" style="display:flex;flex-direction:column;gap:10px">
            <div><div class="big-cost">${usd(s.costUsd)}</div><div class="note">estimado con precios públicos por modelo</div></div>
            ${shareBar(tokenParts(U))}
            <div class="kv">
              ${TOK_KINDS.map(([k, l, c]) => `<i class="sw" style="background:${c}"></i><span class="k">${l}</span><span class="v">${int(U[k])}</span><span class="p">${pct(U[k] / (tt || 1))}</span>`).join("")}
              <hr><span></span><span class="k total">Total</span><span class="v total">${int(tt)}</span><span class="p"></span>
            </div>
            <div class="kv" style="grid-template-columns:minmax(0,1fr) auto">
              <span class="k">Sesión principal</span><span class="v">${usd(s.costUsd - subCost)}</span>
              <span class="k">Subagentes (${d.subagents.length})</span><span class="v">${usd(subCost)}</span>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-h"><h2>Sesión</h2></div>
          <div class="panel-b"><dl class="meta">
            <dt>Proyecto</dt><dd class="mono">${esc(s.projectPath)}</dd>
            <dt>Rama</dt><dd>${s.gitBranch ? `<span class="mono">${esc(s.gitBranch)}</span>` : '<span class="muted">sin rama</span>'}</dd>
            <dt>Versión CLI</dt><dd class="mono">${esc(s.cliVersion ?? "—")}</dd>
            <dt>Inicio</dt><dd>${dayLabelW(s.startedAt.slice(0, 10))}, ${fTimeS.format(new Date(s.startedAt))}</dd>
            <dt>Fin</dt><dd>${dayLabelW(s.endedAt.slice(0, 10))}, ${fTimeS.format(new Date(s.endedAt))}</dd>
            <dt>Duración</dt><dd>${dur(s.durationMs)}</dd>
            <dt>Mensajes</dt><dd>${int(s.messageCount)}</dd>
            <dt>Proveedor</dt><dd>${esc(PROVIDERS[S.provider])}</dd>
            <dt>ID</dt><dd class="mono" style="font-size:11px">${esc(s.id)}</dd>
          </dl></div>
        </section>
        <section class="panel">
          <div class="panel-h"><h2>Herramientas</h2><span class="sub">incluye subagentes</span></div>
          <div class="panel-b"><div class="mini-list">${tools.map(([n, t]) => `<div>
            <span class="mono">${esc(n)}</span><span><div class="bar" style="width:${(t.n / maxT) * 100}%"></div></span>
            <span class="num">${t.n}</span><span class="num">${t.e ? `<span class="st err">${icon("x", "sm")}${t.e}</span>` : '<span class="st zero">—</span>'}</span></div>`).join("") || '<span class="muted">Sin llamadas</span>'}</div></div>
        </section>
      </aside>
    </div>`}
  </div>`;
  return { crumbs: crumbsDetail(s), html };
}
const crumbsDetail = (s) => `<a href="${href("sesiones")}">Sesiones</a><span class="sep">/</span><span class="cur">${esc(s ? s.title ?? s.firstPrompt ?? shortId(s.id) : "Sesión")}</span>`;

/* ======================================================================
   Screen 4 — Herramientas
   ====================================================================== */
const TOOL_COLS = [
  { key: "rank", label: "#", cls: "rank num", val: (t) => t.calls },
  { key: "name", label: "Herramienta", cls: "", val: (t) => t.name.toLowerCase() },
  { key: "calls", label: "Llamadas", cls: "num", val: (t) => t.calls },
  { key: "errors", label: "Errores", cls: "num", val: (t) => t.errors },
  { key: "rate", label: "Tasa de error", cls: "num", val: (t) => t.errorRate },
  { key: "avg", label: "Duración prom.", cls: "num", val: (t) => t.avgDurationMs ?? -1 },
  { key: "proj", label: "Llamadas por proyecto", cls: "col-p2", val: (t) => t.byProject[0]?.count ?? 0 },
];
function screenHerramientas() {
  const stats = getToolStats(S.range);
  const ranked = new Map(stats.map((t, i) => [t.name, i + 1]));
  const st = S.sort.tools, col = TOOL_COLS.find((c) => c.key === st.key);
  const rows = [...stats].sort((a, b) => { const x = col.val(a), y = col.val(b); return (x < y ? -1 : x > y ? 1 : 0) * st.dir; });
  const calls = stats.reduce((a, t) => a + t.calls, 0), errs = stats.reduce((a, t) => a + t.errors, 0);
  const maxCalls = Math.max(...stats.map((t) => t.calls), 1);
  const usedProjects = PROJECTS.filter((p) => stats.some((t) => t.byProject.some((b) => b.key === p)));
  return `<div class="page">
    <div class="filters">
      <span class="summary"><b>${stats.length}</b> herramientas · <b>${int(calls)}</b> llamadas · ${errs ? `<span class="st err">${icon("x", "sm")}${int(errs)} con error (${pct(errs / calls)})</span>` : "sin errores"} · incluye subagentes · ${esc(rangeText())}</span>
      <span class="spacer"></span>
      <div class="legend" aria-label="Proyectos">${usedProjects.map((p) => `<span><i class="sw" style="background:${projColor(p)}"></i>${esc(projName(p))}</span>`).join("")}</div>
    </div>
    <section class="panel"><div class="tbl-wrap"><table class="tbl tools-tbl">
      <thead><tr>${sortHead("tools", TOOL_COLS)}<th style="width:30px"><span class="sr-only">Detalle</span></th></tr></thead>
      <tbody>${rows.map((t) => {
        const key = "tool:" + t.name, open = S.open.has(key);
        return `<tr class="link ${open ? "expanded" : ""}" data-act="toggle-tool" data-k="${key}">
          <td class="rank num">${ranked.get(t.name)}</td>
          <td class="tool">${esc(t.name)}</td>
          <td class="num"><div class="inline-bar"><span>${int(t.calls)}</span><div class="track"><i style="width:${(t.calls / maxCalls) * 100}%;background:var(--color-primary)"></i></div></div></td>
          <td class="num">${t.errors ? `<span class="st err">${icon("x", "sm")}${int(t.errors)}</span>` : '<span class="st zero">0</span>'}</td>
          <td class="num"><span class="nowrap">${t.errors ? `<span class="meter" style="margin-right:8px"><i style="width:${Math.min(100, t.errorRate * 500)}%"></i></span>` : ""}${pct(t.errorRate)}</span></td>
          <td class="num">${dur(t.avgDurationMs)}</td>
          <td class="col-p2"><div class="stack">${[...t.byProject].sort((a, b) => PROJECTS.indexOf(a.key) - PROJECTS.indexOf(b.key)).map((b) => `<span style="flex:${b.count};background:${projColor(b.key)}" ${tip({ head: t.name + " · " + b.label, value: int(b.count) + " llamadas", foot: pct(b.count / t.calls) + " de las llamadas a " + t.name })}></span>`).join("")}</div></td>
          <td class="muted">${icon(open ? "down" : "chevron", "sm")}</td>
        </tr>${open ? `<tr class="breakdown"><td colspan="8"><div class="breakdown-grid">${t.byProject.map((b) =>
          `<div><i class="sw" style="background:${projColor(b.key)}"></i><span class="trunc" title="${esc(b.key)}">${esc(b.label)}</span><span class="n">${int(b.count)}</span><span class="muted" style="width:46px;text-align:right">${pct(b.count / t.calls)}</span></div>`).join("")}</div></td></tr>` : ""}`;
      }).join("") || `<tr class="empty-row"><td colspan="8">No hay llamadas a herramientas en este rango.</td></tr>`}</tbody>
    </table></div></section>
    <p class="note">La duración es el tiempo entre la llamada y su resultado. Hacé click en una fila para ver el detalle por proyecto.</p>
    ${stats.length ? toolMatrix(stats, usedProjects) : ""}
  </div>`;
}

/* Heatmap table: tools (rank order) × projects (fixed order). Single-hue
   sequential shading; the number is always printed, so color never gates. */
function toolMatrix(stats, projects) {
  const counts = (t, p) => t.byProject.find((b) => b.key === p)?.count ?? 0;
  const max = Math.max(...stats.flatMap((t) => projects.map((p) => counts(t, p))), 1);
  return `<section class="panel">
    <div class="panel-h"><h2>Herramienta × proyecto</h2><span class="sub">llamadas · más oscuro = más llamadas</span></div>
    <div class="panel-b flush tbl-wrap"><table class="tbl matrix">
      <thead><tr><th>Herramienta</th>${projects.map((p) => `<th class="proj" title="${esc(p)}"><i class="sw" style="background:${projColor(p)};margin-right:6px"></i>${esc(projName(p))}</th>`).join("")}<th class="num">Total</th></tr></thead>
      <tbody>${stats.map((t) => `<tr><td class="mono" style="font-weight:600;font-size:12px">${esc(t.name)}</td>${projects.map((p) => {
        const n = counts(t, p), a = n ? 0.08 + 0.62 * (n / max) : 0;
        return `<td class="cell ${n ? "" : "zero"}" style="--a:${a.toFixed(2)}" ${tip({ head: `${t.name} · ${projName(p)}`, value: int(n) + " llamadas", foot: pct(n / t.calls) + " de las llamadas a " + t.name })}><span>${n ? int(n) : "—"}</span></td>`;
      }).join("")}<td class="num" style="font-weight:600">${int(t.calls)}</td></tr>`).join("")}</tbody>
    </table></div>
  </section>`;
}

/* ======================================================================
   Screen 5 — Estados (empty / loading / error)
   ====================================================================== */
const ROOT = "C:\\Users\\dev\\.claude\\projects";
const emptyState = () => `<div class="state">
  <div class="icon">${icon("folderSearch")}</div>
  <h2>No encontramos sesiones</h2>
  <p>Buscamos archivos <span class="mono">.jsonl</span> en</p>
  <div class="path">${ROOT}</div>
  <p>y no hay ninguno todavía. Cuando uses Claude Code, tus sesiones van a aparecer acá. Hacé click en <b>Refrescar</b> para volver a buscar.</p>
  <div class="actions"><button class="btn" data-act="refresh">${icon("refresh", "sm")}Refrescar</button></div>
  <div class="fine">${icon("lock", "sm")}La app solo lee esta carpeta. Nunca crea ni modifica archivos.</div>
</div>`;
const loadingState = () => `<div class="state" style="padding-bottom:28px">
  <div class="icon">${icon("refresh", "spin")}</div>
  <h2>Leyendo tus sesiones…</h2>
  <p>Escaneando <span class="mono">${ROOT}</span></p>
  <div class="progress" role="progressbar" aria-valuenow="34" aria-valuemin="0" aria-valuemax="100"><i style="width:34%"></i></div>
  <p class="muted" style="font-size:var(--text-xs)">412 de 1.204 archivos · la primera vez puede tardar unos segundos</p>
</div>
<div class="page" aria-hidden="true">
  <div class="panel kpis">${[0, 1, 2, 3].map(() => `<div class="kpi"><div class="skel" style="height:12px;width:40%"></div><div class="skel" style="height:26px;width:60%"></div><div class="skel" style="height:10px;width:80%"></div></div>`).join("")}</div>
  <div class="panel" style="padding:16px"><div class="skel" style="height:150px"></div></div>
</div>`;
function detailError(id, kind, s) {
  const notFound = kind === "notFound";
  const path = `${ROOT}\\C--Users-dev-Desktop-dev-dashboard-v1\\${id}.jsonl`;
  return `<div class="state">
    <div class="icon err">${icon(notFound ? "folderSearch" : "fileX")}</div>
    <h2>${notFound ? "No encontramos esta sesión" : "No pudimos leer esta sesión"}</h2>
    <p>${notFound ? "Puede que el archivo se haya movido o borrado desde el último escaneo." : "El archivo existe pero no se pudo abrir. Puede estar bloqueado por otro proceso o sin permisos de lectura."}</p>
    <div class="err-box">${notFound ? `notFound: ${esc(id)}` : `io: ${esc(path)}<br>El proceso no tiene acceso al archivo porque está siendo utilizado por otro proceso. (os error 32)`}</div>
    <div class="actions">
      <a class="btn" href="${href("sesiones")}">Volver a sesiones</a>
      <button class="btn ghost" data-act="refresh">${icon("refresh", "sm")}Refrescar</button>
    </div>
    <div class="fine">${icon("lock", "sm")}No se modificó ningún archivo.</div>
  </div>`;
}
const scanError = () => `<div class="state">
  <div class="icon err">${icon("alert")}</div>
  <h2>No pudimos leer la carpeta de sesiones</h2>
  <p>Revisá que exista y que tu usuario tenga permiso de lectura.</p>
  <div class="err-box">io: ${ROOT}<br>Acceso denegado. (os error 5)</div>
  <div class="actions"><button class="btn" data-act="refresh">${icon("refresh", "sm")}Reintentar</button></div>
</div>`;
const BAD_FILES = [
  ["C--Users-dev-Desktop-dev-dotfiles\\4f1c2a9e-0b7d-4d1e-9a51-2c3e8f6b7a10.jsonl", "línea 214: JSON inválido"],
  ["C--Users-dev-Desktop-dev-inventory-service\\9b2e77c4-5a1f-4c8e-b3d2-0e6f1a2b3c4d.jsonl", "io: archivo en uso (os error 32)"],
];
const warnBanner = () => `<div class="banner" role="status">
  ${icon("alert")}<div><b>${BAD_FILES.length} archivos no se pudieron leer</b> y no aparecen en la lista. El resto de las sesiones está completo.
  ${S.bannerOpen ? `<ul class="banner-list">${BAD_FILES.map(([f, e]) => `<li><span class="mono trunc" title="${esc(f)}">${esc(f)}</span><span class="muted">${esc(e)}</span></li>`).join("")}</ul>` : ""}</div>
  <button class="btn ghost sm" data-act="toggle-banner">${S.bannerOpen ? "Ocultar" : "Ver archivos"}</button>
</div>`;

function screenEstados() {
  const anyId = D.sessions[0].id;
  const frame = (title, desc, link, body, pageBg, wide) => `<section class="frame ${wide ? "wide" : ""}">
    <div class="frame-h"><b>${title}</b><span>${desc}</span>${link ? `<a href="${link}">Ver en la app →</a>` : ""}</div>
    <div class="frame-b ${pageBg ? "page-bg" : ""}">${body}</div></section>`;
  return `<div class="page states-page">
    <h1>Estados</h1>
    <p class="intro">Variantes de pantalla para los casos borde. Cada una se puede abrir dentro de la app con “Ver en la app”. El botón Refrescar de la barra superior muestra el estado de re-escaneo con datos: el contenido queda visible y atenuado mientras se actualiza.</p>
    <div class="frames">
    ${frame("Vacío", "no hay archivos en ~/.claude/projects", href("resumen", { estado: "vacio" }), emptyState())}
    ${frame("Error al escanear la carpeta", "list_sessions falla por completo", href("sesiones", { estado: "error" }), scanError())}
    ${frame("Primer escaneo", "carga inicial, sin datos previos", href("resumen", { estado: "cargando" }), loadingState(), true, true)}
    ${frame("Error de lectura de una sesión", "AppError io en get_session", href("sesion/" + anyId, { estado: "error" }), detailError(anyId, "io"))}
    ${frame("Sesión no encontrada", "AppError notFound en get_session", href("sesion/no-existe"), detailError("no-existe", "notFound"))}
    ${frame("Aviso: archivos ilegibles durante el escaneo", "propuesta — necesita un campo nuevo en el contrato", href("sesiones", { estado: "aviso" }), warnBanner(), true, true)}
    ${frame("Sin resultados", "los filtros no coinciden con ninguna sesión", href("sesiones", { q: "kubernetes" }),
      `<table class="tbl"><tbody><tr class="empty-row"><td>Ninguna sesión coincide con los filtros.<br><button class="btn sm" style="margin-top:10px" data-act="clear-filters">Limpiar filtros</button></td></tr></tbody></table>`, false, true)}
    </div>
  </div>`;
}

/* ======================================================================
   Render loop
   ====================================================================== */
const content = document.getElementById("content");
function render() {
  const { route, arg, q } = parseHash();
  S.mode = q.get("estado");
  TIPS.clear(); CHARTS.clear(); hideTip();
  let crumbs = "", html = "";
  const titles = { resumen: "Resumen", sesiones: "Sesiones", proyectos: "Proyectos", herramientas: "Herramientas", estados: "Estados" };
  if (route === "sesion") {
    // Deep links from the session dashboard: open the target before rendering.
    if (q.get("call")) S.open.add("c:" + q.get("call"));
    if (q.get("sub")) S.open.add("s:" + q.get("sub"));
    ({ crumbs, html } = screenSesion(arg, q));
  } else if (route === "proyecto" && !["vacio", "cargando", "error"].includes(S.mode)) ({ crumbs, html } = screenProyecto(arg));
  else {
    crumbs = `<span class="cur">${titles[route] ?? "Resumen"}</span>`;
    if (route !== "estados" && S.mode === "vacio") html = emptyState();
    else if (route !== "estados" && S.mode === "cargando") html = loadingState();
    else if (route !== "estados" && S.mode === "error") html = scanError();
    else html = route === "sesiones" ? screenSesiones(q) : route === "proyectos" ? screenProyectos(q) : route === "herramientas" ? screenHerramientas() : route === "estados" ? screenEstados() : screenResumen();
  }
  renderNav(route);
  renderTopbar(route, crumbs);
  content.innerHTML = html;
  content.classList.toggle("refetching", S.scanning);
  fillSessions();
  fillProjects();
  mountCharts(content);
  const target = q.get("msg") ? "m:" + q.get("msg") : q.get("call") ? "c:" + q.get("call") : q.get("sub") ? "s:" + q.get("sub") : null;
  const el = target && document.getElementById(target);
  if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); }
}
function rerenderKeepScroll() { const y = content.scrollTop; render(); content.scrollTop = y; }

/* ======================================================================
   Events
   ====================================================================== */
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-act]");
  const go = e.target.closest("[data-go]");
  if (!a && go && !e.target.closest("a")) { location.hash = go.dataset.go; return; }
  if (!a) {
    if (S.rangePop && !e.target.closest(".range")) { S.rangePop = false; rerenderKeepScroll(); }
    return;
  }
  const act = a.dataset.act, k = a.dataset.k;
  switch (act) {
    case "theme":
      S.theme = a.dataset.v;
      S.theme === "system" ? document.documentElement.removeAttribute("data-theme") : document.documentElement.setAttribute("data-theme", S.theme);
      return renderNav(parseHash().route);
    case "range": setPreset(a.dataset.v); S.rangePop = false; return rerenderKeepScroll();
    case "range-pop": S.rangePop = !S.rangePop; return rerenderKeepScroll();
    case "range-apply": {
      let from = document.getElementById("r-from").value, to = document.getElementById("r-to").value;
      if (from && to) { if (from > to) [from, to] = [to, from]; S.range = { preset: "custom", from, to }; }
      S.rangePop = false; return rerenderKeepScroll();
    }
    case "refresh": return refresh();
    case "sort": {
      const st = S.sort[a.dataset.table], key = a.dataset.key;
      S.sort[a.dataset.table] = { key, dir: st.key === key ? -st.dir : ["title", "project", "name", "branch", "model"].includes(key) ? 1 : -1 };
      return rerenderKeepScroll();
    }
    case "toggle": {
      S.open.has(k) ? S.open.delete(k) : S.open.add(k);
      const el = document.getElementById(k);
      if (el) { el.setAttribute("open-state", S.open.has(k) ? 1 : 0); a.setAttribute("aria-expanded", S.open.has(k)); }
      return;
    }
    case "toggle-think": case "toggle-tool": S.open.has(k) ? S.open.delete(k) : S.open.add(k); return rerenderKeepScroll();
    case "expand-all": case "collapse-all":
      for (const el of document.querySelectorAll("#timeline .call, #timeline .subagent")) {
        act === "expand-all" ? S.open.add(el.id) : S.open.delete(el.id);
      }
      return rerenderKeepScroll();
    case "next-error": {
      const errs = [...document.querySelectorAll("#timeline .call.err")];
      const top = content.getBoundingClientRect().top + 60;
      const next = errs.find((el) => el.getBoundingClientRect().top > top + 4) ?? errs[0];
      if (!next) return;
      S.open.add(next.id); next.setAttribute("open-state", 1);
      next.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    case "clear-filters": location.hash = href("sesiones"); return;
    case "toggle-banner": S.bannerOpen = !S.bannerOpen; return rerenderKeepScroll();
    case "trend-metric": S[a.dataset.scope ?? "trend"].metric = a.dataset.v; return rerenderKeepScroll();
    case "provider":
      S.provider = a.dataset.v;
      document.documentElement.setAttribute("data-provider", S.provider);
      return rerenderKeepScroll();
    case "trend-group": S[a.dataset.scope ?? "trend"].group = a.dataset.v; return rerenderKeepScroll();
  }
});

let searchTimer;
document.addEventListener("input", (e) => {
  if (e.target.id === "f-psearch") {
    const { q } = parseHash();
    e.target.value.trim() ? q.set("q", e.target.value.trim()) : q.delete("q");
    history.replaceState(null, "", "#/proyectos" + (q.toString() ? "?" + q : ""));
    TIPS.clear(); return fillProjects();
  }
  if (e.target.id !== "f-search") return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => updateFilter("q", e.target.value.trim()), 120);
});
document.addEventListener("change", (e) => {
  if (e.target.id === "f-project") updateFilter("proyecto", e.target.value);
  if (e.target.id === "f-model") updateFilter("modelo", e.target.value);
});
function updateFilter(k, v) {
  const { q } = parseHash();
  v ? q.set(k, v) : q.delete(k);
  history.replaceState(null, "", "#/sesiones" + (q.toString() ? "?" + q : ""));
  TIPS.clear();
  fillSessions();
}

function refresh() {
  if (S.scanning) return;
  S.scanning = true; S.scanDone = 0;
  const { route } = parseHash();
  renderTopbar(route, document.querySelector(".crumbs").innerHTML);
  content.classList.add("refetching");
  const t = setInterval(() => {
    S.scanDone = Math.min(S.scanTotal, S.scanDone + 97);
    if (S.scanDone >= S.scanTotal) {
      clearInterval(t); S.scanning = false; S.lastScan = Date.now();
      return rerenderKeepScroll();
    }
    renderTopbar(route, document.querySelector(".crumbs").innerHTML);
  }, 110);
}

window.addEventListener("hashchange", () => { content.scrollTop = 0; render(); });
render();
