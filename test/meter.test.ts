import { describe, expect, it } from "vitest";
import { formatSummary, RunMeter, tokensPerSecond } from "../src/meter.ts";

const out = (output: number) => ({ input: 0, cacheWrite: 0, output });

describe("RunMeter", () => {
	it("sums request time and output, excluding gaps between requests", () => {
		const meter = new RunMeter();
		meter.startRun(0);
		meter.startRequest(0);
		meter.endRequest(2_000, out(100));
		// 10s of tool execution between requests is not generation time.
		meter.startRequest(12_000);
		meter.endRequest(14_000, out(300));

		const summary = meter.settle(15_000);
		expect(summary).toEqual({
			wallMs: 15_000,
			generationMs: 4_000,
			requests: 2,
			uncachedInputTokens: 0,
			outputTokens: 400,
		});
		expect(tokensPerSecond(summary!)).toBe(100);
	});

	it("weights by tokens instead of averaging per-request rates", () => {
		const meter = new RunMeter();
		meter.startRun(0);
		meter.startRequest(0);
		meter.endRequest(1_000, out(10));
		meter.startRequest(1_000);
		meter.endRequest(11_000, out(1_000));

		// Mean of per-request rates would be (10 + 100) / 2 = 55.
		expect(tokensPerSecond(meter.settle(11_000)!)).toBeCloseTo(1_010 / 11);
	});

	it("counts input and cache writes as uncached input, not cache reads", () => {
		const meter = new RunMeter();
		meter.startRun(0);
		meter.startRequest(0);
		const anthropic = { input: 3, cacheWrite: 2_000, cacheRead: 90_000, output: 10 };
		const openai = { input: 500, cacheWrite: 0, cacheRead: 91_000, output: 10 };
		meter.endRequest(1_000, anthropic);
		meter.startRequest(2_000);
		meter.endRequest(3_000, openai);

		expect(meter.settle(3_000)).toMatchObject({ uncachedInputTokens: 2_503 });
	});

	it("keeps one run across agent restarts until settled", () => {
		const meter = new RunMeter();
		meter.startRun(0);
		meter.startRequest(0);
		meter.endRequest(1_000, out(50));
		meter.startRun(5_000);
		meter.startRequest(5_000);
		meter.endRequest(6_000, out(50));

		expect(meter.settle(7_000)).toMatchObject({ wallMs: 7_000, requests: 2, outputTokens: 100 });
	});

	it("ignores a message without a request and resets after settling", () => {
		const meter = new RunMeter();
		meter.startRun(0);
		meter.endRequest(1_000, out(50));
		expect(meter.settle(2_000)).toBeNull();

		meter.startRun(3_000);
		meter.startRequest(3_000);
		meter.endRequest(4_000, out(20));
		expect(meter.settle(4_000)).toMatchObject({ wallMs: 1_000, generationMs: 1_000, requests: 1, outputTokens: 20 });
	});
});

describe("formatSummary", () => {
	it("renders one compact line", () => {
		const summary = { wallMs: 192_000, generationMs: 48_300, requests: 7, uncachedInputTokens: 12_345, outputTokens: 4_115 };
		expect(formatSummary(summary)).toBe(
			"⏱ run 3m12s · gen 48.3s · 7 req · in 12.3K · out 4.1K · 85.2 tok/s",
		);
	});

	it("does not render 60 seconds as a fraction", () => {
		const summary = { wallMs: 59_980, generationMs: 0, requests: 1, uncachedInputTokens: 0, outputTokens: 0 };
		expect(formatSummary(summary)).toBe("⏱ run 1m0s · gen 0.0s · 1 req · in 0 · out 0 · 0.0 tok/s",
		);
	});
});
