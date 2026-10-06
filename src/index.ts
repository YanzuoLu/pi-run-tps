import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatSummary, RunMeter } from "./meter.ts";

export default function runTps(pi: ExtensionAPI): void {
	const meter = new RunMeter();

	pi.on("agent_start", () => {
		meter.startRun(performance.now());
	});
	pi.on("before_provider_request", () => {
		meter.startRequest(performance.now());
	});
	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant") return;
		meter.endRequest(performance.now(), event.message.usage.output);
	});
	pi.on("agent_settled", (_event, ctx) => {
		// Extensions may continue the task from their own agent_settled handlers, e.g. after an
		// online compaction. Pi starts that run once settled handlers return, so check one tick
		// later and keep accumulating into the same summary while work continues.
		setTimeout(() => {
			if (!ctx.isIdle()) return;
			const summary = meter.settle(performance.now());
			if (summary && ctx.hasUI) ctx.ui.notify(formatSummary(summary), "info");
		}, 0);
	});
}
