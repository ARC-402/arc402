import { Command } from "commander";
import prompts from "prompts";
import chalk from "chalk";
import { loadConfig, saveConfig } from "../config";
import { c } from "../ui/colors";

type TelegramApiResponse<T = unknown> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramMessageResult = {
  message_id: number;
};

async function telegramApi<T>(botToken: string, method: string, body?: Record<string, unknown>): Promise<TelegramApiResponse<T>> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  const json = await res.json() as TelegramApiResponse<T>;
  return json;
}

async function validateBotToken(botToken: string): Promise<{ ok: true; username?: string } | { ok: false; error: string }> {
  try {
    const res = await telegramApi<{ username?: string }>(botToken, "getMe");
    if (!res.ok) return { ok: false, error: res.description ?? "Telegram rejected the bot token." };
    return { ok: true, username: res.result?.username };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function sendTestMessage(botToken: string, chatId: string, threadId?: number): Promise<{ ok: true; messageId: number } | { ok: false; error: string }> {
  try {
    const res = await telegramApi<TelegramMessageResult>(botToken, "sendMessage", {
      chat_id: chatId,
      ...(threadId !== undefined ? { message_thread_id: threadId } : {}),
      text: "🔧 ARC-402 CLI Telegram delivery test — approval prompts can be sent here.",
    });
    if (!res.ok || !res.result) return { ok: false, error: res.description ?? "Telegram rejected the test message." };
    return { ok: true, messageId: res.result.message_id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function registerTelegramCommands(program: Command): void {
  const telegram = program.command("telegram").description("Configure Telegram delivery for WalletConnect approval prompts");

  telegram.command("show")
    .description("Show current Telegram delivery settings")
    .action(() => {
      const cfg = loadConfig();
      console.log(JSON.stringify({
        telegramBotToken: cfg.telegramBotToken ? "***configured***" : undefined,
        telegramChatId: cfg.telegramChatId,
        telegramThreadId: cfg.telegramThreadId,
      }, null, 2));
    });

  telegram.command("init")
    .description("Interactive setup for Telegram approval-button delivery")
    .option("--bot-token <token>", "Telegram bot token from BotFather")
    .option("--chat-id <id>", "Telegram chat ID, e.g. 123456789 or -100... for groups")
    .option("--thread-id <id>", "Telegram topic/thread ID for forum groups")
    .option("--skip-test", "Skip sending a Telegram test message")
    .action(async (opts: { botToken?: string; chatId?: string; threadId?: string; skipTest?: boolean }) => {
      const existing = loadConfig();

      console.log();
      console.log(chalk.white("Telegram approval-button setup"));
      console.log(chalk.dim("  1. Create a bot with @BotFather"));
      console.log(chalk.dim("  2. Add that bot to the target chat/group"));
      console.log(chalk.dim("  3. Paste the bot token + chat ID below"));
      console.log(chalk.dim("  4. Optional: add a forum topic/thread ID"));
      console.log();

      const answers = await prompts([
        {
          type: opts.botToken ? null : "text",
          name: "botToken",
          message: "Telegram bot token",
          initial: existing.telegramBotToken,
          validate: (value: string) => value.trim().length > 20 ? true : "Enter a valid bot token from BotFather.",
        },
        {
          type: opts.chatId ? null : "text",
          name: "chatId",
          message: "Telegram chat ID",
          initial: existing.telegramChatId,
          validate: (value: string) => value.trim() ? true : "Chat ID is required.",
        },
        {
          type: opts.threadId !== undefined ? null : "text",
          name: "threadId",
          message: "Telegram thread/topic ID (optional)",
          initial: existing.telegramThreadId !== undefined ? String(existing.telegramThreadId) : undefined,
          validate: (value: string) => !value.trim() || /^\d+$/.test(value.trim()) ? true : "Thread ID must be numeric.",
        },
      ], {
        onCancel: () => {
          console.log(chalk.red("✗ Telegram setup cancelled"));
          return true;
        },
      });

      const botToken = (opts.botToken ?? answers.botToken ?? existing.telegramBotToken ?? "").trim();
      const chatId = (opts.chatId ?? answers.chatId ?? existing.telegramChatId ?? "").trim();
      const threadRaw = (opts.threadId ?? answers.threadId ?? "").trim();
      const threadId = threadRaw ? Number(threadRaw) : undefined;

      if (!botToken || !chatId) {
        console.log(chalk.red("✗ Telegram setup incomplete"));
        return;
      }

      process.stdout.write("Validating bot token… ");
      const botCheck = await validateBotToken(botToken);
      if (!botCheck.ok) {
        console.log(chalk.red("failed"));
        console.log(chalk.red(`  ${botCheck.error}`));
        console.log(chalk.dim("  Fix the bot token first, then rerun `arc402 telegram init`."));
        return;
      }
      console.log(chalk.green(`✓ ${botCheck.username ? `@${botCheck.username}` : "bot ok"}`));

      const cfg = {
        ...existing,
        telegramBotToken: botToken,
        telegramChatId: chatId,
        ...(threadId !== undefined ? { telegramThreadId: threadId } : {}),
      };
      if (threadId === undefined) delete cfg.telegramThreadId;
      saveConfig(cfg);

      console.log();
      console.log(" " + c.success + c.white(" Telegram delivery saved"));
      console.log(chalk.dim("  Chat ID          ") + chalk.white(chatId));
      console.log(chalk.dim("  Thread ID        ") + chalk.white(threadId !== undefined ? String(threadId) : "(none)"));
      console.log();

      if (!opts.skipTest) {
        process.stdout.write("Sending test message… ");
        const test = await sendTestMessage(botToken, chatId, threadId);
        if (!test.ok) {
          console.log(chalk.red("failed"));
          console.log(chalk.red(`  ${test.error}`));
          console.log(chalk.dim("  The config is saved, but Telegram delivery will not work until the bot can message that chat/topic."));
          return;
        }
        console.log(chalk.green(`✓ message ${test.messageId}`));
      }

      console.log(chalk.dim("  Next: any WalletConnect-backed ARC-402 CLI command can now send approval prompts here."));
    });
}
