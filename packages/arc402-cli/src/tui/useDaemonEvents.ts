import { useEffect, useCallback } from "react";

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

export function useDaemonEvents(onEvent: DaemonEventHandler, enabled = true) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableHandler = useCallback(onEvent, []);

  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    const connect = () => {
      if (!mounted) return;
      try {
        source = new EventSource(DAEMON_EVENTS_URL);

        const handleEvent = (type: string) => (e: Event) => {
          if (!mounted) return;
          try {
            const data = JSON.parse((e as MessageEvent).data ?? "{}") as Record<string, unknown>;
            stableHandler(type as DaemonEventType, data);
          } catch { /* ignore malformed */ }
        };

        const eventTypes: DaemonEventType[] = [
          "hire_proposed",
          "agreement_accepted",
          "deliverable_committed",
          "job_started",
          "job_completed",
          "job_failed",
          "security_threat",
          "handshake_received",
          "round_resolved",
        ];

        for (const type of eventTypes) {
          source.addEventListener(type, handleEvent(type));
        }

        source.onerror = () => {
          source?.close();
          source = null;
          if (mounted) {
            reconnectTimer = setTimeout(connect, 5000);
          }
        };
      } catch {
        if (mounted) reconnectTimer = setTimeout(connect, 5000);
      }
    };

    // Only connect if daemon seems reachable (non-blocking probe)
    fetch("http://127.0.0.1:4402/health", { signal: AbortSignal.timeout(500) })
      .then(() => { if (mounted) connect(); })
      .catch(() => { /* daemon not running, skip silently */ });

    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [enabled, stableHandler]);
}
