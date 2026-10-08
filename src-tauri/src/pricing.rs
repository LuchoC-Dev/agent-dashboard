use crate::model::{CostBreakdown, Provider, Usage};
use std::sync::{Mutex, OnceLock};
static UNKNOWN_MODELS: OnceLock<Mutex<std::collections::HashSet<String>>> = OnceLock::new();

#[derive(Clone, Copy)]
struct Rate {
    prefix: &'static str,
    input: f64,
    output: f64,
    cache_read: Option<f64>,
    cache_write_5m: f64,
    cache_write_1h: f64,
}
const CLAUDE_RATES: &[Rate] = &[
    Rate {
        prefix: "claude-fable-5-1",
        input: 10.0,
        output: 50.0,
        cache_read: Some(0.25),
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-mythos-5-1",
        input: 10.0,
        output: 50.0,
        cache_read: Some(1.0),
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-fable-5",
        input: 10.0,
        output: 50.0,
        cache_read: Some(1.0),
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-opus-5-5",
        input: 4.0,
        output: 20.0,
        cache_read: Some(0.20),
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-sonnet-5-5",
        input: 2.0,
        output: 10.0,
        cache_read: Some(0.20),
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-opus-5",
        input: 5.0,
        output: 25.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-opus-4-8",
        input: 5.0,
        output: 25.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-opus-4-7",
        input: 5.0,
        output: 25.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-opus-4-6",
        input: 5.0,
        output: 25.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-opus-4-5",
        input: 5.0,
        output: 25.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-opus-4-1",
        input: 15.0,
        output: 75.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-opus-4-0",
        input: 15.0,
        output: 75.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-opus-4-2025",
        input: 15.0,
        output: 75.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-sonnet-5",
        input: 2.0,
        output: 10.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-sonnet-4-6",
        input: 3.0,
        output: 15.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-sonnet-4-5",
        input: 3.0,
        output: 15.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-sonnet-4-0",
        input: 3.0,
        output: 15.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-sonnet-4-2025",
        input: 3.0,
        output: 15.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-3-7-sonnet",
        input: 3.0,
        output: 15.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-haiku-4-5",
        input: 1.0,
        output: 5.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-3-5-haiku",
        input: 0.8,
        output: 4.0,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
    Rate {
        prefix: "claude-3-haiku",
        input: 0.25,
        output: 1.25,
        cache_read: None,
        cache_write_5m: 1.25,
        cache_write_1h: 2.0,
    },
];

#[derive(Clone, Copy)]
struct Tier {
    input: f64,
    cached_input: f64,
    cache_write: f64,
    output: f64,
}

#[derive(Clone, Copy)]
struct OpenAiRate {
    id: &'static str,
    input: f64,
    cached_input: f64,
    cache_write: Option<f64>,
    output: f64,
    long: Option<Tier>,
}

const OPENAI_RATES: &[OpenAiRate] = &[
    OpenAiRate {
        id: "gpt-6.1-sol",
        input: 2.0,
        cached_input: 0.10,
        cache_write: Some(2.50),
        output: 10.0,
        long: Some(Tier {
            input: 4.0,
            cached_input: 0.20,
            cache_write: 5.0,
            output: 15.0,
        }),
    },
    OpenAiRate {
        id: "gpt-6-sol",
        input: 2.0,
        cached_input: 0.20,
        cache_write: Some(2.50),
        output: 10.0,
        long: Some(Tier {
            input: 4.0,
            cached_input: 0.40,
            cache_write: 5.0,
            output: 15.0,
        }),
    },
    OpenAiRate {
        id: "gpt-6-luna",
        input: 0.10,
        cached_input: 0.01,
        cache_write: Some(0.125),
        output: 0.50,
        long: Some(Tier {
            input: 0.20,
            cached_input: 0.02,
            cache_write: 0.25,
            output: 0.75,
        }),
    },
    OpenAiRate {
        id: "gpt-5.6-sol",
        input: 4.0,
        cached_input: 0.40,
        cache_write: Some(5.0),
        output: 20.0,
        long: Some(Tier {
            input: 8.0,
            cached_input: 0.80,
            cache_write: 10.0,
            output: 30.0,
        }),
    },
    OpenAiRate {
        id: "gpt-5.6-terra",
        input: 2.0,
        cached_input: 0.20,
        cache_write: Some(2.50),
        output: 12.0,
        long: Some(Tier {
            input: 4.0,
            cached_input: 0.40,
            cache_write: 5.0,
            output: 18.0,
        }),
    },
    OpenAiRate {
        id: "gpt-5.6-luna",
        input: 0.20,
        cached_input: 0.02,
        cache_write: Some(0.25),
        output: 1.20,
        long: Some(Tier {
            input: 0.40,
            cached_input: 0.04,
            cache_write: 0.50,
            output: 1.80,
        }),
    },
    OpenAiRate {
        id: "gpt-5.5",
        input: 5.0,
        cached_input: 0.50,
        cache_write: None,
        output: 30.0,
        long: None,
    },
    OpenAiRate {
        id: "gpt-5.4-mini",
        input: 0.75,
        cached_input: 0.075,
        cache_write: None,
        output: 4.50,
        long: None,
    },
];

/// Extra context used to select provider-specific pricing tiers.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PriceCtx {
    pub cache_write_5m: u64,
    pub cache_write_1h: u64,
    /// Total input tokens for the request, including cached input.
    pub request_input_tokens: Option<u64>,
}

