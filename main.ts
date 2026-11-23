// Trend-following BTC bot for make.fun "Race a BTC trading bot live for 24 hours"
// (btc-race-24h-20261123-0511).
//
// Protocol: agent-fun/bars-replay/v1. The harness sends one `hello` message
// (capital, symbols, caps, fees) and then one `batch` per 1-minute cbBTC bar
// (the bar, the fills of our earlier orders and the account). We answer every
// batch with one reply echoing its seq, carrying our `orders` for that bar.
// Orders decided on a bar fill at the NEXT bar's open, so every decision here
// uses only bars already seen -- never the future. The vendored shim
// (vendor/makefun-bars.ts, a byte-identical copy of the kit's
// sdk/makefun-bars.ts) owns the wire; this file only decides.
//
// Strategy -- long-only momentum trend follower, all-in / all-out, tuned on
// the frozen 24h dev window with the exact harness fill model, and checked
// for robustness on the previous round's dev window (a falling -2.8% day):
//   - Entry (flat): the 45-bar return is above +35 bps AND the latest close
//     is above the 240-bar EMA of closes -- a confirmed ~45-minute uptrend
//     inside a four-hour uptrend. A full-size round trip costs ~45 bps here
//     (4 bps fee each way, 2 bps slippage each way, ~17 bps price impact
//     each way at this window's ~$0.6-0.9M pool depth), so we only chase
//     moves much bigger than the cost.
//   - Exit (long): the 60-bar return falls below -150 bps (a real reversal,
//     not range noise) OR 720 bars (12 hours) have passed since entry.
//     No take-profit and no trailing stop: both caused churn in backtests
//     (exit, immediate re-entry on the still-positive signal, another
//     ~45 bps gone).
//   - While warming up (hello.warmup_bars) we build history but send no
//     orders: orders decided on a warm-up batch are rejected.
//   - max_slippage_bps is 1000 (10%): far above any one-minute move in the
//     dev window (stdev 8.1 bps, max 72 bps), so it never binds in normal
//     trading, but it still refuses a freak gap fill.
//
// Backtest (frozen 24h dev window, exact harness fill model, protocol-level
// replay of this real main.ts, run twice):
//   net PnL +$26.61, 4 trades, max drawdown 2.48%. Buy-and-hold on the same
//   window: +$32.17 -- but buy-and-hold has no exit at all, so on a falling
//   day it keeps the whole loss; this bot made +$7.51 on the previous round's
//   falling dev window (same parameters), where buy-and-hold lost ~$28.
//   The dev window is +3.64% overall (flat 2h, a +3.1% rally in hours 3-4,
//   then a flat-to-choppy range); the bot buys the rally and rides it.
//
// Deterministic: float EMAs/returns computed from the bar closes only, no
// clock, no environment, no randomness, no files, no network. Two runs on
// the same bars send the same orders.
import { runBars } from "./vendor/makefun-bars.ts";
import type { BarsState, Batch } from "./vendor/makefun-bars.ts";

// --- strategy parameters (see module docstring) ---------------------------
const LOOKBACK_BARS = 45; // bars for the entry momentum return
const ENTRY_BPS = 35.0; // enter when the 45-bar return exceeds +35 bps
const EXIT_LOOKBACK_BARS = 60; // bars for the exit momentum return
const EXIT_BPS = -150.0; // exit when the 60-bar return falls below -150 bps
const SLOW_EMA_BARS = 240; // bars for the regime EMA
const MAX_HOLD_BARS = 720; // give up on a trade after 12 hours
const MAX_SLIPPAGE_BPS = 1000; // 10%: never binds on 1-minute bars

let symbol = ""; // set from hello: the competition's only symbol
const closes: number[] = []; // every close seen so far, in bar order
let slowEma: number | null = null; // 240-bar EMA of closes (seeded at first close)
let heldBars = 0; // bars since the current entry (0 while flat)

function retBps(now: number, then: number): number {
  return ((now - then) / then) * 10000.0;
}

function onHello(state: BarsState): void {
  symbol = state.hello.symbols[0]!.symbol;
}

function onBatch(state: BarsState, _batch: Batch) {
  const closeBig = state.close(symbol);
  if (closeBig === null) return [];
  const close = Number(closeBig);
  closes.push(close);
  const alpha = 2.0 / (SLOW_EMA_BARS + 1);
  slowEma = slowEma === null ? close : alpha * close + (1.0 - alpha) * slowEma;
  if (state.warmingUp) return [];
  const k = state.seq;
  if (k < LOOKBACK_BARS) return [];
  const momentum = retBps(close, closes[k - LOOKBACK_BARS]!);
  const pos = state.positions.get(symbol);
  const holding = pos !== undefined && pos.qty > 0n;
  if (holding) {
    heldBars += 1;
    const exitMomentum = retBps(close, closes[k - EXIT_LOOKBACK_BARS]!);
    if (exitMomentum < EXIT_BPS || heldBars >= MAX_HOLD_BARS) {
      heldBars = 0;
      return [
        {
          side: "sell",
          symbol,
          qty: pos.qty,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }
    return [];
  }
  const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
  if (momentum > ENTRY_BPS && close > slowEma && state.cash > 0n) {
    const room = state.weightRoom(symbol);
    const notional = state.cash < room ? state.cash : room;
    if (notional >= minNotional) {
      heldBars = 0;
      return [
        {
          side: "buy",
          symbol,
          notional_quote_units: notional,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        },
      ];
    }
  }
  return [];
}

await runBars({ onHello, onBatch });
