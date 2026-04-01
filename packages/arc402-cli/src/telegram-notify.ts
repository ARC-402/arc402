import * as https from "https";

/** Generic Telegram message sender. Fire-and-forget — swallows errors. */
export async function sendTelegramMessage(opts: {
  botToken: string;
  chatId: string;
  threadId?: number;
  text: string;
  buttons?: { text: string; url?: string; callback_data?: string }[][];
}): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: opts.chatId,
    text: opts.text,
  };
  if (opts.threadId !== undefined) body.message_thread_id = opts.threadId;
  if (opts.buttons && opts.buttons.length > 0) {
    body.reply_markup = { inline_keyboard: opts.buttons };
  }

  const payload = JSON.stringify(body);
  await new Promise<void>((resolve) => {
    try {
      const req = https.request(
        {
          hostname: "api.telegram.org",
          path: `/bot${opts.botToken}/sendMessage`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => { res.resume(); resolve(); }
      );
      req.on("error", () => resolve());
      req.write(payload);
      req.end();
    } catch {
      resolve();
    }
  });
}

export async function sendWalletConnectApprovalButton(opts: {
  botToken: string;
  chatId: string;
  threadId?: number;
  prompt: string;
  walletLinks: { label: string; url: string }[];
}): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: opts.chatId,
    text: opts.prompt,
    reply_markup: {
      inline_keyboard: [opts.walletLinks.map((link) => ({ text: link.label, url: link.url }))],
    },
  };
  if (opts.threadId !== undefined) {
    body.message_thread_id = opts.threadId;
  }

  const payload = JSON.stringify(body);

  await new Promise<void>((resolve) => {
    try {
      const req = https.request(
        {
          hostname: "api.telegram.org",
          path: `/bot${opts.botToken}/sendMessage`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          res.resume(); // drain response body
          resolve();
        }
      );
      req.on("error", () => resolve());
      req.write(payload);
      req.end();
    } catch {
      resolve();
    }
  });
}
