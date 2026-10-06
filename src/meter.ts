/** Token-weighted throughput of one agent run, from first `agent_start` to `agent_settled`. */
export interface RunSummary {
	/** Wall time of the whole run, including tool execution. */
	wallMs: number;
	/** Sum of each provider request's duration, from request send to `message_end`. */
	generationMs: number;
	requests: number;
	outputTokens: number;
}

/**
 * Accumulates provider request timings across one agent run.
 *
 * Each request is timed from send to its final assistant message, so time to first token and
 * hidden reasoning count as generation while tool execution between requests does not.
 */
export class RunMeter {
	#runStart: number | null = null;
	#requestStart: number | null = null;
	#generationMs = 0;
	#requests = 0;
	#outputTokens = 0;

	startRun(now: number): void {
		this.#runStart ??= now;
	}

	startRequest(now: number): void {
		this.#requestStart = now;
	}

	endRequest(now: number, outputTokens: number): void {
		if (this.#requestStart === null) return;
		this.#generationMs += now - this.#requestStart;
		this.#outputTokens += outputTokens;
		this.#requests++;
		this.#requestStart = null;
	}

	/** Returns the run summary, or `null` when no request finished, and starts a new run. */
	settle(now: number): RunSummary | null {
		const summary =
			this.#runStart === null || this.#requests === 0
				? null
				: {
						wallMs: now - this.#runStart,
						generationMs: this.#generationMs,
						requests: this.#requests,
						outputTokens: this.#outputTokens,
					};
		this.#runStart = null;
		this.#requestStart = null;
		this.#generationMs = 0;
		this.#requests = 0;
		this.#outputTokens = 0;
		return summary;
	}
}

export function tokensPerSecond(summary: RunSummary): number {
	return summary.generationMs > 0 ? summary.outputTokens / (summary.generationMs / 1000) : 0;
}

function formatDuration(ms: number): string {
	const seconds = ms / 1000;
	if (seconds < 59.95) return `${seconds.toFixed(1)}s`;
	const total = Math.round(seconds);
	return `${Math.floor(total / 60)}m${total % 60}s`;
}

function formatTokens(tokens: number): string {
	return tokens < 1000 ? `${tokens}` : `${(tokens / 1000).toFixed(1)}K`;
}

export function formatSummary(summary: RunSummary): string {
	return [
		`⏱ run ${formatDuration(summary.wallMs)}`,
		`gen ${formatDuration(summary.generationMs)}`,
		`${summary.requests} req`,
		`out ${formatTokens(summary.outputTokens)}`,
		`${tokensPerSecond(summary).toFixed(1)} tok/s`,
	].join(" · ");
}
