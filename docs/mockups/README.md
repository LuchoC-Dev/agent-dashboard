# Mockups v1 — visual spec

Navigable HTML prototypes of the dashboard. **Open `docs/mockups/index.html` in a browser**
(it works from `file://`: no build step, no server). They are the visual spec for the React implementation.

| File | What it is |
|---|---|
| `index.html` | App shell (sidebar + topbar + content) |
| `tokens.css` | **All design tokens, in one place**: colors (light and dark), type, spacing, radii |
| `app.css` | Components and layout. Uses only tokens |
| `app.js` | Hash router, data layer (mirrors `src/api.ts`), screens, SVG charts, tooltips |
| `mock-data.js` | Generated from `src/mocks/mock-data.json` by `npm run mockups:data`. Do not edit |

Routes: `#/resumen` · `#/sesiones?q=&proyecto=&modelo=` · `#/sesion/<id>?vista=resumen|conversacion&msg=&call=&sub=` ·
`#/proyectos?q=` · `#/proyecto/<encoded projectPath>` · `#/herramientas` · `#/estados`.
Mockup-only helpers: `?theme=dark|light` before the `#` forces a theme, `?provider=claude|codex` picks the primary color
(also switchable from the sidebar, under "Proveedor"), and `estado=vacio|cargando|error|aviso`
in the hash puts any screen into that state (the **Estados** page links to every case).

All data follows `src/bindings/*.ts`. **Mockup-only enrichment:** the shared sample data has one version per model
family, so `scripts/gen-mockup-data.mjs` relabels the older sessions to earlier versions (Opus 5.0 and 4.8, Sonnet 5.0)
to preview the family shades. Only model ids change; the shape is the same. The mockup recomputes `Metrics`/`ToolStat` for each date range
on the client, which is what `get_metrics(range)` / `get_tool_stats(range)` will return.

---

## Design direction

A daily developer tool: **dense, calm, easy to scan.** The palette is warm neutral and nearly monochrome,
so the data carries the color. Each kind of entity has its own color rule: **models** are colored by family (hue) and version (shade), and
**projects** and other categories use a separate categorical palette. Models and projects are never in the same chart, so the two palettes may reuse hues. Panels are separated by hairlines rather than shadows. The one hero number
is the estimated cost. Every numeric column uses tabular figures and is right-aligned. Paths, tool names,
branches and ids are set in mono. Status colors are reserved and always come with an icon or a word.
Read-only is shown quietly: a lock with "Solo lectura · Lee ~/.claude/projects" in the sidebar footer,
tooltips on Refrescar ("no modifica nada"), and a line on the empty and error states. There are no edit,
delete, "open in editor" or "resume" actions anywhere.

- **Fonts:** IBM Plex Sans (UI) and IBM Plex Mono (code, paths), from Google Fonts. Both fall back to system fonts.
- **Locale:** `es-AR` formatting everywhere: `1.234.567`, `7,6 %`, `US$ 13,80` (always `US$`: in Argentina a bare `$` means pesos).
  Dates look like `4 oct 13:12`, `hoy 13:12`, `ayer 06:07`. Durations look like `820 ms`, `40,0 s`, `20 min`, `1 h 05 min`. Tokens are compacted to `342 k` and `19,3 M`.
