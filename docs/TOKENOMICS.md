# NOTCH Tokenomics

This document is the complete economic specification: where every basis point flows, the exact price and floor formulas, the conservation law that governs all designs of this kind, and the honest trade-offs.

All measured numbers below come from `sim/notch_sim.py`, which mirrors the on-chain integer math exactly, using the platform launch config: start price 1 SOL per token, buy fee 3% (1% platform + 2% floor), sell fee 6% (1% creator + 5% floor), 93.5% backing (the reference; each launch picks its own in the on-chain range 82.5% to 99%).

## 1. The two prices

NOTCH tracks two numbers per token, and both are monotone non-decreasing:

- **Curve price P**: what buyers pay, what the chart shows. Only buys move it, only upward. Sells never touch it.
- **Floor / NAV**: vault balance divided by token supply. The guaranteed redemption value. Rises on every buy AND every sell.

The governor chains them together: `P = NAV / backing`. At the reference 93.5% backing, the price sits a fixed ~6.95% above what the vault actually holds, and can never run further ahead than that.

## 2. Fee flows

Every buy of B SOL:

| destination | amount | effect |
|---|---|---|
| platform wallet | 1% of B | platform revenue (recipient hardcoded in the program, same wallet on every launch) |
| vault (donation) | 2% of B | floor rises instantly, benefits all holders including the buyer |
| vault (mint) | 97% of B | mints tokens at the curve price |
| launcher | 0 | buys pay the launcher nothing |

Every sell with gross floor value G (tokens x NAV):

| destination | amount | effect |
|---|---|---|
| seller | 94% of G | the redemption payout |
| vault (kept) | 5% of G | floor rises, price frozen, headroom banked |
| creator | 1% of G | the only creator revenue |

A buyer's 1 SOL mints 0.97 SOL of tokens at `P = NAV / backing`, so the tokens' floor value is `0.97 x backing` and an instant exit returns `0.97 x backing x 0.94`. At the reference 93.5% backing that is `0.8525`: a constant 14.75% all-in maximum loss, enforced by the governor, independent of size or timing. The test suite verifies this live (measured 14.7%).

## 3. The exact formulas

### Genesis

The first buy of a fresh curve mints at the configured start price (1 SOL per token on the platform). Because 2% is donated and only 97% is minted against, buyer 1 lands over-backed: NAV = 0.99 / 0.97 = 102.06% of the entry price, and their instant round trip is only -6.9%, well inside the cap.

### Every buy after (the whole life of the token)

Minting is one exact power law, computed in integer fixed-point (no floats):

```
S1 = S0 x (Vf / V0)^backing
```

where V0 is the vault after the 2% donation lands and Vf = V0 + the 97% net. The reported price is `NAV / backing` after the mint. There is no separate launch schedule or price curve: the governor price IS the price, from the first buy onward.

Because the law is composable (buy(a) then buy(b) equals buy(a+b)), the amount minted for a given SOL is independent of how the order is split. No one can farm extra tokens by chunking, and there is no cap on buy size.

### The floor's growth law

Each buy of dx puts 0.99 dx into the vault (2% donation + 97% minted-against) but mints only `0.97 x backing` of proportional floor claims. The unminted remainder accretes to the floor:

```
d(NAV)/NAV = (0.02 + 0.97 x (1 - backing)) x dx / V
```

Integrating over pure buying (V = 0.99 x) gives a power law in cumulative buy volume x:

```
beta   = (0.02 + 0.97 x (1 - backing)) / 0.99
       = 0.0839 at 93.5% backing

NAV(x) = C x x^beta        (C = 1.0315 for the platform launch)
price(x)      = NAV(x) / backing
sell_price(x) = NAV(x) x 0.94
```

Fitted against the chain-exact simulation at x = 50 to 5,000: maximum error 0.02%.

### Sells

A sell of gross value g pays out 95% of g from the vault (94 seller + 1 creator) and burns 100% of g in claims:

```
d(NAV)/NAV = +0.05 x g / V
```

