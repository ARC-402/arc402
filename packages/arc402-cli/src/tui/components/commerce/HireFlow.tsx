import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "../../../renderer/index.js";
import { executeKernelForPayload } from "../../kernel";
import { AgentPicker } from "./AgentPicker";
import type { DiscoverAgent } from "./DiscoverList";
import { ConfirmPrompt } from "../ConfirmPrompt";
import { CustomTextInput } from "../CustomTextInput";
import { CommerceCard, DetailRow, Section } from "./common";

type HireStep = "loading" | "pick" | "task" | "price" | "confirm" | "submitting" | "done" | "error";

export interface HireFlowResult {
  agent: DiscoverAgent;
  task: string;
  price: string;
}

interface HireFlowProps {
  onCancel: () => void;
  onSubmit: (result: HireFlowResult) => Promise<void>;
}

export function HireFlow({ onCancel, onSubmit }: HireFlowProps) {
  const [step, setStep] = useState<HireStep>("loading");
  const [agents, setAgents] = useState<DiscoverAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<DiscoverAgent | null>(null);
  const [task, setTask] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setStep("loading");
      setError(null);
      try {
        const payload = await executeKernelForPayload("discover --limit 5");
        if (!payload || payload.type !== "discover") {
          throw new Error("Discover returned no interactive hire payload.");
        }
        if (payload.props.agents.length === 0) {
          throw new Error("No agents found. Check your config or network.");
        }
        if (cancelled) return;
        setAgents(payload.props.agents);
        setStep("pick");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStep("error");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useInput((event) => {
    if (event.key === "escape") {
      if (step === "submitting") return;
      onCancel();
    }
  });

  const serviceType = selectedAgent?.serviceType || "ai.assistant";
  const summaryTask = useMemo(() => (task.length > 60 ? `${task.slice(0, 60)}…` : task), [task]);

  const submit = async (): Promise<void> => {
    if (!selectedAgent) return;
    setStep("submitting");
    setError(null);
    try {
      await onSubmit({ agent: selectedAgent, task: task.trim(), price: price.trim() });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  };

  if (step === "loading") {
    return (
      <CommerceCard eyebrow="Hire" title="Interactive hire" subtitle="Fetching top agents" status={{ label: "loading", tone: "info" }}>
        <Text dimColor>Discovering agents…</Text>
      </CommerceCard>
    );
  }

  if (step === "error") {
    return (
      <CommerceCard eyebrow="Hire" title="Interactive hire" subtitle="The flow stayed inside the TUI" status={{ label: "error", tone: "danger" }}>
        <Text color="red">{error ?? "Hire failed."}</Text>
        <Box marginTop={1}>
          <Text dimColor>Esc to close</Text>
        </Box>
      </CommerceCard>
    );
  }

  if (step === "done") {
    return (
      <CommerceCard eyebrow="Hire" title="Interactive hire" subtitle="Agreement submitted" status={{ label: "complete", tone: "success" }}>
        <Text color="green">Hire dispatched. Review the agreement card in the viewport above.</Text>
        <Box marginTop={1}>
          <Text dimColor>Esc to close</Text>
        </Box>
      </CommerceCard>
    );
  }

  return (
    <CommerceCard
      eyebrow="Hire"
      title={selectedAgent ? `Hiring ${selectedAgent.name}` : "Interactive hire"}
      subtitle="Discover, price, confirm, and submit without leaving the shell"
      status={{
        label: step === "submitting" ? "submitting" : step,
        tone: step === "submitting" ? "info" : "neutral",
      }}
    >
      {step === "pick" && (
        <Section title="1. Pick agent">
          <AgentPicker
            agents={agents}
            onSelect={(agent) => {
              if (!agent) {
                onCancel();
                return;
              }
              setSelectedAgent(agent);
              setStep("task");
            }}
          />
        </Section>
      )}

      {(step === "task" || step === "price" || step === "confirm" || step === "submitting") && selectedAgent && (
        <Section title="1. Pick agent">
          <Text color="cyan">{selectedAgent.name}</Text>
          <Text dimColor>{selectedAgent.wallet}</Text>
        </Section>
      )}

      {(step === "task" || step === "price" || step === "confirm" || step === "submitting") && selectedAgent && (
        <Section title="2. Describe task">
          <Text dimColor>Enter the work to be done, then press Enter.</Text>
          <CustomTextInput
            value={task}
            onChange={setTask}
            onSubmit={(value) => {
              if (!value.trim()) {
                setError("Task description is required.");
                setStep("error");
                return;
              }
              setTask(value);
              setStep("price");
            }}
            focus={step === "task"}
          />
        </Section>
      )}

      {(step === "price" || step === "confirm" || step === "submitting") && selectedAgent && (
        <Section title="3. Set max price">
          <Text dimColor>Examples: 0.01eth or 1USDC</Text>
          <CustomTextInput
            value={price}
            onChange={setPrice}
            onSubmit={(value) => {
              if (!value.trim()) {
                setError("Price is required.");
                setStep("error");
                return;
              }
              setPrice(value);
              setStep("confirm");
            }}
            focus={step === "price"}
          />
        </Section>
      )}

      {(step === "confirm" || step === "submitting") && selectedAgent && (
        <Section title="4. Confirm">
          <DetailRow label="Agent" value={`${selectedAgent.name} (${selectedAgent.wallet})`} />
          <DetailRow label="Service" value={serviceType} />
          <DetailRow label="Task" value={summaryTask} />
          <DetailRow label="Price" value={price.trim()} />
          {step === "confirm" ? (
            <ConfirmPrompt
              message={`Hire ${selectedAgent.name} for ${price.trim()}?`}
              confirmLabel="Hire"
              cancelLabel="Cancel"
              onConfirm={() => void submit()}
              onCancel={onCancel}
            />
          ) : (
            <Text dimColor>Submitting agreement…</Text>
          )}
        </Section>
      )}

      <Box marginTop={1}>
        <Text dimColor>Esc cancel</Text>
      </Box>
    </CommerceCard>
  );
}