pub fn cost(model: &str, usage: Usage) -> f64 {
    cost_with_cache(model, usage, usage.cache_creation_tokens, 0)
}
pub fn cost_with_cache(model: &str, usage: Usage, cache_write_5m: u64, cache_write_1h: u64) -> f64 {
    cost_breakdown_with_cache(model, usage, cache_write_5m, cache_write_1h).total()
}

pub fn cost_breakdown(model: &str, usage: Usage) -> CostBreakdown {
    cost_breakdown_with_cache(model, usage, usage.cache_creation_tokens, 0)
}

pub fn cost_breakdown_with_cache(
    model: &str,
    usage: Usage,
    cache_write_5m: u64,
    cache_write_1h: u64,
) -> CostBreakdown {
    cost_breakdown_for(
        Provider::Claude,
        model,
        usage,
        PriceCtx {
            cache_write_5m,
            cache_write_1h,
            request_input_tokens: None,
        },
    )
}

/// Calculates a provider-aware cost estimate. Claude model ids retain longest-prefix
/// matching; OpenAI ids match exactly after an optional date snapshot is removed.
pub fn cost_breakdown_for(
    provider: Provider,
    model: &str,
    usage: Usage,
    ctx: PriceCtx,
) -> CostBreakdown {
    match provider {
        Provider::Claude => claude_cost_breakdown(model, usage, ctx),
        Provider::Codex => openai_cost_breakdown(model, usage, ctx),
    }
}

/// Returns the token volume without a public price, for callers that aggregate
/// `unpriced_tokens` alongside the cost breakdown.
pub fn unpriced_tokens_for(provider: Provider, model: &str, usage: Usage) -> u64 {
    let priced = match provider {
        Provider::Claude => CLAUDE_RATES
            .iter()
            .any(|rate| model.starts_with(rate.prefix)),
        Provider::Codex => OPENAI_RATES
            .iter()
            .any(|rate| strip_date_snapshot(model) == rate.id),
    };
    if priced {
        0
    } else {
        usage
            .input_tokens
            .saturating_add(usage.cache_read_tokens)
            .saturating_add(usage.cache_creation_tokens)
            .saturating_add(usage.output_tokens)
    }
}

fn claude_cost_breakdown(model: &str, usage: Usage, ctx: PriceCtx) -> CostBreakdown {
    let Some(rate) = CLAUDE_RATES
        .iter()
        .filter(|r| model.starts_with(r.prefix))
        .max_by_key(|r| r.prefix.len())
    else {
        log_unknown_model(Provider::Claude, model);
        return CostBreakdown::default();
    };
    CostBreakdown {
        input: usage.input_tokens as f64 * rate.input / 1_000_000.0,
        output: usage.output_tokens as f64 * rate.output / 1_000_000.0,
        cache_read: usage.cache_read_tokens as f64 * rate.cache_read.unwrap_or(rate.input * 0.1)
            / 1_000_000.0,
        cache_write: (ctx.cache_write_5m as f64 * rate.input * rate.cache_write_5m
            + ctx.cache_write_1h as f64 * rate.input * rate.cache_write_1h)
            / 1_000_000.0,
    }
}

