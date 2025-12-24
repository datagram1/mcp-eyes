'use client';

import { useState, useEffect, useRef, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface StreamState {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string;
  sessionId?: string;
  fps?: number;
  latency?: number;
  bandwidth?: number;
}

interface PageProps {
  params: Promise<{ agentId: string }>;
}

export default function ViewerPage({ params }: PageProps) {
  const { agentId } = use(params);
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameImageRef = useRef<HTMLImageElement | null>(null);

  const [streamState, setStreamState] = useState<StreamState>({
    status: 'connecting',
  });
  const [agentInfo, setAgentInfo] = useState<{ hostname: string } | null>(null);
  const [quality, setQuality] = useState(80);
  const [maxFps, setMaxFps] = useState(30);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [frameCount, setFrameCount] = useState(0);

  // Track canvas dimensions
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });

  // Request stream token and connect
  const connect = useCallback(async () => {
    setStreamState({ status: 'connecting' });

    try {
      // Request stream token
      const tokenRes = await fetch('/api/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          quality,
          maxFps,
        }),
      });

      if (!tokenRes.ok) {
        const data = await tokenRes.json();
        throw new Error(data.error || 'Failed to get stream token');
      }

      const tokenData = await tokenRes.json();
      setAgentInfo(tokenData.agent);

      // Connect to WebSocket
      const ws = new WebSocket(tokenData.wsUrl);
      wsRef.current = ws;

      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        // Send stream_start with token
        ws.send(JSON.stringify({
          type: 'stream_start',
          sessionToken: tokenData.token,
        }));
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          const msg = JSON.parse(event.data);
          handleMessage(msg);
        } else {
          // Binary frame data
          handleFrameData(event.data);
        }
      };

      ws.onerror = () => {
        setStreamState({
          status: 'error',
          error: 'WebSocket connection error',
        });
      };

      ws.onclose = (event) => {
        if (streamState.status !== 'error') {
          setStreamState({
            status: 'disconnected',
            error: event.reason || 'Connection closed',
          });
        }
      };
    } catch (err) {
      setStreamState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to connect',
      });
    }
  }, [agentId, quality, maxFps]);

  // Handle incoming messages
  const handleMessage = useCallback((msg: Record<string, unknown>) => {
    switch (msg.type) {
      case 'stream_started':
        setStreamState({
          status: 'connected',
          sessionId: msg.sessionId as string,
        });
        // Set initial canvas size
        if (msg.width && msg.height) {
          setCanvasDimensions({
            width: msg.width as number,
            height: msg.height as number,
          });
        }
        break;

      case 'stream_stopped':
        setStreamState({
          status: 'disconnected',
          error: 'Stream stopped',
        });
        break;

      case 'frame':
        // Frame header - binary data follows
        break;

      case 'cursor':
        // Update cursor position/shape
        break;

      case 'stats':
        setStreamState((prev) => ({
          ...prev,
          fps: msg.fps as number | undefined,
          latency: msg.latency as number | undefined,
          bandwidth: msg.bandwidth as number | undefined,
        }));
        break;

      case 'error':
        setStreamState({
          status: 'error',
          error: msg.error as string || 'Unknown error',
        });
        break;

      case 'pong':
        // Connection alive
        break;
    }
  }, []);

  // Handle binary frame data (JPEG image)
  const handleFrameData = useCallback((data: ArrayBuffer) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create blob from binary data
    const blob = new Blob([data], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);

    // Load image and draw to canvas
    const img = frameImageRef.current || new Image();
    frameImageRef.current = img;

    img.onload = () => {
      // Update canvas dimensions if needed
      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width;
        canvas.height = img.height;
        setCanvasDimensions({ width: img.width, height: img.height });
      }

      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      setFrameCount((prev) => prev + 1);
    };

    img.src = url;
  }, []);

  // Send input event
  const sendInput = useCallback((inputData: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'input',
        ...inputData,
      }));
    }
  }, []);

  // Calculate mouse coordinates relative to actual screen
  const getRelativeCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  }, []);

  // Mouse event handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getRelativeCoords(e);
    sendInput({
      inputType: 'mouse',
      x,
      y,
      buttons: e.buttons,
    });
  }, [getRelativeCoords, sendInput]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getRelativeCoords(e);
    sendInput({
      inputType: 'mouse',
      x,
      y,
      button: e.button,
      buttons: e.buttons,
      isKeyDown: true,
    });
  }, [getRelativeCoords, sendInput]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getRelativeCoords(e);
    sendInput({
      inputType: 'mouse',
      x,
      y,
      button: e.button,
      buttons: e.buttons,
      isKeyDown: false,
    });
  }, [getRelativeCoords, sendInput]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getRelativeCoords(e);
    sendInput({
      inputType: 'mouse',
      x,
      y,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
    });
  }, [getRelativeCoords, sendInput]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
  }, []);

  // Keyboard event handlers
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    sendInput({
      inputType: 'keyboard',
      key: e.key,
      keyCode: e.keyCode,
      modifiers:
        (e.shiftKey ? 1 : 0) |
        (e.ctrlKey ? 2 : 0) |
        (e.altKey ? 4 : 0) |
        (e.metaKey ? 8 : 0),
      isKeyDown: true,
    });
  }, [sendInput]);

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    sendInput({
      inputType: 'keyboard',
      key: e.key,
      keyCode: e.keyCode,
      modifiers:
        (e.shiftKey ? 1 : 0) |
        (e.ctrlKey ? 2 : 0) |
        (e.altKey ? 4 : 0) |
        (e.metaKey ? 8 : 0),
      isKeyDown: false,
    });
  }, [sendInput]);

  // Quality change handler
  const handleQualityChange = useCallback((newQuality: number, newFps?: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'quality_change',
        quality: newQuality,
        maxFps: newFps ?? maxFps,
      }));
      setQuality(newQuality);
      if (newFps) setMaxFps(newFps);
    }
  }, [maxFps]);

  // Request refresh
  const handleRefresh = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'refresh' }));
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'stream_stop' }));
      wsRef.current.close();
      wsRef.current = null;
    }
    setStreamState({ status: 'disconnected' });
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Ping interval to keep connection alive
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700 transition-opacity ${
          showControls ? 'opacity-100' : 'opacity-0 hover:opacity-100'
        }`}
        onMouseEnter={() => setShowControls(true)}
      >
        <div className="flex items-center space-x-4">
          <Link
            href={`/dashboard/agents/${agentId}`}
            className="text-slate-400 hover:text-white"
          >
            &larr; Back
          </Link>
          <div className="text-white font-medium">
            {agentInfo?.hostname || 'Connecting...'}
          </div>
          <div className={`px-2 py-1 rounded text-xs font-medium ${
            streamState.status === 'connected'
              ? 'bg-green-600 text-white'
              : streamState.status === 'connecting'
              ? 'bg-yellow-600 text-white'
              : 'bg-red-600 text-white'
          }`}>
            {streamState.status.toUpperCase()}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Stats */}
          {streamState.status === 'connected' && (
            <div className="flex items-center space-x-3 text-slate-400 text-sm">
              <span>Frames: {frameCount}</span>
              {streamState.fps && <span>FPS: {streamState.fps}</span>}
              {streamState.latency && <span>Latency: {streamState.latency}ms</span>}
            </div>
          )}

          {/* Quality controls */}
          <div className="flex items-center space-x-2">
            <label className="text-slate-400 text-sm">Quality:</label>
            <select
              value={quality}
              onChange={(e) => handleQualityChange(parseInt(e.target.value))}
              className="px-2 py-1 bg-slate-700 text-white text-sm rounded border border-slate-600"
            >
              <option value={50}>Low (50%)</option>
              <option value={70}>Medium (70%)</option>
              <option value={80}>High (80%)</option>
              <option value={90}>Very High (90%)</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-slate-400 text-sm">Max FPS:</label>
            <select
              value={maxFps}
              onChange={(e) => handleQualityChange(quality, parseInt(e.target.value))}
              className="px-2 py-1 bg-slate-700 text-white text-sm rounded border border-slate-600"
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </div>

          {/* Action buttons */}
          <button
            onClick={handleRefresh}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            title="Request full frame refresh"
          >
            Refresh
          </button>

          <button
            onClick={toggleFullscreen}
            className="px-3 py-1 bg-slate-600 text-white text-sm rounded hover:bg-slate-500"
          >
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>

          {streamState.status === 'connected' ? (
            <button
              onClick={disconnect}
              className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
            >
              Disconnect
            </button>
          ) : streamState.status !== 'connecting' && (
            <button
              onClick={connect}
              className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
            >
              Reconnect
            </button>
          )}
        </div>
      </div>

      {/* Canvas container */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden"
        onMouseLeave={() => setShowControls(false)}
      >
        {streamState.status === 'connecting' && (
          <div className="flex flex-col items-center text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
            <div>Connecting to stream...</div>
          </div>
        )}

        {streamState.status === 'error' && (
          <div className="flex flex-col items-center text-white">
            <div className="text-red-500 text-6xl mb-4">!</div>
            <div className="text-xl mb-2">Connection Error</div>
            <div className="text-slate-400 mb-4">{streamState.error}</div>
            <button
              onClick={connect}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        )}

        {streamState.status === 'disconnected' && (
          <div className="flex flex-col items-center text-white">
            <div className="text-slate-400 text-6xl mb-4">-</div>
            <div className="text-xl mb-2">Disconnected</div>
            <div className="text-slate-400 mb-4">{streamState.error || 'Stream ended'}</div>
            <button
              onClick={connect}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Reconnect
            </button>
          </div>
        )}

        {(streamState.status === 'connected' || frameCount > 0) && (
          <canvas
            ref={canvasRef}
            tabIndex={0}
            className="max-w-full max-h-full object-contain cursor-none focus:outline-none"
            style={{
              width: canvasDimensions.width > 0 ? 'auto' : '100%',
              height: canvasDimensions.height > 0 ? 'auto' : '100%',
            }}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
          />
        )}
      </div>

      {/* Footer info */}
      {streamState.status === 'connected' && (
        <div className="px-4 py-1 bg-slate-900 border-t border-slate-700 text-slate-500 text-xs">
          Click on the canvas to enable keyboard input. Esc to release focus.
          {canvasDimensions.width > 0 && (
            <span className="ml-4">
              Resolution: {canvasDimensions.width} x {canvasDimensions.height}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
