import ora, { Ora } from "ora";
import chalk from "chalk";

const SPINNER_FRAMES = {
  interval: 120,
  frames: ["◈ ", "◉ ", "◎ ", "◉ "],
};

export interface ArcSpinner {
  succeed(text?: string): void;
  fail(text?: string): void;
  update(text: string): void;
  stop(): void;
}

export function startSpinner(text: string): ArcSpinner {
  if (process.env.ARC402_PRINT) {
    process.stdout.write(text + "\n");
    return {
      succeed(msg?: string) { if (msg) process.stdout.write("✓ " + msg + "\n"); },
      fail(msg?: string) { if (msg) process.stderr.write("✗ " + msg + "\n"); },
      update(t: string) { process.stdout.write(t + "\n"); },
      stop() {},
    };
  }

  const instance: Ora = ora({
    text,
    spinner: SPINNER_FRAMES,
    color: "cyan",
    prefixText: " ",
  }).start();

  return {
    succeed(msg?: string) {
      instance.stopAndPersist({
        symbol: chalk.green("✓"),
        text: msg ?? instance.text,
        prefixText: " ",
      });
    },
    fail(msg?: string) {
      instance.stopAndPersist({
        symbol: chalk.red("✗"),
        text: msg ?? instance.text,
        prefixText: " ",
      });
    },
    update(text: string) {
      instance.text = text;
    },
    stop() {
      instance.stop();
    },
  };
}
