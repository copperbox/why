// Entry point for the Sandcastle feature-PR workflow (build side).
// The autonomous gate is separate: .sandcastle/gatekeeper.mts.
// scripts/autonomous-loop.sh alternates the two.
//
// Exit codes (contract with the loop scripts):
//   0 -- a cycle ran (there may be more to do)
//   1 -- crash
//   3 -- idle: nothing queued or everything is blocked/in-review

import { IDLE_EXIT_CODE, runFeatureFlow } from "@copperbox/sandcastle-workflow";
import config from "./config.mts";

const result = await runFeatureFlow(config);
process.exit(result.status === "idle" ? IDLE_EXIT_CODE : 0);
