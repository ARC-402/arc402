import React from "react";
import { Box } from "ink";
import type { DOMElement } from "ink/build/dom.js";

interface FooterProps {
  children: React.ReactNode;
}

/**
 * Fixed footer containing the input line.
 * Pinned at the bottom of the screen.
 */
export const Footer = React.forwardRef<DOMElement, FooterProps>(function Footer(
  { children },
  ref
) {
  return (
    <Box ref={ref} flexDirection="column" flexShrink={0}>
      {children}
    </Box>
  );
});
