// WorkerRouter — harness-agnostic dispatch (Spec 46 §3)
// TODO: implement openai-compat, subprocess, pty dispatch

export type HarnessType = "openai-compat" | "subprocess" | "pty";

export interface HarnessConfig {
  type: HarnessType;
  endpoint?: string;
  command?: string[];
  env?: Record<string, string>;
}

export interface WorkerTask {
  taskId: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  context?: Record<string, unknown>;
}

export interface WorkerResult {
  taskId: string;
  output: string;
  tokensConsumed?: number;
  model?: string;
  exitCode?: number;
}

export class WorkerRouter {
  async dispatch(task: WorkerTask, harness: HarnessConfig): Promise<WorkerResult> {
    // TODO: implement openai-compat, subprocess, pty dispatch
    throw new Error(`WorkerRouter.dispatch not yet implemented (harness: ${harness.type})`);
  }
}
