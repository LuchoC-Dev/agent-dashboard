import { Fragment, memo, useEffect, useState } from "react";
import type { Metrics } from "../../../bindings/Metrics";
import type { Provider } from "../../../bindings/Provider";
import { RangeLink as Link } from "../../../components/RangeLink";
import { useRangeNavigate } from "../../../hooks/useDateRange";
import { Panel } from "../../../components/ui/Panel";
import {
  note,
  num,
  optionalColumn,
  secondaryColumn,
} from "../../../components/ui/styles";
import { Disclosure } from "../../../components/ui/Disclosure";
import { ShareBar } from "../../../components/ui/ShareBar";
import { Swatch } from "../../../components/ui/Swatch";
import type { Palette } from "../../../lib/colors";
import { int, pct, tok, usd } from "../../../lib/format";
import { CostWithMark } from "../../../components/ui/UnpricedMark";
import {
  AUTO_REVIEW_LABEL,
  familyFilter,
  familyLabel,
  familyProvider,
  filterFamily,
  isAutoReview,
  matchesModel,
  MODEL_FAMILIES,
  modelOrder,
  parseModel,
  type ModelFamily,
} from "../../../lib/models";
import { providerColor, providerLabel } from "../../../lib/providers";
import { tokensOf, type TokenKind } from "../../../lib/filters";
import { tokenTitle } from "../../../lib/usage";

const versions = (n: number) => (n === 1 ? "1 versión" : n + " versiones");
const sessions = num + " " + optionalColumn,
  tokens = num + " " + secondaryColumn;

/**
 * Cost per model version, grouped by family, with a drilldown to its sessions. Provider rows
 * start expanded and family rows collapsed (their versions one click away). Automatic
 * reviews are not a model: their usage closes the Codex block as one separate row, so the
 * provider and table totals still add up.
 */
