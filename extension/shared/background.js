/**
 * MCP Eyes - Background Script
 *
 * Handles:
 *   - WebSocket connection to Browser Bridge Server
 *   - Native messaging to mcp_eyes MCP server (fallback)
 *   - Routing messages between content scripts and mcp_eyes
 *   - Tab management and state
 *
 * Works as Service Worker (Chrome MV3) or persistent background (Firefox MV2)
 */

// Browser API compatibility - get API before IIFE to avoid shadowing
const browserAPI = (() => {
  // Try browser first (Firefox), then chrome (Chrome)
  if (typeof browser !== 'undefined' && browser.tabs) {
    return browser;
  }
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    return chrome;
  }
  console.error('[MCP Eyes] No browser API available!');
  return null;
})();

(function() {
  'use strict';

  if (!browserAPI) {
    console.error('[MCP Eyes] Cannot start - no browser API!');
    return;
  }

  // Browser Bridge Server WebSocket URL
  const BROWSER_BRIDGE_URL = 'ws://127.0.0.1:3457';

  // Native messaging host name (must match the host manifest) - fallback
  const NATIVE_HOST = 'com.mcpeyes.bridge';

  /**
   * Detect browser type from user agent
   */
  function detectBrowser() {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) {
      return { name: 'firefox', displayName: 'Firefox' };
    } else if (ua.includes('Edg/')) {
      return { name: 'edge', displayName: 'Microsoft Edge' };
    } else if (ua.includes('Chrome')) {
      return { name: 'chrome', displayName: 'Google Chrome' };
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
      return { name: 'safari', displayName: 'Safari' };
    }
    return { name: 'unknown', displayName: 'Unknown Browser' };
  }

  // WebSocket connection
  let wsConnection = null;
  let wsConnected = false;
  let wsReconnectTimeout = null;

  // Native messaging port (fallback)
  let nativePort = null;
  let nativePortConnected = false;
  let keepaliveInterval = null;
  let reconnectTimeout = null;

  // Pending requests waiting for responses
  const pendingNativeRequests = new Map();
  let nativeRequestIdCounter = 0;

  /**
   * Connect to Browser Bridge Server via WebSocket
   */
  function connectWebSocket() {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      return true;
    }

    // Clear any pending reconnect
    if (wsReconnectTimeout) {
      clearTimeout(wsReconnectTimeout);
      wsReconnectTimeout = null;
    }

    try {
      console.log('[MCP Eyes] Connecting to Browser Bridge via WebSocket...');
      wsConnection = new WebSocket(BROWSER_BRIDGE_URL);

      wsConnection.onopen = () => {
        console.log('[MCP Eyes] WebSocket connected to Browser Bridge');
        wsConnected = true;

        // Send browser identification
        const browserInfo = detectBrowser();
        wsConnection.send(JSON.stringify({
          action: 'identify',
          id: 'init',
          browser: browserInfo.name,
          browserName: browserInfo.displayName,
          userAgent: navigator.userAgent
        }));
        console.log('[MCP Eyes] Sent browser identification:', browserInfo.name);
      };

      wsConnection.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (err) {
          console.error('[MCP Eyes] Invalid WebSocket message:', err);
        }
      };

      wsConnection.onclose = () => {
        console.log('[MCP Eyes] WebSocket disconnected');
        wsConnected = false;
        wsConnection = null;

        // Reject pending requests
        pendingNativeRequests.forEach(({ reject, timeout }) => {
          clearTimeout(timeout);
          reject(new Error('WebSocket disconnected'));
        });
        pendingNativeRequests.clear();

        // Schedule reconnection
        console.log('[MCP Eyes] WebSocket will reconnect in 5 seconds...');
        wsReconnectTimeout = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      };

      wsConnection.onerror = (err) => {
        console.error('[MCP Eyes] WebSocket error:', err);
      };

      return true;
    } catch (error) {
      console.error('[MCP Eyes] Failed to create WebSocket:', error);
      // Fall back to native messaging
      return connectNativeHost();
    }
  }

  /**
   * Handle messages from Browser Bridge via WebSocket
   */
  async function handleWebSocketMessage(message) {
    console.log('[MCP Eyes] Received from WebSocket:', message);

    const { id, action, payload, response, error } = message;

    // If this is a response to a pending request
    if (id && pendingNativeRequests.has(id)) {
      const pending = pendingNativeRequests.get(id);
      clearTimeout(pending.timeout);
      pendingNativeRequests.delete(id);

      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(response);
      }
      return;
    }

    // If this is a command from the server
    if (action) {
      try {
        let result;
        switch (action) {
          case 'ping':
            result = { status: 'ok', timestamp: Date.now() };
            break;

          case 'getTabs':
            result = await getOpenTabs();
            break;

          case 'getActiveTab':
            result = await getActiveTab();
            break;

          case 'focusTab':
            result = await focusTab(payload?.tabId);
            break;

          case 'getPageInfo':
          case 'getPageContext':
          case 'getInteractiveElements':
          case 'clickElement':
          case 'fillElement':
          case 'scrollTo':
          case 'executeScript':
          case 'getFormData':
          case 'setWatchMode':
          // New tools
          case 'getVisibleText':
          case 'waitForSelector':
          case 'waitForPageLoad':
          case 'selectOption':
          case 'isElementVisible':
          case 'getConsoleLogs':
          case 'getNetworkRequests':
          case 'getLocalStorage':
          case 'getCookies':
          // Enhanced tools
          case 'inspectCurrentPage':
          case 'getUIElements':
          case 'fillFormField':
          // New enhanced tools
          case 'clickByText':
          case 'clickMultiple':
          case 'getFormStructure':
          case 'answerQuestions':
          // Combo-box tools
          case 'getDropdownOptions':
          // LLM introspection tools
          case 'listInteractiveElements':
          case 'clickElementWithDebug':
          case 'findElementWithDebug':
            result = await sendToContentScript(payload?.tabId, { action, payload });
            break;

          case 'findTabByUrl':
            result = await findTabByUrl(payload?.urlPattern);
            break;

          case 'createTab':
            result = await createTab(payload?.url);
            break;

          case 'closeTab':
            result = await closeTab(payload?.tabId);
            break;

          // ========== BROWSER AUTOMATION TOOLS (Playwright-style) ==========

          case 'navigate':
            result = await navigateToUrl(payload?.tabId, payload?.url, payload?.waitUntil, payload?.timeout);
            break;

          case 'screenshot':
            result = await captureScreenshot(payload?.tabId, payload?.selector, payload?.fullPage);
            break;

          case 'goBack':
            result = await goBack(payload?.tabId);
            break;

          case 'goForward':
            result = await goForward(payload?.tabId);
            break;

          case 'hover':
          case 'drag':
          case 'pressKey':
          case 'getVisibleHtml':
          case 'uploadFile':
            result = await sendToContentScript(payload?.tabId, { action, payload });
            break;

          case 'saveAsPdf':
            result = { error: 'saveAsPdf requires native browser print API - use Cmd+P or browser.tabs.saveAsPDF (Firefox only)' };
            break;

          default:
            result = { error: `Unknown action: ${action}` };
        }

        // Send response back
        if (id && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          wsConnection.send(JSON.stringify({ id, response: result }));
        }
      } catch (err) {
        if (id && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          wsConnection.send(JSON.stringify({ id, error: err.message }));
        }
      }
    }
  }

  /**
   * Connect to the native messaging host (fallback)
   */
  function connectNativeHost() {
    if (nativePort && nativePortConnected) {
      return true;
    }

    // Clear any pending reconnect
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    try {
      nativePort = browserAPI.runtime.connectNative(NATIVE_HOST);
      nativePortConnected = true;

      nativePort.onMessage.addListener(handleNativeMessage);

      nativePort.onDisconnect.addListener(() => {
        console.log('[MCP Eyes] Native host disconnected:', browserAPI.runtime.lastError?.message);
        nativePortConnected = false;
        nativePort = null;

        // Clear keepalive
        if (keepaliveInterval) {
          clearInterval(keepaliveInterval);
          keepaliveInterval = null;
        }

        // Reject all pending requests
        pendingNativeRequests.forEach(({ reject }) => {
          reject(new Error('Native host disconnected'));
        });
        pendingNativeRequests.clear();

        // Schedule reconnection
        console.log('[MCP Eyes] Will reconnect in 5 seconds...');
        reconnectTimeout = setTimeout(() => {
          console.log('[MCP Eyes] Attempting to reconnect...');
          connectNativeHost();
        }, 5000);
      });

      console.log('[MCP Eyes] Connected to native host');

      // Send immediate ping to establish connection
      nativePort.postMessage({ action: 'ping', requestId: ++nativeRequestIdCounter });
      console.log('[MCP Eyes] Sent initial ping');

      // Set up keepalive - ping every 30 seconds
      keepaliveInterval = setInterval(() => {
        if (nativePortConnected && nativePort) {
          nativePort.postMessage({ action: 'ping', requestId: ++nativeRequestIdCounter });
          console.log('[MCP Eyes] Keepalive ping sent');
        }
      }, 30000);

      return true;
    } catch (error) {
      console.error('[MCP Eyes] Failed to connect to native host:', error);
      return false;
    }
  }

  /**
   * Send message to native host
   */
  function sendToNativeHost(message) {
    return new Promise((resolve, reject) => {
      if (!connectNativeHost()) {
        reject(new Error('Could not connect to native host'));
        return;
      }

      const requestId = ++nativeRequestIdCounter;
      const timeout = setTimeout(() => {
        pendingNativeRequests.delete(requestId);
        reject(new Error('Native host request timeout'));
      }, 10000);

      pendingNativeRequests.set(requestId, { resolve, reject, timeout });

      nativePort.postMessage({
        ...message,
        requestId
      });
    });
  }

  /**
   * Handle messages from native host
   */
  function handleNativeMessage(message) {
    console.log('[MCP Eyes] Received from native:', message);

    // If this is a response to a request we made, handle it
    if (message.requestId) {
      const pending = pendingNativeRequests.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingNativeRequests.delete(message.requestId);

        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.response || message);
        }
        return;
      }

      // If it has a requestId but no pending request, it's a response to a ping or similar
      // Just log it and don't echo it back
      if (message.response) {
        console.log('[MCP Eyes] Received response (no pending):', message.response);
        return;
      }
    }

    // Only handle messages that have an explicit 'action' field as commands
    if (!message.action) {
      console.log('[MCP Eyes] Ignoring message without action:', message);
      return;
    }

    // Handle unsolicited messages from mcp_eyes (commands)
    handleNativeCommand(message);
  }

  /**
   * Handle commands from mcp_eyes
   */
  async function handleNativeCommand(message) {
    const { action, payload, tabId } = message;

    try {
      let response;

      switch (action) {
        case 'getInteractiveElements':
        case 'getPageInfo':
        case 'getPageContext':
        case 'clickElement':
        case 'fillElement':
        case 'scrollTo':
        case 'executeScript':
        case 'getElementAtPoint':
        case 'getFormData':
        case 'setWatchMode':
        case 'getWatchState':
        // New tools
        case 'getVisibleText':
        case 'waitForSelector':
        case 'waitForPageLoad':
        case 'selectOption':
        case 'isElementVisible':
        case 'getConsoleLogs':
        case 'getNetworkRequests':
        case 'getLocalStorage':
        case 'getCookies':
        // Enhanced tools
        case 'inspectCurrentPage':
        case 'getUIElements':
        case 'fillFormField':
        case 'clickByText':
        case 'clickMultiple':
        case 'getFormStructure':
        case 'answerQuestions':
        // Combo-box tools
        case 'getDropdownOptions':
        // LLM introspection tools
        case 'listInteractiveElements':
        case 'clickElementWithDebug':
        case 'findElementWithDebug':
          response = await sendToContentScript(tabId, { action, payload });
          break;

        case 'startWatching':
          // Enable watch mode on the active tab
          response = await sendToContentScript(tabId, { action: 'setWatchMode', payload: { enabled: true } });
          break;

        case 'stopWatching':
          // Disable watch mode on the active tab
          response = await sendToContentScript(tabId, { action: 'setWatchMode', payload: { enabled: false } });
          break;

        case 'getTabs':
          response = await getOpenTabs();
          break;

        case 'focusTab':
          response = await focusTab(payload.tabId);
          break;

        case 'getActiveTab':
          response = await getActiveTab();
          break;

        case 'createTab':
          response = await createTab(payload.url);
          break;

        case 'closeTab':
          response = await closeTab(payload.tabId);
          break;

        case 'ping':
          response = { status: 'ok', timestamp: Date.now() };
          break;

        // ========== BROWSER AUTOMATION TOOLS (Playwright-style) ==========

        case 'navigate':
          response = await navigateToUrl(payload?.tabId, payload?.url, payload?.waitUntil, payload?.timeout);
          break;

        case 'screenshot':
          response = await captureScreenshot(payload?.tabId, payload?.selector, payload?.fullPage);
          break;

        case 'goBack':
          response = await goBack(payload?.tabId);
          break;

        case 'goForward':
          response = await goForward(payload?.tabId);
          break;

        case 'hover':
        case 'drag':
        case 'pressKey':
        case 'getVisibleHtml':
        case 'uploadFile':
          response = await sendToContentScript(tabId, { action, payload });
          break;

        case 'saveAsPdf':
          response = { error: 'saveAsPdf requires native browser print API - use Cmd+P or browser.tabs.saveAsPDF (Firefox only)' };
          break;

        default:
          response = { error: `Unknown action: ${action}` };
      }

      // Send response back to native host
      if (message.requestId) {
        nativePort.postMessage({
          requestId: message.requestId,
          response
        });
      }
    } catch (error) {
      if (message.requestId) {
        nativePort.postMessage({
          requestId: message.requestId,
          error: error.message
        });
      }
    }
  }

  /**
   * Get all frames for a tab using webNavigation API
   */
  async function getAllFrames(tabId) {
    try {
      const frames = await browserAPI.webNavigation.getAllFrames({ tabId });
      return frames || [];
    } catch (error) {
      console.error('[MCP Eyes] Failed to get frames:', error);
      return [{ frameId: 0 }]; // Fall back to main frame only
    }
  }

  /**
   * Send message to a specific frame in a tab
   */
  function sendToFrame(tabId, frameId, message) {
    return new Promise((resolve) => {
      const options = { frameId };

      try {
        const result = browserAPI.tabs.sendMessage(tabId, message, options);
        if (result && typeof result.then === 'function') {
          // Promise-based (Firefox)
          result
            .then(response => resolve({ success: true, frameId, response }))
            .catch(error => resolve({ success: false, frameId, error: error.message }));
        } else {
          // Callback fallback
          resolve({ success: true, frameId, response: result });
        }
      } catch (error) {
        resolve({ success: false, frameId, error: error.message });
      }
    });
  }

  /**
   * Send message to all frames and aggregate results
   * Used for commands that need to search across iframes (like getInteractiveElements)
   */
  async function sendToAllFrames(tabId, message) {
    const frames = await getAllFrames(tabId);
    console.log(`[MCP Eyes] Sending to ${frames.length} frames in tab ${tabId}`);

    const results = await Promise.all(
      frames.map(frame => sendToFrame(tabId, frame.frameId, message))
    );

    // Aggregate successful results
    const successfulResults = results.filter(r => r.success && r.response);
    console.log(`[MCP Eyes] Got responses from ${successfulResults.length}/${frames.length} frames`);

    return { results: successfulResults, totalFrames: frames.length };
  }

  /**
   * Aggregate interactive elements from all frames
   */
  function aggregateInteractiveElements(frameResults) {
    const allElements = [];
    let globalIndex = 0;

    for (const result of frameResults.results) {
      const elements = result.response;
      if (Array.isArray(elements)) {
        // Add frame context to each element
        for (const el of elements) {
          allElements.push({
            ...el,
            index: globalIndex++,
            frameId: result.frameId,
            originalIndex: el.index
          });
        }
      }
    }

    return allElements;
  }

  /**
   * Send message to content script in a specific tab
   * For commands that need iframe support, use sendToAllFramesAndAggregate
   */
  function sendToContentScript(tabId, message) {
    return new Promise((resolve, reject) => {
      const sendMessage = (targetTabId) => {
        // Commands that need to aggregate results from all frames
        const aggregateCommands = [
          'getInteractiveElements',
          'getPageContext',
          'getUIElements',
          'getFormData'
        ];

        const action = message.action;

        if (aggregateCommands.includes(action)) {
          // Send to all frames and aggregate
          sendToAllFrames(targetTabId, message)
            .then(frameResults => {
              if (action === 'getInteractiveElements' || action === 'getUIElements') {
                const aggregated = aggregateInteractiveElements(frameResults);
                console.log(`[MCP Eyes] Aggregated ${aggregated.length} elements from ${frameResults.totalFrames} frames`);
                resolve(aggregated);
              } else if (action === 'getPageContext') {
                // Aggregate page context from all frames
                const allElements = aggregateInteractiveElements(frameResults);
                const mainFrame = frameResults.results.find(r => r.frameId === 0);
                const pageInfo = mainFrame?.response?.pageInfo || {};
                resolve({ elements: allElements, pageInfo });
              } else if (action === 'getFormData') {
                // Aggregate forms from all frames
                const allForms = [];
                for (const result of frameResults.results) {
                  const forms = result.response;
                  if (Array.isArray(forms)) {
                    for (const form of forms) {
                      allForms.push({ ...form, frameId: result.frameId });
                    }
                  }
                }
                resolve(allForms);
              } else {
                resolve(frameResults);
              }
            })
            .catch(reject);
          return;
        }

        // For other commands, send to main frame only (frameId: 0)
        const result = browserAPI.tabs.sendMessage(targetTabId, message, { frameId: 0 });
        if (result && typeof result.then === 'function') {
          // Promise-based (Firefox)
          result.then(resolve).catch(reject);
        } else {
          // Callback-based (Chrome) - but sendMessage is async in Chrome too
          // In Chrome MV3, sendMessage returns a Promise
          resolve(result);
        }
      };

      // If no tabId specified, use the active tab
      if (!tabId) {
        const result = browserAPI.tabs.query({ active: true, currentWindow: true });
        if (result && typeof result.then === 'function') {
          // Promise-based (Firefox)
          result.then(tabs => {
            if (!tabs || tabs.length === 0) {
              reject(new Error('No active tab found'));
              return;
            }
            sendMessage(tabs[0].id);
          }).catch(reject);
        } else {
          // Callback-based (Chrome)
          browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (browserAPI.runtime.lastError) {
              reject(new Error(browserAPI.runtime.lastError.message));
              return;
            }
            if (!tabs || tabs.length === 0) {
              reject(new Error('No active tab found'));
              return;
            }
            sendMessage(tabs[0].id);
          });
        }
      } else {
        sendMessage(tabId);
      }
    });
  }

  /**
   * Get all open tabs
   */
  async function getOpenTabs() {
    console.log('[MCP Eyes] getOpenTabs called');
    console.log('[MCP Eyes] browserAPI exists:', !!browserAPI);
    console.log('[MCP Eyes] browserAPI.tabs exists:', !!browserAPI?.tabs);
    console.log('[MCP Eyes] browserAPI.tabs.query exists:', typeof browserAPI?.tabs?.query);

    return new Promise((resolve) => {
      try {
        // Try Promise-based API first (Firefox)
        const result = browserAPI.tabs.query({});
        console.log('[MCP Eyes] query result type:', typeof result, 'isPromise:', result instanceof Promise);

        if (result && typeof result.then === 'function') {
          // It's a Promise (Firefox style)
          result.then(tabs => {
            console.log('[MCP Eyes] Promise resolved, tabs:', tabs?.length);
            if (!tabs || !Array.isArray(tabs)) {
              resolve({ error: 'tabs.query returned invalid result' });
              return;
            }
            resolve(tabs.map(tab => ({
              id: tab.id,
              url: tab.url,
              title: tab.title,
              active: tab.active,
              windowId: tab.windowId,
              index: tab.index
            })));
          }).catch(err => {
            console.error('[MCP Eyes] Promise rejected:', err);
            resolve({ error: err.message });
          });
        } else {
          // Try callback style (Chrome)
          browserAPI.tabs.query({}, (tabs) => {
            console.log('[MCP Eyes] Callback received, tabs:', tabs?.length);
            if (browserAPI.runtime.lastError) {
              resolve({ error: browserAPI.runtime.lastError.message });
              return;
            }
            if (!tabs || !Array.isArray(tabs)) {
              resolve({ error: 'tabs.query returned invalid result' });
              return;
            }
            resolve(tabs.map(tab => ({
              id: tab.id,
              url: tab.url,
              title: tab.title,
              active: tab.active,
              windowId: tab.windowId,
              index: tab.index
            })));
          });
        }
      } catch (err) {
        console.error('[MCP Eyes] getOpenTabs error:', err);
        resolve({ error: err.message });
      }
    });
  }

  /**
   * Get the active tab
   */
  async function getActiveTab() {
    console.log('[MCP Eyes] getActiveTab called');

    return new Promise((resolve) => {
      try {
        const result = browserAPI.tabs.query({ active: true, currentWindow: true });

        if (result && typeof result.then === 'function') {
          // Promise-based (Firefox)
          result.then(tabs => {
            console.log('[MCP Eyes] getActiveTab Promise resolved, tabs:', tabs?.length);
            if (!tabs || tabs.length === 0) {
              resolve({ error: 'No active tab' });
              return;
            }
            const tab = tabs[0];
            resolve({
              id: tab.id,
              url: tab.url,
              title: tab.title,
              windowId: tab.windowId
            });
          }).catch(err => {
            console.error('[MCP Eyes] getActiveTab Promise rejected:', err);
            resolve({ error: err.message });
          });
        } else {
          // Callback-based (Chrome)
          browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (browserAPI.runtime.lastError) {
              resolve({ error: browserAPI.runtime.lastError.message });
              return;
            }
            if (!tabs || tabs.length === 0) {
              resolve({ error: 'No active tab' });
              return;
            }
            const tab = tabs[0];
            resolve({
              id: tab.id,
              url: tab.url,
              title: tab.title,
              windowId: tab.windowId
            });
          });
        }
      } catch (err) {
        console.error('[MCP Eyes] getActiveTab error:', err);
        resolve({ error: err.message });
      }
    });
  }

  /**
   * Create a new tab
   */
  async function createTab(url) {
    return new Promise((resolve) => {
      try {
        const result = browserAPI.tabs.create({ url: url || 'about:blank' });
        
        if (result && typeof result.then === 'function') {
          // Promise-based (Firefox)
          result.then(tab => {
            resolve({
              success: true,
              tabId: tab.id,
              url: tab.url,
              title: tab.title
            });
          }).catch(err => {
            resolve({ error: err.message });
          });
        } else {
          // Callback-based (Chrome)
          if (browserAPI.runtime.lastError) {
            resolve({ error: browserAPI.runtime.lastError.message });
            return;
          }
          resolve({
            success: true,
            tabId: result.id,
            url: result.url,
            title: result.title
          });
        }
      } catch (err) {
        resolve({ error: err.message });
      }
    });
  }

  /**
   * Focus a specific tab
   */
  async function focusTab(tabId) {
    try {
      const tab = await browserAPI.tabs.update(tabId, { active: true });
      await browserAPI.windows.update(tab.windowId, { focused: true });
      return { success: true, tabId };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Close a specific tab
   */
  async function closeTab(tabId) {
    try {
      await browserAPI.tabs.remove(tabId);
      return { success: true, tabId };
    } catch (error) {
      return { error: error.message };
    }
  }

  // ========== BROWSER AUTOMATION TOOLS (Playwright-style) ==========

  /**
   * Navigate to a URL in the specified tab
   */
  async function navigateToUrl(tabId, url, waitUntil, timeout) {
    if (!url) {
      return { error: 'URL is required' };
    }

    try {
      // Get target tab
      let targetTabId = tabId;
      if (!targetTabId) {
        const activeTab = await getActiveTab();
        if (activeTab.error) return activeTab;
        targetTabId = activeTab.id;
      }

      // Update the tab URL
      const tab = await browserAPI.tabs.update(targetTabId, { url });

      // Wait for page load if requested
      if (waitUntil === 'load' || waitUntil === 'domcontentloaded' || waitUntil === 'networkidle') {
        await waitForTabLoad(targetTabId, timeout || 30000);
      }

      // Get updated tab info
      const updatedTab = await browserAPI.tabs.get(targetTabId);

      return {
        success: true,
        tabId: targetTabId,
        url: updatedTab.url,
        title: updatedTab.title
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Wait for a tab to finish loading
   */
  function waitForTabLoad(tabId, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        browserAPI.tabs.onUpdated.removeListener(listener);
        reject(new Error('Navigation timeout'));
      }, timeout);

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeoutId);
          browserAPI.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      browserAPI.tabs.onUpdated.addListener(listener);
    });
  }

  /**
   * Capture a screenshot of the visible tab
   */
  async function captureScreenshot(tabId, selector, fullPage) {
    try {
      // Get target tab
      let targetTabId = tabId;
      if (!targetTabId) {
        const activeTab = await getActiveTab();
        if (activeTab.error) return activeTab;
        targetTabId = activeTab.id;
      }

      // Focus the tab first
      await focusTab(targetTabId);

      // Small delay to ensure tab is visible
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture the visible tab
      const dataUrl = await browserAPI.tabs.captureVisibleTab(null, {
        format: 'png'
      });

      // If selector is specified, we need to crop via content script
      if (selector) {
        const cropResult = await sendToContentScript(targetTabId, {
          action: 'cropScreenshot',
          payload: { screenshot: dataUrl, selector }
        });
        if (cropResult.error) {
          return { screenshot: dataUrl, note: 'Could not crop to selector, returning full screenshot' };
        }
        return { screenshot: cropResult.screenshot, selector };
      }

      // If fullPage is requested, we need to scroll and stitch
      if (fullPage) {
        // For now, just return visible area with a note
        return {
          screenshot: dataUrl,
          note: 'Full page screenshot requires scrolling - returning visible area'
        };
      }

      return { screenshot: dataUrl };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Navigate back in browser history
   */
  async function goBack(tabId) {
    try {
      let targetTabId = tabId;
      if (!targetTabId) {
        const activeTab = await getActiveTab();
        if (activeTab.error) return activeTab;
        targetTabId = activeTab.id;
      }

      await browserAPI.tabs.goBack(targetTabId);

      // Wait a bit for navigation
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get updated tab info
      const tab = await browserAPI.tabs.get(targetTabId);

      return {
        success: true,
        tabId: targetTabId,
        url: tab.url,
        title: tab.title
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Navigate forward in browser history
   */
  async function goForward(tabId) {
    try {
      let targetTabId = tabId;
      if (!targetTabId) {
        const activeTab = await getActiveTab();
        if (activeTab.error) return activeTab;
        targetTabId = activeTab.id;
      }

      await browserAPI.tabs.goForward(targetTabId);

      // Wait a bit for navigation
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get updated tab info
      const tab = await browserAPI.tabs.get(targetTabId);

      return {
        success: true,
        tabId: targetTabId,
        url: tab.url,
        title: tab.title
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Find a tab by URL pattern (substring match, regex, or glob-style)
   */
  async function findTabByUrl(urlPattern) {
    if (!urlPattern) {
      return { error: 'URL pattern is required' };
    }

    return new Promise((resolve) => {
      try {
        const result = browserAPI.tabs.query({});

        if (result && typeof result.then === 'function') {
          // Promise-based (Firefox)
          result.then(tabs => {
            const matches = findMatchingTabs(tabs, urlPattern);
            resolve(formatTabResults(matches, urlPattern));
          }).catch(err => {
            resolve({ error: err.message });
          });
        } else {
          // Callback-based (Chrome)
          browserAPI.tabs.query({}, (tabs) => {
            if (browserAPI.runtime.lastError) {
              resolve({ error: browserAPI.runtime.lastError.message });
              return;
            }
            const matches = findMatchingTabs(tabs, urlPattern);
            resolve(formatTabResults(matches, urlPattern));
          });
        }
      } catch (err) {
        resolve({ error: err.message });
      }
    });
  }

  /**
   * Find tabs matching a URL pattern
   */
  function findMatchingTabs(tabs, urlPattern) {
    if (!tabs || !Array.isArray(tabs)) return [];

    const matches = [];
    const lowerPattern = urlPattern.toLowerCase();

    for (const tab of tabs) {
      if (!tab.url) continue;

      const lowerUrl = tab.url.toLowerCase();

      // Try different matching strategies
      let matched = false;

      // 1. Exact match
      if (lowerUrl === lowerPattern) {
        matched = true;
      }
      // 2. Substring match (most common use case)
      else if (lowerUrl.includes(lowerPattern)) {
        matched = true;
      }
      // 3. Try as regex if it looks like one (starts with ^ or contains .*, etc)
      else if (urlPattern.includes('*') || urlPattern.startsWith('^') || urlPattern.endsWith('$')) {
        try {
          // Convert glob-style wildcards to regex
          let regexPattern = urlPattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape special chars except *
            .replace(/\*/g, '.*');  // Convert * to .*

          const regex = new RegExp(regexPattern, 'i');
          if (regex.test(tab.url)) {
            matched = true;
          }
        } catch (e) {
          // Invalid regex, ignore
        }
      }

      if (matched) {
        matches.push({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          active: tab.active,
          windowId: tab.windowId,
          index: tab.index
        });
      }
    }

    return matches;
  }

  /**
   * Format tab search results
   */
  function formatTabResults(matches, urlPattern) {
    if (matches.length === 0) {
      return {
        found: false,
        pattern: urlPattern,
        matches: [],
        count: 0,
        message: `No tabs found matching pattern: ${urlPattern}`
      };
    }

    return {
      found: true,
      pattern: urlPattern,
      matches,
      count: matches.length,
      // Return the first match for convenience (usually what's wanted)
      tab: matches[0],
      tabId: matches[0].id
    };
  }

  /**
   * Handle messages from content scripts (for cases where they initiate)
   */
  browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // If the message is for the native host, forward it
    if (message.forNative) {
      sendToNativeHost(message.payload)
        .then(sendResponse)
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }

    // Handle other messages
    handleContentScriptMessage(message, sender).then(sendResponse);
    return true;
  });

  /**
   * Handle messages from content scripts
   */
  async function handleContentScriptMessage(message, sender) {
    const { action, payload } = message;

    switch (action) {
      case 'pageLoaded':
        // Notify mcp_eyes that a page has finished loading
        if (nativePortConnected) {
          nativePort.postMessage({
            event: 'pageLoaded',
            tabId: sender.tab?.id,
            url: sender.tab?.url,
            title: sender.tab?.title
          });
        }
        return { acknowledged: true };

      case 'domChanged':
        // Forward DOM change event to mcp_eyes
        if (nativePortConnected) {
          nativePort.postMessage({
            event: 'domChanged',
            tabId: sender.tab?.id,
            url: sender.tab?.url,
            title: sender.tab?.title,
            payload: payload
          });
          console.log('[MCP Eyes] DOM change forwarded to native host:', payload.changes);
        }
        return { acknowledged: true };

      case 'notify':
        // Forward notification to mcp_eyes
        if (nativePortConnected) {
          nativePort.postMessage({
            event: 'notification',
            tabId: sender.tab?.id,
            payload
          });
        }
        return { acknowledged: true };

      default:
        return { error: `Unknown action: ${action}` };
    }
  }

  /**
   * Handle extension install/update
   */
  browserAPI.runtime.onInstalled.addListener((details) => {
    console.log('[MCP Eyes] Extension installed/updated:', details.reason);

    // Try to connect to native host on install
    setTimeout(() => {
      connectNativeHost();
    }, 1000);
  });

  /**
   * Handle browser startup
   */
  browserAPI.runtime.onStartup.addListener(() => {
    console.log('[MCP Eyes] Browser started');
    // Delay connection to ensure everything is ready
    setTimeout(() => {
      connectNativeHost();
    }, 2000);
  });

  // For service workers (Chrome MV3), handle activation
  if (typeof self !== 'undefined' && self.addEventListener) {
    self.addEventListener('activate', () => {
      console.log('[MCP Eyes] Service worker activated');
    });
  }

  // Connect immediately on load - prefer WebSocket, fall back to native messaging
  console.log('[MCP Eyes] Background script loaded');
  setTimeout(() => {
    console.log('[MCP Eyes] Attempting WebSocket connection to Browser Bridge...');
    connectWebSocket();
    // Also maintain native host connection for compatibility
    setTimeout(() => {
      if (!wsConnected) {
        console.log('[MCP Eyes] Attempting native host connection as fallback...');
        connectNativeHost();
      }
    }, 2000);
  }, 500);
})();