fn openai_cost_breakdown(model: &str, usage: Usage, ctx: PriceCtx) -> CostBreakdown {
    let normalized = strip_date_snapshot(model);
    let Some(rate) = OPENAI_RATES.iter().find(|rate| rate.id == normalized) else {
        log_unknown_model(Provider::Codex, model);
        return CostBreakdown::default();
    };
    let tier = if ctx.request_input_tokens.unwrap_or(0) > 272_000 {
        rate.long.unwrap_or(Tier {
            input: rate.input,
            cached_input: rate.cached_input,
            cache_write: rate.cache_write.unwrap_or(0.0),
            output: rate.output,
        })
    } else {
        Tier {
            input: rate.input,
            cached_input: rate.cached_input,
            cache_write: rate.cache_write.unwrap_or(0.0),
            output: rate.output,
        }
    };
    CostBreakdown {
        input: usage.input_tokens as f64 * tier.input / 1_000_000.0,
        output: usage.output_tokens as f64 * tier.output / 1_000_000.0,
        cache_read: usage.cache_read_tokens as f64 * tier.cached_input / 1_000_000.0,
        cache_write: usage.cache_creation_tokens as f64 * tier.cache_write / 1_000_000.0,
    }
}

fn strip_date_snapshot(model: &str) -> &str {
    let Some(start) = model.len().checked_sub(11) else {
        return model;
    };
    if !model.is_char_boundary(start) {
        return model;
    }
    let suffix = &model[start..];
    if suffix.as_bytes()[0] == b'-'
        && suffix.as_bytes()[5] == b'-'
        && suffix.as_bytes()[8] == b'-'
        && suffix
            .bytes()
            .enumerate()
            .all(|(i, b)| i == 0 || i == 5 || i == 8 || b.is_ascii_digit())
    {
        &model[..start]
    } else {
        model
    }
}

fn log_unknown_model(provider: Provider, model: &str) {
    let provider_name = match provider {
        Provider::Claude => "Claude",
        Provider::Codex => "Codex",
    };
    let key = format!("{provider_name}:{model}");
    let mut seen = UNKNOWN_MODELS
        .get_or_init(|| Mutex::new(std::collections::HashSet::new()))
        .lock()
        .unwrap_or_else(|p| p.into_inner());
    if seen.insert(key) {
        eprintln!("Unknown {provider_name} model pricing: {model}");
    }
}

