import { useEffect, useCallback } from "react";
import * as http from "http";
import * as https from "https";

export type DaemonEventType =
  | "hire_proposed"
  | "agreement_accepted"
  | "deliverable_committed"
  | "job_started"
  | "job_completed"
  | "job_failed"
  | "security_threat"
  | "handshake_received"
  | "round_resolved";

export type DaemonEventHandler = (type: DaemonEventType, data: Record<string, unknown>) => void;

const DAEMON_EVENTS_URL = "http://127.0.0.1:4402/events";
const DAEMON_HEALTH_URL = "http://127.0.0.1:4402/health";

function connectSse(urlString: string, onEvent: DaemonEventHandler, onDisconnect: () => void): () => void {
  const url = new URL(urlString);
  const transport = url.protocol === "https:" ? https : http;

  const req = transport.request(
    {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        Connection: "keep-alive",
        "Cache-Control": "no-cache",
      },
    },
    (res) => {
      if ((res.statusCode ?? 500) >= 400) {
        res.resume();
        onDisconnect();
        return;
      }

      let buffer = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        buffer += chunk;

        while (true) {
          const boundary = buffer.indexOf("\n\n");
          if (boundary === -1) break;
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const lines = rawEvent.split(/\r?\n/);
          let type = "message";
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith(":")) continue;
            if (line.startsWith("event:")) {
              type = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trimStart());
            }
          }

          if (!dataLines.length || type === "message") continue;

          try {
            onEvent(type as DaemonEventType, JSON.parse(dataLines.join("\n")) as Record<string, unknown>);
          } catch {
            // ignore malformed event payloads
          }
        }
      });

      res.on("end", onDisconnect);
      res.on("close", onDisconnect);
      res.on("error", onDisconnect);
    }
  );

  req.on("error", onDisconnect);
  req.end();

  return () => {
    req.destroy();
  };
}

function probeHealth(timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL(DAEMON_HEALTH_URL);
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
      },
      (res) => {
        res.resume();
        resolve((res.statusCode ?? 500) < 500);
      }
    );
    req.on("error", () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

export function useDaemonEvents(onEvent: DaemonEventHandler, enabled = true) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableHandler = useCallback(onEvent, []);

  useEffect(() => {
    if (!enabled) return;
    let teardown: (() => void) | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    const scheduleReconnect = () => {
      if (!mounted || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void start();
      }, 5000);
    };

    const start = async () => {
      if (!mounted) return;
      const healthy = await probeHealth();
      if (!healthy) {
        scheduleReconnect();
        return;
      }

      teardown = connectSse(DAEMON_EVENTS_URL, stableHandler, () => {
        teardown?.();
        teardown = null;
        scheduleReconnect();
      });
    };

    void start();

    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      teardown?.();
    };
  }, [enabled, stableHandler]);
}
