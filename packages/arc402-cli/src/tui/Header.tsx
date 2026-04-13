import React from "react";
import { Box, useTerminalSize } from "../renderer/index.js";
import { getBannerLines } from "../ui/banner";
import { AnsiTextLine } from "./components/AnsiTextLine.js";

interface HeaderProps {
  version: string;
  network?: string;
  wallet?: string;
  balance?: string;
}

/**
 * Fixed header showing the ASCII art banner + status info.
 * Never re-renders unless config changes.
 */
export const Header = React.memo(function Header({
  network,
  wallet,
  balance,
}: HeaderProps) {
  const { columns } = useTerminalSize();
  const bannerLines = getBannerLines({ network, wallet, balance, width: columns });

  return (
    <Box flexDirection="column" flexShrink={0}>
      {bannerLines.map((line, i) => (
        <AnsiTextLine key={i} line={line} />
      ))}
    </Box>
  );
});
