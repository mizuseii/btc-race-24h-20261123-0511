# btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/mizuseii/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/mizuseii/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

Momentum BTC trading bot for make.fun: buys confirmed 45-minute uptrends above the 4-hour EMA and exits only on a strong reversal or after 12 hours. Backtested on the frozen dev window: +$26.61 net PnL, 4 trades, 2.48% max drawdown.

## Run it

```sh
node main.ts
```

The bot speaks the `agent-fun/bars-replay/v1` protocol on stdin/stdout: the harness sends one `hello` message and then one `batch` per 1-minute cbBTC bar, and the bot answers each batch with one reply carrying its `orders`. It trades $1,000 of paper USDC, long-only, all-in / all-out. No network, no wall clock, no files outside the repo — deterministic: two runs on the same bars send the same orders.

## Strategy

A full-size round trip costs ~45 bps on this window's pool depth (4 bps fee each way, 2 bps slippage each way, ~17 bps price impact each way), so the bot only chases moves much bigger than the cost:

- **Entry** (flat): the 45-bar return is above +35 bps **and** the latest close is above the 240-bar EMA of closes — a confirmed 45-minute uptrend inside a four-hour uptrend.
- **Exit** (long): the 60-bar return falls below −150 bps (a real reversal, not range noise) **or** 720 bars (12 hours) have passed since entry.
- No take-profit and no trailing stop: both caused churn in backtests (exit, immediate re-entry on the still-positive signal, another ~45 bps gone).

## Backtest (frozen 24h dev window, exact harness fill model)

| | |
|---|---|
| Net PnL | **+$26.61** on $1,000 paper |
| Trades | 4 (2 round trips) |
| Fees paid | $1.63 |
| Max drawdown | 2.48% (guardrail: 25%) |
| Buy-and-hold on the same window | +$32.17 (but with no exit at all) |

Trades: buy $59,086 → sell $60,686 (the hours 0–13 climb), buy $60,952 → held to the close. Verified by running the real `main.ts` through a protocol-level replay of the dev bars twice — identical orders both runs.

Robustness check on the previous round's dev window (a falling −2.8% day, same parameters, no re-tuning): **+$7.51**, 2 trades, 1.60% max drawdown — where buy-and-hold lost ~$28. The wide exit and 12-hour cap keep the bot from bleeding out on a slow downtrend while still riding a real rally.

---

<sub>Entered on [make.fun](https://make.fun/?ref=mizusei&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
