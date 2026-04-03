import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DAEMON_DIR = path.join(os.homedir(), ".arc402");
const CONSOLIDATION_THRESHOLD_BYTES = 8192; // 8KB — consolidate when learnings exceed this

export interface CompletedJobContext {
  workerId: string;
  harness: string;
  task: string;
  deliverable: string;
  agreementId: string;
  durationMs: number;
}

export class ContextManager {
  private consolidationLock = false;

  private getLearningsPath(workerId: string): string {
    return path.join(DAEMON_DIR, "worker", workerId, "memory", "learnings.md");
  }

  private extractLearningsFromJob(job: CompletedJobContext): string {
    // Extract key learnings from job output
    const timestamp = new Date().toISOString().split("T")[0];
    const lines = [
      `\n## Job #${job.agreementId} — ${timestamp}`,
      `Task: ${job.task.slice(0, 100)}${job.task.length > 100 ? "..." : ""}`,
      `Duration: ${Math.round(job.durationMs / 1000)}s`,
    ];

    // Extract any explicit learnings blocks from deliverable
    const learningMatch = job.deliverable.match(/#+\s*learnings?\s*\n([\s\S]*?)(?=\n#+|\s*$)/i);
    if (learningMatch) {
      lines.push(learningMatch[1].trim());
    } else if (job.deliverable.length > 0) {
      // Summarize first 200 chars as context
      lines.push(`Output summary: ${job.deliverable.slice(0, 200).replace(/\n/g, " ")}...`);
    }

    return lines.join("\n") + "\n";
  }

  async onJobComplete(job: CompletedJobContext): Promise<void> {
    try {
      const learningsPath = this.getLearningsPath(job.workerId);
      const dir = path.dirname(learningsPath);

      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Append job learnings
      const learning = this.extractLearningsFromJob(job);
      fs.appendFileSync(learningsPath, learning, "utf-8");

      // Check if consolidation needed
      const size = fs.existsSync(learningsPath) ? fs.statSync(learningsPath).size : 0;
      if (size > CONSOLIDATION_THRESHOLD_BYTES && !this.consolidationLock) {
        setImmediate(() => this.consolidate(job.workerId, job.harness).catch(() => {}));
      }
    } catch {
      // Never crash the daemon on context management failure
    }
  }

  async consolidate(workerId: string, _harness: string): Promise<void> {
    if (this.consolidationLock) return;
    this.consolidationLock = true;

    try {
      const learningsPath = this.getLearningsPath(workerId);
      if (!fs.existsSync(learningsPath)) return;

      const content = fs.readFileSync(learningsPath, "utf-8");
      const lines = content.split("\n");

      // Keep only the last 50 job entries — prune the oldest
      const jobHeaders = lines
        .map((l, i) => ({ idx: i, isHeader: l.startsWith("## Job #") }))
        .filter((l) => l.isHeader);

      if (jobHeaders.length > 50) {
        // Remove oldest entries, keep most recent 50
        const cutIdx = jobHeaders[jobHeaders.length - 50].idx;
        const pruned = [
          "# Accumulated Learnings",
          "",
          `*Consolidated — ${new Date().toISOString().split("T")[0]}. Showing ${50} most recent jobs.*`,
          "",
          ...lines.slice(cutIdx),
        ].join("\n");
        fs.writeFileSync(learningsPath, pruned, "utf-8");
      }
    } finally {
      this.consolidationLock = false;
    }
  }
}

export const contextManager = new ContextManager();