impl CostBreakdown {
    pub fn total(self) -> f64 {
        self.input + self.output + self.cache_read + self.cache_write
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn longest_prefix_and_date_suffix() {
        let u = Usage {
            input_tokens: 1_000_000,
            ..Usage::default()
        };
        assert_eq!(cost("claude-haiku-4-5-20251001", u), 1.0);
        assert_eq!(cost("claude-sonnet-5-5-20251001", u), 2.0);
    }
    #[test]
    fn unknown_model_is_free() {
        assert_eq!(
            cost(
                "new-model",
                Usage {
                    input_tokens: 100,
                    ..Usage::default()
                }
            ),
            0.0
        );
    }
    #[test]
    fn cache_costs_follow_documented_default() {
        let u = Usage {
            cache_creation_tokens: 1_000_000,
            ..Usage::default()
        };
        assert_eq!(cost("claude-sonnet-5", u), 2.5);
    }
    #[test]
    fn one_hour_cache_write_has_two_x_input_rate() {
        let u = Usage { ..Usage::default() };
        assert_eq!(cost_with_cache("claude-sonnet-5", u, 0, 1_000_000), 4.0);
    }

    #[test]
    fn claude_uses_longest_matching_prefix() {
        let usage = Usage {
            input_tokens: 1_000_000,
            ..Usage::default()
        };
        let breakdown = cost_breakdown_for(
            Provider::Claude,
            "claude-3-7-sonnet-20250219",
            usage,
            PriceCtx::default(),
        );
        assert_eq!(breakdown.input, 3.0);
        assert_eq!(breakdown.output, 0.0);
    }

    #[test]
    fn openai_standard_prices_match_the_documented_table() {
        let cases = [
            ("gpt-6.1-sol", 2.0, 0.10, 2.50, 10.0),
            ("gpt-6-sol", 2.0, 0.20, 2.50, 10.0),
            ("gpt-6-luna", 0.10, 0.01, 0.125, 0.50),
            ("gpt-5.6-sol", 4.0, 0.40, 5.0, 20.0),
            ("gpt-5.6-terra", 2.0, 0.20, 2.50, 12.0),
            ("gpt-5.6-luna", 0.20, 0.02, 0.25, 1.20),
            ("gpt-5.5", 5.0, 0.50, 0.0, 30.0),
            ("gpt-5.4-mini", 0.75, 0.075, 0.0, 4.50),
        ];
        let usage = Usage {
            input_tokens: 1_000_000,
            output_tokens: 1_000_000,
            cache_read_tokens: 1_000_000,
            cache_creation_tokens: 1_000_000,
            ..Usage::default()
        };
        for (model, input, cached, write, output) in cases {
            let cost = cost_breakdown_for(
                Provider::Codex,
                model,
                usage,
                PriceCtx {
                    request_input_tokens: Some(100_000),
                    ..PriceCtx::default()
                },
            );
            assert_eq!(cost.input, input, "{model} input");
            assert_eq!(cost.cache_read, cached, "{model} cached input");
            assert_eq!(cost.cache_write, write, "{model} cache write");
            assert_eq!(cost.output, output, "{model} output");
            assert_eq!(unpriced_tokens_for(Provider::Codex, model, usage), 0);
        }
    }

    #[test]
    fn openai_long_context_tier_starts_above_272k() {
        let usage = Usage {
            input_tokens: 1_000_000,
            output_tokens: 1_000_000,
            cache_read_tokens: 1_000_000,
            cache_creation_tokens: 1_000_000,
            ..Usage::default()
        };
        let price = |request_input_tokens| {
            cost_breakdown_for(
                Provider::Codex,
                "gpt-6-luna",
                usage,
                PriceCtx {
                    request_input_tokens: Some(request_input_tokens),
                    ..PriceCtx::default()
                },
            )
        };
        let at_limit = price(272_000);
        assert_eq!(at_limit.input, 0.10);
        assert_eq!(at_limit.cache_read, 0.01);
        assert_eq!(at_limit.cache_write, 0.125);
        assert_eq!(at_limit.output, 0.50);

        let over_limit = price(272_001);
        assert_eq!(over_limit.input, 0.20);
        assert_eq!(over_limit.cache_read, 0.02);
        assert_eq!(over_limit.cache_write, 0.25);
        assert_eq!(over_limit.output, 0.75);
    }

    #[test]
    fn openai_date_snapshots_match_but_prefixes_do_not() {
        let usage = Usage {
            input_tokens: 1_000_000,
            ..Usage::default()
        };
        let ctx = PriceCtx::default();
        assert_eq!(
            cost_breakdown_for(Provider::Codex, "gpt-5.5-2026-01-17", usage, ctx).input,
            5.0
        );
        assert_eq!(
            cost_breakdown_for(Provider::Codex, "gpt-5.5-mini", usage, ctx).total(),
            0.0
        );
        assert_eq!(
            cost_breakdown_for(Provider::Codex, "gpt-6-luna-x", usage, ctx).total(),
            0.0
        );
    }

    #[test]
    fn unpriced_openai_models_report_all_usage_tokens() {
        let usage = Usage {
            input_tokens: 2,
            output_tokens: 3,
            cache_read_tokens: 5,
            cache_creation_tokens: 7,
            ..Usage::default()
        };
        for model in ["gpt-5.5-mini", "codex-auto-review", "future-model"] {
            assert_eq!(
                cost_breakdown_for(Provider::Codex, model, usage, PriceCtx::default()).total(),
                0.0
            );
            assert_eq!(unpriced_tokens_for(Provider::Codex, model, usage), 17);
        }
        assert_eq!(
            unpriced_tokens_for(Provider::Claude, "new-claude-model", usage),
            17
        );
    }
}
