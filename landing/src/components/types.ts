export interface OutputLine {
  text: string;
  color?: string;    // cyan, green, red, dim, white
  indent?: number;
  prefix?: "success" | "error" | "info" | "dim";
}

export interface TreeItem {
  label: string;
  value: string;
  last?: boolean;
}

export type Step =
  | { type: "type"; text: string; delay?: number; speed?: number }
  | { type: "execute"; delay?: number }
  | { type: "output"; lines: OutputLine[]; delay?: number }
  | { type: "clear"; delay?: number }
  | { type: "cursor-move"; direction: "up" | "down"; count?: number; delay?: number }
  | { type: "tab"; delay?: number }
  | { type: "dropdown"; items: string[]; selected: number; delay?: number }
  | { type: "dropdown-navigate"; direction: "up" | "down"; delay?: number }
  | { type: "dropdown-select"; delay?: number }
  | { type: "qr"; delay?: number }
  | { type: "qr-dismiss"; delay?: number }
  | { type: "spinner-start"; step: number; total: number; label: string; delay?: number }
  | { type: "spinner-complete"; step: number; detail?: string; delay?: number }
  | { type: "spinner-error"; step: number; error: string; delay?: number }
  | { type: "table"; columns: string[]; rows: string[][]; delay?: number }
  | { type: "table-cursor"; row: number; delay?: number }
  | { type: "toast"; message: string; variant: "info" | "success"; delay?: number }
  | { type: "toast-dismiss"; delay?: number }
  | { type: "tree"; items: TreeItem[]; delay?: number }
  | { type: "pause"; duration: number }
  | { type: "transition"; delay?: number }

export interface Scene {
  id: string;
  title?: string;
  duration: number;
  steps: Step[];
}

export interface TerminalShowcaseProps {
  screenplay: Scene[];
  autoPlay?: boolean;
  loop?: boolean;
  pauseOnHover?: boolean;
  theme?: "dark" | "light";
  width?: string;
  height?: string;
}

// Internal state exposed by useScreenplay
export interface SpinnerState {
  step: number;
  total: number;
  label: string;
  status: "running" | "complete" | "error";
  detail?: string;
  error?: string;
}

export interface TableState {
  columns: string[];
  rows: string[][];
  cursorRow: number | null;
}

export interface DropdownState {
  items: string[];
  selected: number;
  visible: boolean;
}

export interface ToastState {
  message: string;
  variant: "info" | "success";
  visible: boolean;
}

export type ContentBlock =
  | { type: "output"; lines: OutputLine[] }
  | { type: "command"; text: string }
  | { type: "qr" }
  | { type: "spinner"; spinners: SpinnerState[] }
  | { type: "table"; table: TableState }
  | { type: "tree"; items: TreeItem[] }
