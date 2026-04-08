import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { InputSystem, KeyEvent } from './input.js';

type InputListener = (event: KeyEvent) => void;

interface RuntimeContextValue {
  exit: () => void;
  subscribeInput: (listener: InputListener) => () => void;
  registerFocusable: (id: string) => () => void;
  focusedId: string | null;
  terminalSize: { rows: number; columns: number };
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export interface RuntimeProviderProps {
  exit: () => void;
  children?: React.ReactNode;
}

export function RuntimeProvider({ exit, children }: RuntimeProviderProps) {
  const inputSystemRef = useRef<InputSystem | null>(null);
  const listenersRef = useRef<Set<InputListener>>(new Set());
  const focusablesRef = useRef<string[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [terminalSize, setTerminalSize] = useState({
    rows: process.stdout?.rows ?? 24,
    columns: process.stdout?.columns ?? 80,
  });

  useEffect(() => {
    const stdout = process.stdout;
    if (!stdout) return;

    const handleResize = () => {
      setTerminalSize({
        rows: stdout.rows ?? 24,
        columns: stdout.columns ?? 80,
      });
    };

    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, []);

  const cycleFocus = useCallback((direction: 1 | -1) => {
    const focusables = focusablesRef.current;
    if (focusables.length === 0) return false;

    setFocusedId((current) => {
      const currentIndex = current ? focusables.indexOf(current) : -1;
      const startIndex = currentIndex >= 0 ? currentIndex : direction === 1 ? -1 : 0;
      const nextIndex = (startIndex + direction + focusables.length) % focusables.length;
      return focusables[nextIndex] ?? null;
    });

    return true;
  }, []);

  useEffect(() => {
    const inputSystem = new InputSystem();
    inputSystemRef.current = inputSystem;

    const handleKey = (event: KeyEvent) => {
      if (event.key === 'tab') {
        if (cycleFocus(1)) return;
      }
      if (event.key === 'shift-tab') {
        if (cycleFocus(-1)) return;
      }
      for (const listener of Array.from(listenersRef.current)) {
        listener(event);
      }
    };

    inputSystem.on('key', handleKey);
    inputSystem.start();

    return () => {
      inputSystem.off('key', handleKey);
      inputSystem.stop();
      inputSystemRef.current = null;
    };
  }, [cycleFocus]);

  const subscribeInput = useCallback((listener: InputListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const registerFocusable = useCallback((id: string) => {
    const focusables = focusablesRef.current;
    if (!focusables.includes(id)) {
      focusables.push(id);
      setFocusedId((current) => current ?? id);
    }

    return () => {
      const nextFocusables = focusablesRef.current.filter((item) => item !== id);
      focusablesRef.current = nextFocusables;
      setFocusedId((current) => {
        if (current !== id) return current;
        return nextFocusables[0] ?? null;
      });
    };
  }, []);

  const value = useMemo<RuntimeContextValue>(() => ({
    exit,
    subscribeInput,
    registerFocusable,
    focusedId,
    terminalSize,
  }), [exit, focusedId, registerFocusable, subscribeInput, terminalSize]);

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

function useRuntimeContext(): RuntimeContextValue {
  const context = useContext(RuntimeContext);
  if (!context) {
    throw new Error('Renderer runtime hooks must be used within RuntimeProvider');
  }
  return context;
}

export function useApp() {
  const { exit } = useRuntimeContext();
  return { exit };
}

export function useInput(listener: InputListener, options: { isActive?: boolean } = {}) {
  const { subscribeInput } = useRuntimeContext();
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  const isActive = options.isActive ?? true;

  useEffect(() => {
    if (!isActive) return;
    return subscribeInput((event) => {
      listenerRef.current(event);
    });
  }, [isActive, subscribeInput]);
}

let focusCounter = 0;

export function useFocus(enabled = true) {
  const { registerFocusable, focusedId } = useRuntimeContext();
  const idRef = useRef<string | null>(null);
  if (idRef.current === null) {
    focusCounter += 1;
    idRef.current = `focus-${focusCounter}`;
  }

  useEffect(() => {
    if (!enabled || !idRef.current) return;
    return registerFocusable(idRef.current);
  }, [enabled, registerFocusable]);

  return {
    isFocused: enabled && focusedId === idRef.current,
  };
}

export function useTerminalSize() {
  const { terminalSize } = useRuntimeContext();
  return terminalSize;
}
