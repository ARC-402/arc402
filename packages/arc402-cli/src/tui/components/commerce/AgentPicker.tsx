import React, { useState } from "react";
import { Text, useInput } from "../../../renderer/index.js";
import type { DiscoverAgent } from "./DiscoverList";

export interface AgentPickerProps {
  agents: DiscoverAgent[];
  onSelect: (agent: DiscoverAgent | null) => void;
}

export function AgentPicker({ agents, onSelect }: AgentPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((event) => {
    if (event.key === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "down") {
      setSelectedIndex((i) => Math.min(agents.length - 1, i + 1));
    } else if (event.key === "enter") {
      onSelect(agents[selectedIndex] ?? null);
    } else if (event.key === "escape" || (event.key === "char" && event.char === "q")) {
      onSelect(null);
    }
  });

  return (
    <Text>
      {agents.map((agent, i) => {
        const isLast = i === agents.length - 1;
        const border = isLast ? "└─" : "├─";
        const isSelected = i === selectedIndex;
        const statusBadge = agent.endpointStatus === "online" ? "◉" : agent.endpointStatus === "offline" ? "⊘" : "○";
        const price = agent.priceLabel ?? "?";
        const line = `  #${agent.rank}  ${border} ${agent.name.padEnd(20)} trust ${String(agent.trustScore).padStart(4)}   ${price.padEnd(12)} ${statusBadge}`;
        return (
          <Text key={agent.wallet} color={isSelected ? "cyan" : undefined} bold={isSelected}>
            {isSelected ? "▶ " : "  "}{line.trimStart()}{"\n"}
          </Text>
        );
      })}
      {"\n"}
      <Text dimColor>↑↓ select · Enter pick · Esc cancel</Text>
    </Text>
  );
}
