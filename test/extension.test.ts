import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import runTps from "../src/index.ts";

type Handler = (event: unknown, ctx: unknown) => void;

function load() {
	const handlers = new Map<string, Handler>();
	const pi = { on: (name: string, handler: Handler) => handlers.set(name, handler) };
	runTps(pi as unknown as ExtensionAPI);
	const notify = vi.fn();
	const ctx = { hasUI: true, isIdle: vi.fn(() => true), ui: { notify } };
	const emit = (name: string, event: unknown = {}) => handlers.get(name)!(event, ctx);
	return { emit, notify, ctx };
}

function assistant(output: number) {
	return { message: { role: "assistant", usage: { output } } };
}

let now: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout"] });
	now = vi.spyOn(performance, "now").mockReturnValue(0);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function request(start: number, end: number, output: number, emit: (name: string, event?: unknown) => void) {
	now.mockReturnValue(start);
	emit("before_provider_request");
	now.mockReturnValue(end);
	emit("message_end", assistant(output));
}

describe("run-tps extension", () => {
	it("prints a single summary when the run settles", () => {
		const { emit, notify } = load();

		emit("agent_start");
		request(0, 2_000, 200, emit);
		emit("message_end", { message: { role: "toolResult" } });
		request(30_000, 32_000, 200, emit);
		emit("agent_settled");
		expect(notify).not.toHaveBeenCalled();

		vi.runAllTimers();
		expect(notify).toHaveBeenCalledOnce();
		expect(notify).toHaveBeenCalledWith("⏱ run 32.0s · gen 4.0s · 2 req · out 400 · 100.0 tok/s", "info");
	});

	it("folds a continuation started from agent_settled into the same summary", () => {
		const { emit, notify, ctx } = load();

		emit("agent_start");
		request(0, 1_000, 100, emit);
		emit("agent_settled");
		ctx.isIdle.mockReturnValueOnce(false);
		vi.runAllTimers();
		expect(notify).not.toHaveBeenCalled();

		now.mockReturnValue(20_000);
		emit("agent_start");
		request(20_000, 21_000, 100, emit);
		emit("agent_settled");
		vi.runAllTimers();
		expect(notify).toHaveBeenCalledOnce();
		expect(notify).toHaveBeenCalledWith("⏱ run 21.0s · gen 2.0s · 2 req · out 200 · 100.0 tok/s", "info");
	});

	it("stays silent when no request finished", () => {
		const { emit, notify } = load();
		emit("agent_start");
		emit("agent_settled");
		vi.runAllTimers();
		expect(notify).not.toHaveBeenCalled();
	});
});