- **UI copy:** rioplatense ("Hacé click", "Revisá", "Vos" for the user's own prompts).

## Design tokens (`tokens.css`)

The token names already follow the **Tailwind v4 `@theme` namespaces** (`--color-*`, `--font-*`, `--text-*` with
`--text-*--line-height`, `--radius-*`, `--spacing`). Porting is mechanical:

```css
/* src/index.css */
@import "tailwindcss";

@theme {
  /* paste the contents of the `:root { … }` block from tokens.css (the light values) */
  --color-page: #f5f5f2;
  --color-surface: #fcfcfb;
  /* … */
}

/* paste the two dark blocks from tokens.css unchanged (plain CSS, outside @theme) */
@media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) { --color-page: #111110; /* … */ } }
:root[data-theme="dark"] { --color-page: #111110; /* … */ }
```

Tailwind compiles utilities to `var(--color-…)`, so `bg-surface text-ink border-line` switches themes on its own:
components need **no `dark:` variants**. Classes that come out of this: `bg-page`, `bg-surface`, `bg-sunken`,
`border-line`, `text-ink`/`text-ink-2`/`text-ink-3`, `text-accent`, `text-error`, `bg-error-wash`, `bg-opus-1`, `bg-series-1`, `text-xs`,
`font-mono`, `rounded-sm`, `rounded-md`. Recharts takes colors as `fill="var(--color-series-1)"`, `fill={modelColor(id)}` or `fill={projColor(path)}`.

### Color

#### Primary color, by provider (swappable)
The final primary color is not decided yet, and it follows the **active provider**: Claude has a Claude color, Codex a Codex color,
and so on. It lives in **one place**: the `--brand-*` variables in `tokens.css`, selected with `<html data-provider="claude|codex">`.
Components never use a hex value or a `--brand-*` variable directly. They use the semantic tokens derived from it:

| Semantic token | Derived from | Used for |
|---|---|---|
| `primary` | `--brand-base` | Single-measure charts (Por día with *Total*), heatmap cells, inline bars (tools), brand mark |
| `primary-alt-1` / `-alt-2` / `-alt-3` | `--brand-alt-*` | Analogous variations of the primary (token kinds, secondary series such as files or output tokens) |
| `accent`, `accent-wash`, `accent-ink` | `--brand-ink`, `--brand-wash`, `--brand-on` | Links, selected segment/KPI/nav, focus ring, text on a primary fill |
| `tok-cache-read` | `--brand-base` | Cache read (~90 % of tokens) takes the primary itself |
| `tok-output` | `--brand-alt-1` | |
| `tok-cache-write` | `--brand-alt-2` | |
| `tok-input` | `--brand-alt-3` | |

The provider palette is **not a monochrome ramp**: base plus three *analogous* variations (same color family, hue shifted and
lightness varied), so stacked series are easy to tell apart while still reading as "the provider's color".

| Provider | Light: base · alt-1 · alt-2 · alt-3 | Dark: base · alt-1 · alt-2 · alt-3 | Link text (light / dark) |
|---|---|---|---|
| `claude` (default; placeholder) terracotta · wine · amber · red | `#d67555` `#992641` `#e8a127` `#cc3e38` | `#d5714d` `#a33460` `#bc8800` `#c83439` | `#b15334` / `#f48f6e` |
| `codex` (placeholder) blue · violet · celeste · indigo | `#3f6bdc` `#6f309c` `#3fb3df` `#7970d5` | `#507adf` `#7d43a8` `#34a1c6` `#6e64c8` | `#3459c0` / `#8fb0f5` |
| `all` (app color; placeholder) emerald · forest · lime · pine | `#0dae64` `#156700` `#a3c01a` `#00866f` | `#00ac7d` `#23710a` `#8da000` `#00866f` | `#0b7a48` / `#4fd19a` |

- **"Todos" uses the app color (v2.1).** With several providers on screen, `data-provider="all"` selects a neutral app palette,
  clearly apart from Claude's warm reds and Codex's blues, so nothing provider-scoped (selected KPI bar, *Total* series, token kinds,
  heatmap, inline bars) reads as Claude data. One provider selected, or a session detail, keeps that provider's color. Placeholder until
  the app accent is decided; it lives only in the `all` block.

- Token kinds stack bottom → top as **cache read (base) · output (alt-1) · cache write (alt-2) · input (alt-3)**. The order alternates hues
  so neighbors differ, and each set passes the categorical validator on that adjacent order in both themes. Light amber/celeste are below 3:1
  against the surface, so the legend and tooltip always print names and values.
- Single-measure charts and heatmaps stay **single-hue** (`primary`), because magnitude must read as one ramp.
- **To change a color or add a provider:** edit or add its `--brand-*` block (light, plus dark under the OS preference and under the forced theme),
  then validate base · alt-1 · alt-2 · alt-3 as an adjacent categorical set. Nothing else changes. In React, set `document.documentElement.dataset.provider` from the active `SessionSource`
  (or from `SessionSummary.provider` when one provider is filtered).
- Model families follow **their own** provider (see below), never the active one. The project palette and status colors do not follow any provider.

#### Base palette

| Token | Light | Dark | Use |
|---|---|---|---|
| `page` | `#f5f5f2` | `#111110` | App background, sidebar, topbar |
| `surface` | `#fcfcfb` | `#181817` | Panels, tables, chart surface |
| `sunken` | `#efeeea` | `#21211f` | Row hover, user prompt bubble, code blocks |
| `raised` | `#ffffff` | `#262624` | Popovers, tooltip |
| `line` / `line-strong` | `#e3e2dc` / `#c9c8bf` | `#2c2c2a` / `#3e3e3a` | Hairlines and gridlines / inputs and chart baseline |
| `ink` → `ink-4` | `#1b1b19` `#4f4e4a` `#6e6c66` `#9b9a93` | `#ecebe6` `#c3c2b7` `#94928a` `#64635d` | Primary, secondary, muted (≥ 4.5:1), decorative only |
| `accent` / `accent-wash` | from the provider (below) | | Links, selection, focus, selected KPI/segment |
| `ok` / `error` / `warn` | `#0a7d0a` / `#b72f2f` / `#8a5a00` | `#3cc23c` / `#f07c7c` / `#f2c14e` | Status text and icons. Always with an icon or word |
| `*-mark`, `*-wash` | | | Status fills (meters) and tinted backgrounds (error row, banner) |

**Model families (v2.1: colored by their provider).** Claude families are analogous tones of Claude's warm palette (crimson ·
wine · red · salmon · amber · gold), Codex families tones of Codex's cool one (blue · violet · celeste · indigo). Each family keeps its
own hue band; its versions are **clearly distinct tones within it** (lightness and hue steps, not a monochrome ramp). `-1` is the newest
version, `-2` and `-3` are older ones, and a 4th or older version reuses `-3`.