Always positive: every sell raises the floor. The price does not move on sells (trading continues normally, sells just never touch it), but the governor line `NAV / backing` rises, so the next buy prints higher. Measured: after 80 of 100 holders dumped everything, the floor ended ABOVE the frozen price and the next 1 SOL buy set a new all-time high.

### Mixed flow (the general law)

```
d(ln NAV) = 0.0830 x (buy volume)/V + 0.05 x (sell gross)/V
```

A round-tripped SOL contributes ~0.128/V, about 1.55x more than a one-way buy. Churn is the strongest floor fuel in this configuration.

## 4. Volume milestones (reference config, pure buying)

Measured from the exact simulation, multiples of the 1 SOL launch price:

| price multiple | cumulative buys needed |
|---|---|
| 1.25x | ~5 SOL |
| 1.5x | ~40 SOL |
| 1.75x | ~245 SOL |
| 2x | ~1,200 SOL |

The early leg is fast; the curve then flattens by design. This is the direct cost of the loss cap, explained next.

## 5. The conservation law (read this before picking a backing)

The floor rises exactly as fast as traders collectively pay in (fees plus the price-floor gap). Nothing else funds it. Therefore, in any design of this kind:

```
maximum instant loss  ==  the fuel rate  ==  the speed
```

They are the same number wearing different hats. Cap everyone's worst case at ~15% and each round trip can contribute at most ~15% of its size to the floor. Loosen the cap toward the platform's 25% limit and the chart runs faster, but the worst case worsens in lockstep. There is no configuration that is both fast at scale and fully backed; a fully backed NOTCH token grows only as fast as fee inflow relative to market cap.

NOTCH does not escape this law. It makes the trade-off explicit, configurable per launch, and enforced on-chain instead of implied by trust.

## 6. The configuration dial

Backing is the single per-launch dial, and the program only accepts values between 82.5% and 99%:

| backing | max all-in loss | beta (speed exponent) | character |
|---|---|---|---|
| 99% | ~9.7% | 0.030 | savings-grade, very slow chart |
| 93.5% | ~14.75% | 0.084 | reference: bounded pain, steady climb |
| 90% | ~17.9% | 0.118 | tradeable, faster chart |
| 85% | ~22.5% | 0.167 | fast, close to the platform limit |
| 82.5% | ~24.8% | 0.192 | the floor of the range: no launch can exceed ~25% max loss |

The other `Initialize` parameters (fees, start price) exist on-chain with hard sanity caps (creator fees at most 5% per side, buy floor fee at most 10%, sell floor fee at most 20%), and the buy-side fee recipient is hardcoded to the platform wallet on every launch. Platform launches fix all of them: 1% + 2% buys, 1% + 5% sells, 1 SOL start price. Backing is the only choice a launcher makes.

## 7. Comparison to fee-accrual LSTs

Volume-fee LSTs put a transfer fee (6.9% in the best-known case) into backing, so the redemption rate only rises. That design is 100% backed at all times, which also makes it slow: a doubling needs roughly 10x the market cap in transfer volume.

NOTCH keeps the part that works (sells strengthen the token, value is volume-fed, exit is always guaranteed) and changes two things: the chart price itself only moves up rather than just the redemption rate, and the safety-speed trade-off is a configurable, on-chain-enforced parameter instead of a fixed 100% backing. At 93.5% backing the early phase moves substantially faster per SOL of volume; at scale the conservation law applies to everyone equally.

## 8. Worst cases, measured

From the exact program math at the reference config, 100 buyers of 1 SOL each:

| who | outcome |
|---|---|
| buyer 100, panic-sells instantly | -14.7% (the worst case, by construction) |
| buyer 1, exits at the floor after the wave | +38.4% |
| worst seller in an 80% holder exodus | -6.6% |

Realistic dump waves are much gentler than the bound because the floor rises during the wave itself: in the 80% exodus above, the first sellers exited at +38.4% and even the last seller out took only -5.6%.
