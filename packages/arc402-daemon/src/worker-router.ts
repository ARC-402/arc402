import * as http from "http";
import * as https from "https";
import { spawn } from "child_process";

export type HarnessConfig =
  | {
      type: "openai-compat";
      endpoint: string;
      model: string;
      token?: string;
      headers?: Record<string, string>;
      timeoutMs?: number;
    }
  | {
      type: "subprocess";
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
    }
  | {
      type: "pty";
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
    };

export interface WorkerTask {
  taskId: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  context?: Record<string, unknown>;
}

export interface DeliveryFile {
  name: string;
  content: string;
}

export interface DeliveryBlock {
  files: DeliveryFile[];
}

export interface WorkerResult {
  taskId: string;
  output: string;
  tokensConsumed?: number;
  model?: string;
  exitCode?: number;
  delivery?: DeliveryBlock | null;
}

type OpenAIChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  usage?: { total_tokens?: number };
  model?: string;
};

export class WorkerHealthProbe {
  static readonly DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

  constructor(private readonly timeoutMs = WorkerHealthProbe.DEFAULT_TIMEOUT_MS) {}

  async run<T>(label: string, op: () => Promise<T>, onTimeout?: () => void): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          onTimeout?.();
        } catch {
          // Ignore timeout cleanup failures and surface the timeout itself.
        }
        reject(new Error(`${label}_timeout`));
      }, this.timeoutMs);

      op()
        .then((value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}

export class WorkerRouter {
  async dispatch(task: WorkerTask, harness: HarnessConfig): Promise<WorkerResult> {
    switch (harness.type) {
      case "openai-compat":
        return await this.dispatchOpenAI(task, harness);
      case "subprocess":
        return await this.dispatchSubprocess(task, harness);
      case "pty":
        return await this.dispatchSubprocess(task, harness);
      default: {
        const exhaustive: never = harness;
        throw new Error(`Unsupported harness: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  async dispatchOpenAI(
    task: WorkerTask,
    harness: Extract<HarnessConfig, { type: "openai-compat" }>
  ): Promise<WorkerResult> {
    const probe = new WorkerHealthProbe(harness.timeoutMs);
    const payload = JSON.stringify({
      model: task.model ?? harness.model,
      messages: [{ role: "user", content: task.prompt }],
      stream: false,
      max_tokens: task.maxTokens,
      metadata: task.context,
    });

    const responseBody = await probe.run("worker_openai_dispatch", async () => {
      return await new Promise<string>((resolve, reject) => {
        const url = this.toChatCompletionsUrl(harness.endpoint);
        const isHttps = url.protocol === "https:";
        const client = isHttps ? https : http;

        const headers: Record<string, string | number> = {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...(harness.headers ?? {}),
        };
        if (harness.token) {
          headers.Authorization = `Bearer ${harness.token}`;
        }

        const req = client.request(
          {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: `${url.pathname}${url.search}`,
            method: "POST",
            headers,
          },
          (res) => {
            let body = "";
            res.on("data", (chunk: Buffer | string) => {
              body += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
            });
            res.on("end", () => {
              if ((res.statusCode ?? 500) >= 400) {
                reject(new Error(`openai_compat_http_${res.statusCode}: ${body.slice(0, 400)}`));
                return;
              }
              resolve(body);
            });
          }
        );

        req.on("error", (error) => reject(new Error(`openai_compat_request_failed: ${error.message}`)));
        req.write(payload);
        req.end();
      });
    });

    let parsed: OpenAIChatCompletionResponse | null = null;
    try {
      parsed = JSON.parse(responseBody) as OpenAIChatCompletionResponse;
    } catch {
      parsed = null;
    }

    const output = this.extractContent(parsed) ?? responseBody;
    return {
      taskId: task.taskId,
      output,
      tokensConsumed: parsed?.usage?.total_tokens,
      model: parsed?.model ?? task.model ?? harness.model,
      delivery: this.parseDeliveryBlock(output),
    };
  }

  async dispatchSubprocess(
    task: WorkerTask,
    harness: Extract<HarnessConfig, { type: "subprocess" | "pty" }>
  ): Promise<WorkerResult> {
    const probe = new WorkerHealthProbe(harness.timeoutMs);
    let stdout = "";
    let stderr = "";
    let childRef: ReturnType<typeof spawn> | null = null;

    const exitCode = await probe.run(
      "worker_subprocess_dispatch",
      async () => {
        return await new Promise<number>((resolve, reject) => {
          const child = spawn(harness.command, harness.args ?? [], {
            cwd: harness.cwd,
            env: {
              ...process.env,
              ...(harness.env ?? {}),
            },
            stdio: ["pipe", "pipe", "pipe"],
          });
          childRef = child;

          child.stdout?.on("data", (chunk: Buffer | string) => {
            stdout += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
          });
          child.stderr?.on("data", (chunk: Buffer | string) => {
            stderr += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
          });

          child.on("error", (error) => reject(new Error(`spawn_failed: ${error.message}`)));
          child.on("close", (code) => resolve(code ?? 1));

          child.stdin?.write(task.prompt);
          child.stdin?.end();
        });
      },
      () => {
        if (!childRef) return;
        childRef.kill("SIGTERM");
        setTimeout(() => {
          if (childRef && !childRef.killed) {
            childRef.kill("SIGKILL");
          }
        }, 5000);
      }
    );

    const output = stdout.trim() || stderr.trim();
    if (exitCode !== 0) {
      const failureOutput = (stderr.trim() || stdout.trim()).slice(0, 500);
      throw new Error(`worker_process_exit_${exitCode}: ${failureOutput}`);
    }

    return {
      taskId: task.taskId,
      output,
      exitCode,
      model: task.model,
      delivery: this.parseDeliveryBlock(output),
    };
  }

  parseDeliveryBlock(output: string): DeliveryBlock | null {
    const match = output.match(/<arc402_delivery>\s*([\s\S]*?)\s*<\/arc402_delivery>/i);
    if (!match) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      return null;
    }

    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { files?: unknown }).files)) {
      return null;
    }

    const files = (parsed as { files: unknown[] }).files
      .map((file) => {
        if (!file || typeof file !== "object") return null;
        const name = (file as { name?: unknown }).name;
        const content = (file as { content?: unknown }).content;
        if (typeof name !== "string" || typeof content !== "string") return null;
        return { name, content };
      })
      .filter((file): file is DeliveryFile => file !== null);

    return { files };
  }

  private toChatCompletionsUrl(endpoint: string): URL {
    const base = new URL(endpoint);
    const normalizedPath = base.pathname.endsWith("/")
      ? base.pathname.slice(0, -1)
      : base.pathname;

    if (normalizedPath.endsWith("/chat/completions")) {
      return base;
    }

    if (normalizedPath.endsWith("/v1")) {
      return new URL(`${base.origin}${normalizedPath}/chat/completions${base.search}`);
    }

    const prefix = normalizedPath.length > 0 ? normalizedPath : "/v1";
    return new URL(`${base.origin}${prefix}/chat/completions${base.search}`);
  }

  private extractContent(parsed: OpenAIChatCompletionResponse | null): string | null {
    const content = parsed?.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n");
    }
    return null;
  }
}