| Family | `-1` newest (light / dark) | `-2` (light / dark) | `-3` (light / dark) |
|---|---|---|---|
| Opus — crimson · rose · wine | `#d53359` / `#bf729a` | `#e396b9` / `#9d3d58` | `#8e3165` / `#f73571` |
| Sonnet — salmon · brick · red | `#e6938c` / `#bf2d03` | `#853d31` / `#c7796a` | `#ec4c40` / `#8f4541` |
| Haiku — gold · brown · amber | `#c9af60` / `#bd774f` | `#7f4303` / `#855101` | `#d37200` / `#ab9300` |
| Sol — navy · sky · blue | `#1d51a5` / `#3083fc` | `#7faeeb` / `#375fa0` | `#266bef` / `#5699cf` |
| Terra — plum · orchid · violet | `#7f3f7e` / `#9f5997` | `#c682ca` / `#7a22c6` | `#7f38d4` / `#a36fde` |
| Luna — celeste · petrol · teal | `#22c0ff` / `#179c98` | `#00698f` / `#00698f` | `#20ada9` / `#06a1d9` |
| Mini — lavender · indigo · periwinkle | `#9b60fe` / `#4348cf` | `#514e90` / `#8a88d0` | `#92a5f2` / `#515d9f` |
| `family-other` | `#a9a79f` / `#6b6a64` | | unknown model id |

