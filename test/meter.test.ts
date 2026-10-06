import { describe, expect, it } from "vitest";
import { formatSummary, RunMeter, tokensPerSecond } from "../src/meter.ts";

describe("RunMeter", () => {
	it("sums request time and output, excluding gaps between requests", () => {
		const meter = new RunMeter();
		meter.startRun(0);
		meter.startRequest(0);
		meter.endRequest(2_000, 100);
		// 10s of tool execution between requests is not generation time.
		meter.startRequest(12_000);
		meter.endRequest(14_000, 300);

		const summary = meter.settle(15_000);
		expect(summary).toEqual({ wallMs: 15_000, generationMs: 4_000, requests: 2, outputTokens: 400 });
		expect(tokensPerSecond(summary!)).toBe(100);
	});

	it("weights by tokens instead of averaging per-request rates", () => {
		const meter = new RunMeter();
		meter.startRun(0);
		meter.startRequest(0);
		meter.endRequest(1_000, 10);
		meter.startRequest(1_000);
		meter.endRequest(11_000, 1_000);

		// Mean of per-request rates would be (10 + 100) / 2 = 55.
		expect(tokensPerSecond(meter.settle(11_000)!)).toBeCloseTo(1_010 / 11);
	});

	it("keeps one run across agent restarts until settled", () => {
		const meter = new RunMeter();
		meter.startRun(0);
		meter.startRequest(0);
		meter.endRequest(1_000, 50);
		meter.startRun(5_000);
		meter.startRequest(5_000);
		meter.endRequest(6_000, 50);

		expect(meter.settle(7_000)).toMatchObject({ wallMs: 7_000, requests: 2, outputTokens: 100 });
	});

	it("ignores a message without a request and resets after settling", () => {
		const meter = new RunMeter();
		meter.startRun(0);
		meter.endRequest(1_000, 50);
		expect(meter.settle(2_000)).toBeNull();

		meter.startRun(3_000);
		meter.startRequest(3_000);
		meter.endRequest(4_000, 20);
		expect(meter.settle(4_000)).toEqual({ wallMs: 1_000, generationMs: 1_000, requests: 1, outputTokens: 20 });
	});
});

describe("formatSummary", () => {
	it("renders one compact line", () => {
		expect(formatSummary({ wallMs: 192_000, generationMs: 48_300, requests: 7, outputTokens: 4_115 })).toBe(
			"⏱ run 3m12s · gen 48.3s · 7 req · out 4.1K · 85.2 tok/s",
		);
	});

	it("does not render 60 seconds as a fraction", () => {
		expect(formatSummary({ wallMs: 59_980, generationMs: 0, requests: 1, outputTokens: 0 })).toBe(
			"⏱ run 1m0s · gen 0.0s · 1 req · out 0 · 0.0 tok/s",
		);
	});
});