export const ModelsByFamily = memo(function ModelsByFamily({
  metrics,
  colors,
  projectKey,
  selected = null,
  onSelect,
  tokenKind = null,
}: {
  metrics: Metrics;
  colors: Palette;
  projectKey?: string;
  /** Resumen's model filter: a model id or a family (`familia:opus`). */
  selected?: string | null;
  /**
   * A version row filters Resumen by its model, a family row by the whole family (again to
   * clear it).
   */
  onSelect?: (model: string) => void;
  tokenKind?: TokenKind | null;
}) {
  const navigate = useRangeNavigate();
  const groups = metrics.byModel
      .filter((g) => !isAutoReview(g.key))
      .sort((a, b) => modelOrder(a.key, b.key)),
    reviews = metrics.byModel.filter((g) => isAutoReview(g.key)),
    cost = metrics.byModel.reduce((n, g) => n + g.costUsd, 0),
    familyOf = (key: string) => parseModel(key).family,
    // With models of more than one provider, each provider heads its own families.
    providers = [
      ...new Set([
        ...groups.map((g) => familyProvider(familyOf(g.key))),
        ...(reviews.length ? (["codex"] as const) : []),
      ]),
    ],
    grouped = providers.filter(Boolean).length > 1;
  // Indents: under a provider row, families step in by one chevron; the reviews line up with
  // the family swatches and versions with the family names.
  const familyIndent = grouped ? "pl-[34px]" : "",
    reviewIndent = grouped ? "pl-[54px]" : "pl-[34px]",
    versionIndent = grouped ? "pl-[74px]" : "pl-[54px]";
  const sum = (gs: typeof groups, f: (g: (typeof groups)[number]) => number) =>
    gs.reduce((n, g) => n + f(g), 0);
  const [closedProviders, setClosedProviders] = useState<ReadonlySet<Provider>>(new Set()),
    [openFamilies, setOpenFamilies] = useState<ReadonlySet<ModelFamily>>(new Set());
  // The filtered model's family opens, so its row (the active filter) is on screen.
  const selectedFamily = selected ? (filterFamily(selected) ?? familyOf(selected)) : null;
  useEffect(() => {
    if (selectedFamily) setOpenFamilies((open) => new Set(open).add(selectedFamily));
  }, [selectedFamily]);
  const toggle = <T,>(set: ReadonlySet<T>, value: T) => {
    const next = new Set(set);
    if (!next.delete(value)) next.add(value);
    return next;
  };
  /** A provider's subtotal row; Codex's includes its automatic reviews. */
  const providerRow = (provider: Provider) => {
    const pgs = [
      ...groups.filter((g) => familyProvider(familyOf(g.key)) === provider),
      ...(provider === "codex" ? reviews : []),
    ];
    return (
      <tr className="*:bg-sunken *:font-semibold">
        <td className="name-cell">
          <Disclosure
            open={!closedProviders.has(provider)}
            onToggle={() => setClosedProviders(toggle(closedProviders, provider))}
          >
            <Swatch color={providerColor(provider)} /> {providerLabel(provider)}
          </Disclosure>
        </td>
        <td className={sessions} />
        <td className={tokens}>
          {tok(sum(pgs, (g) => tokensOf(g.usage, tokenKind)))}
        </td>
        <td className={num}>
          <CostWithMark
            text={usd(sum(pgs, (g) => g.costUsd))}
            tokens={sum(pgs, (g) => g.unpricedTokens ?? 0)}
          />
        </td>
        <td className={num}>
          {pct(sum(pgs, (g) => g.costUsd) / (cost || 1))}
        </td>
      </tr>
    );
  };
  const reviewRow = reviews.length > 0 && (
    <tr>
      <td className={"name-cell " + reviewIndent} title="codex-auto-review: revisor automático de Codex, no es un modelo">
        <Swatch color={colors.modelColor(reviews[0].key)} /> {AUTO_REVIEW_LABEL}
      </td>
      <td className={sessions}>{int(sum(reviews, (g) => g.sessions))}</td>
      <td className={tokens}>{tok(sum(reviews, (g) => tokensOf(g.usage, tokenKind)))}</td>
      <td className={num}>
        <CostWithMark
          text={usd(sum(reviews, (g) => g.costUsd))}
          tokens={sum(reviews, (g) => g.unpricedTokens ?? 0)}
        />
      </td>
      <td className={num}>{pct(sum(reviews, (g) => g.costUsd) / (cost || 1))}</td>
    </tr>
  );
  // Consecutive families of one provider form its block; the Codex block ends with the
  // automatic reviews, or holds only them.
  const blocks: { provider: Provider | null; families: ModelFamily[] }[] = [];
  for (const f of MODEL_FAMILIES) {
    if (!groups.some((g) => familyOf(g.key) === f)) continue;
    const provider = familyProvider(f),
      last = blocks[blocks.length - 1];
    if (last && last.provider === provider) last.families.push(f);
    else blocks.push({ provider, families: [f] });
  }
  if (reviews.length && !blocks.some((b) => b.provider === "codex"))
    blocks.push({ provider: "codex", families: [] });
  const familyRows = (f: ModelFamily) => {
    const gs = groups.filter((g) => familyOf(g.key) === f),
      open = openFamilies.has(f),
      value = familyFilter(f),
      pick = onSelect && (() => onSelect(value));
    return (
      <Fragment key={f}>
        <tr
          className={"*:font-semibold" + (pick ? " link" : "")}
          data-selected={selected === value || undefined}
          tabIndex={pick ? 0 : undefined}
          title={
            pick
              ? selected === value
                ? "Quitar el filtro de familia"
                : `Filtrar el resumen por toda la familia ${familyLabel(f)}`
              : undefined
          }
          onClick={pick}
          onKeyDown={
            pick &&
            ((e) => {
              if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
              e.preventDefault();
              pick();
            })
          }
        >
          <td className={"name-cell " + familyIndent} title={`${f} · ${versions(gs.length)}`}>
            {/* The name expands the versions; the rest of the row filters by the family. */}
            <span className="relative z-[1]" onClick={(e) => e.stopPropagation()}>
              <Disclosure open={open} onToggle={() => setOpenFamilies(toggle(openFamilies, f))}>
                <Swatch color={colors.modelColor(gs[0].key)} /> {familyLabel(f)} ·{" "}
                {versions(gs.length)}
              </Disclosure>
            </span>
          </td>
          <td className={sessions}>{int(sum(gs, (g) => g.sessions))}</td>
          <td className={tokens}>{tok(sum(gs, (g) => tokensOf(g.usage, tokenKind)))}</td>
          <td className={num}>
            <CostWithMark
              text={usd(sum(gs, (g) => g.costUsd))}
              tokens={sum(gs, (g) => g.unpricedTokens ?? 0)}
            />
          </td>
          <td className={num}>{pct(sum(gs, (g) => g.costUsd) / (cost || 1))}</td>
        </tr>
        {open &&
          gs.map((g) => (
            <tr
              key={g.key}
              className={onSelect ? "link" : ""}
              data-selected={g.key === selected || undefined}
              tabIndex={onSelect ? 0 : undefined}
              title={
                onSelect
                  ? g.key === selected
                    ? "Quitar el filtro de modelo"
                    : `Filtrar el resumen por ${parseModel(g.key).name}`
                  : undefined
              }
              onClick={onSelect && (() => onSelect(g.key))}
              onKeyDown={
                onSelect &&
                ((e) => {
                  if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " "))
                    return;
                  e.preventDefault();
                  onSelect(g.key);
                })
              }
            >
              <td className={"name-cell " + versionIndent}>
                <Link
                  className="relative z-[1] inline-block max-w-full truncate align-bottom"
                  title={`${g.key} · ver sus sesiones`}
                  onClick={(e) => e.stopPropagation()}
                  to={
                    "/sesiones?" +
                    new URLSearchParams({
                      modelo: g.key,
                      ...(projectKey ? { proyecto: projectKey } : {}),
                    })
                  }
                >
                  <Swatch dot color={colors.modelColor(g.key)} /> {parseModel(g.key).name}
                </Link>
              </td>
              <td className={sessions}>{int(g.sessions)}</td>
              <td className={tokens} title={tokenTitle(g.usage)}>
                {tok(tokensOf(g.usage, tokenKind))}
              </td>
              <td className={num}>
                <CostWithMark text={usd(g.costUsd)} tokens={g.unpricedTokens} />
              </td>
              <td className={num}>{pct(g.costUsd / (cost || 1))}</td>
            </tr>
          ))}
      </Fragment>
    );
  };
  return (
    <Panel title="Por modelo" sub="costo por versión">
      {/* Each version is a segment: hover for its cost and share; a click filters Resumen
          by it (or opens its sessions on a project), like its row. */}
      <ShareBar
        format={usd}
        actionHint={
          onSelect
            ? selected
              ? "Click: cambiar o quitar el filtro de modelo"
              : "Click: filtrar el resumen por este modelo"
            : "Click: ver sus sesiones"
        }
        onPart={(key) =>
          onSelect
            ? onSelect(key)
            : navigate(
                "/sesiones?" +
                  new URLSearchParams({ modelo: key, ...(projectKey ? { proyecto: projectKey } : {}) }),
              )
        }
        parts={[
          ...groups.map((g) => ({
            key: g.key,
            label: parseModel(g.key).name,
            value: g.costUsd,
            color: colors.modelColor(g.key),
            dim: !!selected && !matchesModel(g.key, selected),
          })),
          ...reviews.map((g) => ({
            label: AUTO_REVIEW_LABEL,
            value: g.costUsd,
            color: colors.modelColor(g.key),
            dim: !!selected,
          })),
        ]}
      />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Modelo</th>
              <th className={sessions}>Sesiones</th>
              <th className={tokens}>Tokens</th>
              <th className={num}>Costo</th>
              <th className={num}>%</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) => {
              const headed = grouped && b.provider !== null,
                open = !headed || !closedProviders.has(b.provider!);
              return (
                <Fragment key={b.provider ?? "other"}>
                  {headed && providerRow(b.provider!)}
                  {open && b.families.map(familyRows)}
                  {open && b.provider === "codex" && reviewRow}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={note}>
        Si una sesión usa varios modelos, su costo se reparte entre ellos. Las
        sesiones pueden aparecer en más de un modelo.
        {metrics.byModel.some((g) => g.unpricedTokens) &&
          " * Modelos sin precio público: su costo no se cuenta."}
      </p>
    </Panel>
  );
});