- Validation (`src/styles/palettes.test.ts`, the dataviz validator's checks): the 21 colors pass as **one adjacent set in stack order**
  (opus-1 … haiku-3, sol-1 … mini-3) in both themes: lightness band, chroma ≥ 0.1, normal-vision ΔE ≥ 15 and red–green CVD ΔE ≥ 8
  (worst 11.2 light / 9.3 dark). `-1` and `-3` of a family, which meet when `-2` is filtered out, stay ≥ 9.5 / CVD ≥ 5.5 apart (floor
  band, legal because the model name is always printed). The test also checks every Claude step is warm and every Codex step cool.
- **Assignment** (`modelColor()`): rank the family's versions from the **whole dataset** (newest first) and use `-min(rank, 3)`.
  Because ranks come from all data and not from the filtered slice, filtering never repaints a model.
- Wherever models are listed, they are grouped by family (Opus, Sonnet, Haiku, Sol, Terra, Luna, Mini, then others) and sorted newest first.
- **Automatic reviews are not a model.** `codex-auto-review` is Codex's guardian reviewer: it is left out of model lists, families, the
  "Por modelo" trend and session badges. "Por modelo" closes the Codex block with a separate **Revisiones automáticas** row (tokens, cost,
  unpriced marker) in `--color-review` (`#7970d5` / `#6e64c8`), so provider totals still add up.

**Projects (and branches): categorical palette by usage rank (v2.1).** 16 slots: eight hues, then the same eight hues at another
lightness. Projects take slots by **usage rank within the current view** (tokens, then sessions, among the sessions on screen), so the
most used projects always get the first, most distinct colors; projects outside the view follow, ranked over the whole dataset. With more
than 16 projects the palette repeats. **Never gray, no "Otros" folding.** Validated as one adjacent set in rank order, including the
wrap from slot 16 back to 1 (CVD ΔE ≥ 9.1 light / 8.4 dark, normal ≥ 16.9); each hue's two lightness steps stay ≥ 10 apart.

| Slots | Light | Dark |
|---|---|---|
| 1–8: blue · orange · aqua · yellow · magenta · violet · cyan · red | `#2a78d6` `#eb6834` `#1baf7a` `#eda100` `#e87ba4` `#7f44b1` `#41bdda` `#ba3c4a` | `#3987e5` `#d95926` `#199e70` `#c98500` `#d55181` `#ae6af1` `#1da2c0` `#9f3e37` |
| 9–16: same hues, other lightness | `#69a1e0` `#94390d` `#057c5e` `#ba833c` `#a03871` `#ae6ff1` `#02859c` `#f16f5d` | `#3f6ca4` `#9f3f1b` `#077b60` `#9b6306` `#ab0d71` `#7343c4` `#01809d` `#ce6f66` |

The static mockup (`tokens.css`, `app.js`) predates these v2.1 rules; `src/styles/theme.css` is the reference.

Token kinds use the provider palette (see above): cache read takes the base color (~90 % of the volume), and the other kinds the analogous variations. Their names and values are always printed in the legend and the tooltip.
Tool calls split by status use `primary` (sin error) and `error-mark` (con error), always with a legend.
Three light-mode series colors are below 3:1 against the surface. That is why every chart also has visible numbers, a legend or a table next to it.

### Type scale

| Token | Size / line | Use |
|---|---|---|
| `text-2xs` | 10.5 / 14 | Chart ticks, timeline timestamps |
| `text-xs` | 11.5 / 16 | Labels, table headers, meta, legends |
| `text-sm` | 12.5 / 18 | Table cells, panel titles (600) |
| `text-base` | 13.5 / 20 | Body, conversation text |
| `text-lg` | 15 / 22 | Topbar title, empty-state title |
| `text-xl` | 19 / 26 | Session title (detail) |
| `text-hero` | 30 / 36 | **One per view**: the estimated cost on Resumen |
| KPI value | 24 / 30, 600 | Other KPI figures |

Weights are 400 / 500 / 600. Tables use `tabular-nums`, and large standalone figures keep proportional digits.

### Spacing, radii, sizes

4px grid (`--spacing: 4px`). Content padding is 20 (12 below 900px), panel padding 16, and the gap between panels 16.
Table row 34, dense row (tool call) 28, topbar 52, sidebar 208 (collapses to 56 below 1100px).
`radius-sm` 3px for inputs, chips and buttons. `radius-md` 5px for panels and popovers. Bars have a 2–3px rounded data end and stay square at the baseline.
Shadows (`shadow-pop`) only on floating layers.

---

## Screens

### Shell
- **Sidebar:** brand (mark in `primary`, subtitle = provider name), nav (Resumen, Sesiones and Proyectos with counts, Herramientas), and a footer with the read-only note and a theme switch (Sistema / Claro / Oscuro).
  "Estados" is in a "Mockup" group and **does not ship**.
- **Topbar:** breadcrumb title · **date range** (range label + presets `7 días · 30 días · 90 días · Todo` + calendar button → popover with
  Desde/Hasta) · scan status ("Escaneado hace 4 min", or "Escaneando… 412 de 1.204" with a 64px progress bar) · **Refrescar**.
  The range is global and applies to Resumen, Sesiones and Herramientas. It is hidden on the session detail.
- **Refrescar behavior:** the content stays visible at 55 % opacity with no layout jump, and the topbar shows progress. Afterwards, everything re-renders.

### 1. Resumen
Everything on this screen is aggregated on the client from `list_sessions(range)` (`SessionSummary`: `startedAt` day, `costUsd`, `usage`,
`durationMs`, `toolCallCount`/`toolErrorCount`, `messageCount`, `models[0]`, `projectPath`) plus `get_metrics(range)`. **No contract change is needed.**

1. **KPI strip:** one panel split by hairlines into 5 cells (2 + 3 below 1100px). **Each KPI is a button: a click selects that metric in the
   chart below**, and the selected one gets a 2px accent bar on top.
   Costo estimado (hero, per session and per day) · Tokens (total, cache share, a 6px stacked bar of the 4 kinds, a 2×2 legend with short labels) ·
   Tiempo activo (sum of session durations, per session and per day) · Sesiones (messages, subagents) · Llamadas a herramientas ("⊗ N con error · x %").
2. **Por día** (the main chart): stacked columns, one per day of the range.
   - **Metric** (segmented): Costo · Tokens · Tiempo activo · Sesiones · Herramientas · Mensajes.
   - **Grouping** (segmented): **Total** · **Por modelo** (family/version shades; each session counts once, under its main model `models[0]`) ·
     **Por proyecto** (project palette). With *Total*, Tokens stacks the 4 token kinds and Herramientas stacks *sin error* / *con error*. The other metrics are a single series.
   - Summary line: range total, average per day, and the busiest day for that metric. A legend appears when there are 2 or more series.
   - One Y axis formatted for the metric (`US$ 1`, `1,0 M`, `1,5 h`, `20`), hairline gridlines, and an average reference line labeled on the right.
     Segments have a 2px surface gap, and only the top one gets the rounded end.
   - Hover/focus shows a band and a tooltip: day, total, one row per non-zero series, and "N sesiones · hacé click para verlas".
     **Click a column → Sesiones filtered to that day.**
   - Recharts: `<BarChart>` with one `<Bar stackId="a" fill={color} stroke="var(--color-surface)" strokeWidth={2}>` per series, `<YAxis tickFormatter>`,
     `<ReferenceLine y={avg}>`, `<Tooltip content={<ChartTooltip/>} cursor={{ fill: "var(--color-sunken)" }}>`.
3. **Uso por hora** (left, wider): a heatmap with weekdays (lun–dom) as rows and 24 hours as columns, in Argentina time (UTC−3, no DST).
   Each session's span is split across the hours it covers. Cells mix `primary` into `sunken` (15–100 %). The tooltip shows weekday · hour, active
   time and session count. The footer shows the peak hour, the most active weekday, and a "menos … más" scale. Build it as a CSS grid, not a chart.
4. **Herramientas más usadas** (right): the top 7 tools in range (subagents included): name (mono), calls with an inline `primary` bar,
   errors (⊗ n + rate), and average duration. "Ver todas →" and every row go to Herramientas.
5. **Por proyecto** (left; stacked below 1100px): project swatch + name, sessions, tokens, cost, and an inline cost bar in the project color.
   A row click goes to Sesiones filtered by that project.
   **Por modelo** (right): a 100 % share bar of cost with segments ordered family → version and a wider 5px gap between families. Below it, a table
   grouped by family: a **family row** (base swatch, "Opus · 3 versiones", totals summed from `byModel`) followed by its **version rows** (dot in
   the version shade, name and id, sessions, tokens, cost, %). A version row click goes to Sesiones filtered by that model. The note explains that a
   session using several models has its cost split between them (the same as `by_model`).
6. **Sesiones recientes:** the 7 latest in range, plus "Ver todas (N) →".

### 2. Proyectos (`#/proyectos`)
- **Filter row:** search (name and path) plus a summary at the right ("5 proyectos · US$ 13,80 · range"). The global date range applies.
- **Table**, sortable (default Costo ↓): Proyecto (project swatch + name, full path on hover) · Sesiones · Última actividad ·
  **Costo por día** (a 120 × 22 px sparkline of the range, `primary`) · Ramas (count, list on hover) · Modelos (version dots, names on hover) ·
  Tiempo activo · Herram. (calls + ⊗ errors) · Tokens (breakdown tooltip) · Costo. A row click opens the project.
  Only projects with sessions in the range are listed. Everything is rolled up from `SessionSummary` (`getProjects()` in `app.js`).

### 2b. Proyecto (`#/proyecto/<path>`)
The Resumen dashboard **scoped to one project** (all panels take a `{ projectPath }` filter):
- **Header:** project name with its swatch, full path (mono), branches as chips, first session, last activity, all-time session count.
- KPI strip · **Por día** with groupings **Total / Por modelo / Por rama** (branches use the categorical palette; sessions count in the
  branch where they started). A column click goes to Sesiones filtered by project and day.
- Uso por hora · Herramientas más usadas · Por modelo · **Archivos más tocados** (top files from `Read`/`Edit`/`Write` `file_path`:
  reads, edits, writes, total) · **Sesiones del proyecto** (the Sesiones columns minus Proyecto, plus "Abrir en Sesiones →").
- With no sessions in the range: an inline empty state with "Ver todo". An unknown path shows "No encontramos este proyecto".
- Everywhere a project name appears (Resumen "Por proyecto", the session header), it links here.

### 3. Sesiones
- **Filter row** (one line, above the table): search (title, first prompt, project) · project select · model select · "Limpiar filtros" when
  active · a summary at the right ("28 sesiones · US$ 13,80 · range"). Filters live in the URL query.
- **Table**, sortable on every column (▲/▼, `aria-sort`; text sorts ascending first, numbers descending first). Default sort: Inicio ↓.
  Columns: Sesión (title, or “first prompt” in secondary ink when there is no title, plus a subagent badge) · Proyecto (full path on hover) · Rama (mono) ·
  Modelo (dot in the version shade + name of the main model, extra models as dots only, full list on hover; the model filter is a select grouped by family with `<optgroup>`) · Inicio · Duración · Msjs. · Herram. (count + red ⊗ errors) ·
  Tokens (breakdown tooltip) · Costo. The whole row is clickable, and the title is a real link for the keyboard.
- **Narrow widths:** `col-p3` (Rama, Msjs.) is hidden below 1240px and `col-p2` (Duración) below 1100px. The table scrolls inside its panel and never the page.
- **No results:** a row reading "Ninguna sesión coincide con los filtros." plus "Limpiar filtros".

### 4. Detalle de sesión
- **Header:** title (falls back to the first prompt), first prompt in quotes, and a meta line (project → link to the project, branch, date, duration, models, cost).
- **Tabs:** **Resumen** (default) · **Conversación** (`?vista=conversacion`). The header stays on both.
- **Resumen tab** (a quick dashboard of one `SessionDetail`):
  - KPI strip: Costo (subagent share) · Tokens (bar + legend) · Duración (time in tools; idle time on hover) · Mensajes (prompts vs answers) ·
    Llamadas a herramientas (errors).
  - **Por respuesta:** one column per assistant message in order (x = time). Metric: **Tokens** (stacked by kind) · **Contexto** (cache read
    per turn, i.e. how much context is re-sent) · **Salida** · **Herramientas** (ok / error). A column click opens the conversation at that
    message (`msg=`, scrolled and briefly highlighted).
  - **Herramientas** (calls, errors, total time) · **Archivos más tocados** · **Subagentes** (type, model, duration, calls, cost; click →
    conversation with that subagent expanded, `sub=`) · **Errores** (time, tool, key argument; click → conversation with that call expanded, `call=`).
- **Conversación tab:** unchanged (below).
- **Timeline** (main column): a sticky toolbar ("Conversación · 12 mensajes · 17 llamadas · ⊗ 1 con error · 3 subagentes", plus *Siguiente error*,
  *Expandir todo*, *Contraer*). Every event has a timestamp column, a vertical rail with a dot (filled for user prompts), and a body.
  - **User prompt:** "Vos" (or "Prompt del agente" inside a subagent) and a sunken bubble.
  - **Assistant:** "Claude" plus a model dot and name, then its blocks in order, then a token footer (output, cache read, cache write, input).
  - **Thinking:** a quiet one-line marker ("··· Razonamiento · sin contenido en el log"). A click reveals a note explaining that the log
    does not store the text (if `text` is ever non-empty, it shows the text there instead).
  - **Tool calls:** consecutive calls are grouped in one bordered list. Each row: chevron · status (muted ✓, or red ⊗) · **name** (mono 600) ·
    key argument (mono, truncated: `file_path`, `command`, `pattern`, `query`, `subagent_type · description`) · duration, plus the word "error".
    An error row has `error-wash`. Expanded: **Entrada** (pretty JSON with keys highlighted), **Resultado** (red block on error; "Sin resultado registrado" when null), and the id.
  - **Subagents:** a collapsible block with a left rule. The header shows type, model, duration, messages, calls, errors, tokens and cost. Inside is the same timeline, recursively.
    Placement: **nested under the `Agent` call whose id matches `parentToolCallId`**. When that is null, the block is placed by time, as its own event after the last message before its `startedAt`.
    *(The sample data has no `parentToolCallId`, so the mockup links subagents to Agent calls in order, only to preview the nested layout. See `linkSubagents()`.)*
  - **Idle gaps** over 3 min show a dashed rail with "N min sin actividad".
- **Side panel** (320px and sticky; stacked below 1100px): **Tokens y costo** (cost, a stacked bar, and input / output / cache read / cache write
  with exact counts and %, then the cost split into main session vs subagents) · **Sesión** (project path, branch, CLI version, start, end,
  duration, messages, provider, id) · **Herramientas** (per-tool count bar and errors, subagents included).

### 5. Herramientas
- Summary line (tools, calls, errors and rate, "incluye subagentes", range) plus a **project legend** (identity is never color alone).
- **Ranking table**, sortable: # (rank by calls) · Herramienta · Llamadas (number + bar) · Errores (⊗ n) · Tasa de error (a small meter + %) ·
  Duración prom. · **Llamadas por proyecto** (a stacked bar in project colors, in fixed project order, with 2px gaps and a tooltip per segment).
  A row click expands the per-project breakdown.
- **Herramienta × proyecto:** a heatmap table (`series-1` shading, with the number always printed) as the accessible table view of the stacks.

### 6. Estados (`#/estados`)
| State | Where | Content |
|---|---|---|
| Vacío | any screen | Folder icon, "No encontramos sesiones", the scanned path, Refrescar, and the read-only note |
| Primer escaneo | any screen | Spinner, progress bar "412 de 1.204 archivos", skeleton of the KPI strip and chart |
| Refrescando | topbar | Content dimmed in place, progress in the topbar (try Refrescar) |
| Error de lectura | detail | `AppError { kind: "io" }`: error icon, explanation, mono error box with path + OS error, *Volver a sesiones*, *Refrescar* |
| No encontrada | detail | `AppError { kind: "notFound" }` (e.g. `#/sesion/no-existe`) |
| Error de carpeta | list | `list_sessions` fails entirely (permission denied) plus *Reintentar* |
| Aviso parcial | list | Banner "2 archivos no se pudieron leer…" plus *Ver archivos*. **Needs a contract addition** (see below) |
| Sin resultados | list | Filter empty row |

## Reserved for expanded views
- **Duración de las sesiones** (not on Resumen; for the expanded Sesiones view): a histogram (`< 5 min`, `5–15`, `15–30`, `30–60 min`, `1–2 h`,
  `> 2 h`) with the count on each column cap, plus median and longest in the header. The tooltip shows count, share and average cost per bucket.
  A reference implementation is `durationHistogram()` in `app.js`.

## Components to build (React)
`AppShell`, `Sidebar`, `Topbar`, `DateRangeControl` (segmented presets + popover), `ScanStatus`, `RefreshButton`,
`Panel` (header: title + sub + action), `KpiStrip`/`Kpi`, `ShareBar`, `Legend`, `DataTable` (sortable header, numeric columns, priority-hidden columns, clickable rows),
`ModelBadge`, `ToolCount`, `StatusIcon`, `DailyTrendChart` (metric + grouping, scoped), `UsageByHourHeatmap`, `TopToolsTable`, `ModelsByFamily`,
`FilesTouched`, `ProjectsTable` + `Sparkline`, `ProjectHeader`, `SessionTabs`, `SessionDashboard` (`PerAnswerChart`, `SubagentsTable`, `ErrorsTable`),
`DurationHistogram` (expanded view), `ChartTooltip` (header, value, rows with line keys, footer), `Heatmap`,
`Timeline`, `UserEvent`, `AssistantEvent`, `ThinkingMarker`, `ToolCallList`/`ToolCallRow`, `JsonBlock`, `SubagentBlock`, `GapMarker`,
`SessionMetaPanel`, `TokenBreakdown`, `EmptyState`, `LoadingState`, `ErrorState`, `Banner`.

## Open points for the contract (not changed here)
- **Partial scan errors:** to show "N archivos no se pudieron leer", the backend would need something additive, e.g. `refresh() -> { sessions, errors: { path, message }[] }` or a `get_scan_report` command.
- **Cost per token type:** the side panel shows tokens per kind but only the total cost. A per-kind cost would need an optional `costBreakdown` (or pricing exposed to the UI).
- **`toolCallCount` scope:** the sample data counts only main-session calls in `SessionSummary.toolCallCount`, while `ToolStat` includes subagents. The UI labels it ("incluye subagentes"), but the semantics should be pinned down.
- **Sample data quirk:** some sessions list the same model twice in `models` (e.g. Haiku plus Haiku subagents). The contract says "distinct". The mockup dedupes on display.
- **Model versions in the shared sample data:** `src/mocks/mock-data.json` has one version per family, so the mockup data script relabels
  older sessions to show family shades. If the frontend should see several versions in `npm run dev:mock` too, the same idea belongs in
  `scripts/gen-mock-data.mjs` (it is outside this brief's scope, so it was not changed).
