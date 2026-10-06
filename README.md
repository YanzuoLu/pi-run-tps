# pi-run-tps

A Pi extension that prints **one** tokens-per-second summary per agent run, in the
transcript, when the run settles:

```text
⏱ run 3m12s · gen 48.3s · 7 req · in 12.3K · out 4.1K · 85.2 tok/s
```

There is no live meter and no footer widget. You get one line per task, after Pi has
finished working on it.

## How it is measured

```text
         Σ output tokens of every provider request in the run
tok/s = ------------------------------------------------------
         Σ (request sent → final assistant message) per request
```

- **Each request is timed from send to `message_end`.** Time to first token and hidden
  reasoning count as generation, because reasoning tokens are part of `output`. Stream-only
  timers (first delta → last delta) report inflated speeds on reasoning models whose
  answer arrives in a burst.
- **Tool execution is excluded.** Time between requests (running `bash`, edits, user
  approvals) is not generation time, so a slow shell command does not lower the speed.
- **Token-weighted, not averaged.** Totals are summed before dividing. Averaging per-request
  rates would let short tool-call responses count as much as long answers.

| Field | Meaning |
| --- | --- |
| `run` | Wall time from the first `agent_start` to settlement, including tools |
| `gen` | Sum of provider request durations |
| `req` | Provider requests that produced an assistant message |
| `in` | Input not served from the prompt cache: `input + cacheWrite`, summed over requests |
| `out` | Provider-reported output tokens, including reasoning |
| `tok/s` | `out / gen` |

Pi reports `input`, `cacheWrite`, and `cacheRead` as disjoint counts. `in` leaves out cheap
cache reads and keeps the input billed at full or cache-write price, so it compares across
providers: Anthropic reports most uncached input as `cacheWrite`, OpenAI as `input`.

A run ends at `agent_settled`, when Pi will not continue on its own. Retries and Pi's
automatic compaction stay inside one run. Continuations that another extension starts from
its own `agent_settled` handler, such as an online compaction followed by a resumed turn,
are folded into the same summary.

`gen` still includes queueing and prompt prefill, so speed drops on very long contexts or
busy providers even when decoding is unchanged.

## Install

```bash
pi install git:github.com/YanzuoLu/pi-run-tps
```

To try it for a single session without installing:

```bash
pi -e git:github.com/YanzuoLu/pi-run-tps
```

The summary is shown in the interactive TUI and sent as a `notify` UI request in RPC mode.
Print mode has no UI, so nothing is printed there. The line is display-only and never
enters the model context.

## Development

```bash
npm install
npm run check
```

## License

MIT
