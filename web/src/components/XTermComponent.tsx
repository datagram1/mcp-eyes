'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface XTermComponentProps {
  onInput: (data: string) => void;
  onReady: (write: (data: string) => void, focus: () => void) => void;
}

export default function XTermComponent({ onInput, onReady }: XTermComponentProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Write to terminal
  const write = useCallback((data: string) => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.write(data);
    }
  }, []);

  // Focus the terminal
  const focus = useCallback(() => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Fira Code", "Cascadia Code", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#c0caf5',
        cursor: '#c0caf5',
        cursorAccent: '#1a1b26',
        selectionBackground: '#33467c',
        black: '#15161e',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#bb9af7',
        cyan: '#7dcfff',
        white: '#a9b1d6',
        brightBlack: '#414868',
        brightRed: '#f7768e',
        brightGreen: '#9ece6a',
        brightYellow: '#e0af68',
        brightBlue: '#7aa2f7',
        brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff',
        brightWhite: '#c0caf5',
      },
      allowProposedApi: true,
    });

    // Create fit addon
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal
    terminal.open(terminalRef.current);

    // Initial fit and focus
    setTimeout(() => {
      fitAddon.fit();
      // Focus the terminal so it receives keyboard input
      // This is critical for Playwright/automated browser access
      terminal.focus();
    }, 0);

    // Store refs
    terminalInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle user input
    terminal.onData((data) => {
      console.log('[XTerm] onData received:', data.length, 'chars');
      onInput(data);
    });

    // Notify parent that terminal is ready (with write and focus functions)
    onReady(write, focus);

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
      // Maintain focus after resize
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.focus();
      }
    };

    window.addEventListener('resize', handleResize);

    // Handle click to ensure focus (for Playwright and accessibility)
    const handleClick = () => {
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.focus();
      }
    };

    // Handle focusin to ensure xterm's internal textarea gets focus
    const handleFocusIn = () => {
      if (terminalInstanceRef.current) {
        // Small delay to let the focus event settle, then ensure terminal has focus
        setTimeout(() => {
          if (terminalInstanceRef.current) {
            terminalInstanceRef.current.focus();
          }
        }, 10);
      }
    };

    if (terminalRef.current) {
      terminalRef.current.addEventListener('click', handleClick);
      terminalRef.current.addEventListener('focusin', handleFocusIn);
    }

    // Initial resize and focus after a brief delay
    setTimeout(() => {
      handleResize();
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.focus();
      }
    }, 100);

    // Additional delayed focus for Firefox compatibility
    setTimeout(() => {
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.focus();
      }
    }, 500);

    // Cleanup
    const currentTerminalRef = terminalRef.current;
    return () => {
      window.removeEventListener('resize', handleResize);
      if (currentTerminalRef) {
        currentTerminalRef.removeEventListener('click', handleClick);
        currentTerminalRef.removeEventListener('focusin', handleFocusIn);
      }
      terminal.dispose();
    };
  }, [onInput, onReady, write, focus]);

  return (
    <div
      ref={terminalRef}
      className="h-full w-full"
      style={{ padding: '8px' }}
      data-testid="terminal"
    />
  );
}
