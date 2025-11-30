/**
 * MCP Eyes - Content Script
 *
 * Runs in an isolated context but can access the DOM.
 * Bridges between:
 *   - Injected script (page context) via window.postMessage
 *   - Background script via chrome.runtime.sendMessage
 *
 * Uses Tampermonkey-style injection to get scripts into the page context
 * before MV3 restrictions kick in.
 */

(function() {
  'use strict';

  // Browser API compatibility
  const browser = typeof chrome !== 'undefined' ? chrome : window.browser;

  // Track pending requests to the injected script
  const pendingRequests = new Map();
  let requestIdCounter = 0;
  let injectedScriptReady = false;

  /**
   * Inject the page context script using Tampermonkey strategy
   * This runs before page scripts load
   */
  function injectPageScript() {
    // Method 1: Create script element with src (preferred for MV3)
    const script = document.createElement('script');
    script.src = browser.runtime.getURL('injected.js');
    script.onload = function() {
      this.remove();
    };

    // Inject at document_start before any other scripts run
    (document.head || document.documentElement).appendChild(script);
  }

  /**
   * Alternative injection for when the above doesn't work
   * Inlines the script content directly
   */
  function injectPageScriptInline(code) {
    const script = document.createElement('script');
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  /**
   * Send a message to the injected script and wait for response
   */
  function sendToInjectedScript(action, payload = {}) {
    return new Promise((resolve, reject) => {
      const requestId = ++requestIdCounter;
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error(`Timeout waiting for response to ${action}`));
      }, 5000);

      pendingRequests.set(requestId, { resolve, reject, timeout });

      window.postMessage({
        source: 'mcp-eyes-content',
        action,
        payload,
        requestId
      }, '*');
    });
  }

  /**
   * Handle messages from the injected script
   */
  window.addEventListener('message', function(event) {
    if (event.source !== window || !event.data) return;

    // Handle ready signal
    if (event.data.source === 'mcp-eyes-injected' && event.data.action === 'ready') {
      injectedScriptReady = true;
      console.log('[MCP Eyes] Injected script is ready');
      return;
    }

    // Handle responses
    if (event.data.source === 'mcp-eyes-injected' && event.data.requestId) {
      const pending = pendingRequests.get(event.data.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingRequests.delete(event.data.requestId);
        pending.resolve(event.data.response);
      }
    }
  });

  /**
   * Handle messages from the background script
   */
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle async response
    handleBackgroundMessage(message).then(sendResponse);
    return true; // Keep the message channel open for async response
  });

  /**
   * Process messages from background script
   */
  async function handleBackgroundMessage(message) {
    const { action, payload } = message;

    try {
      // Wait for injected script if not ready
      if (!injectedScriptReady) {
        await waitForInjectedScript();
      }

      switch (action) {
        case 'getInteractiveElements':
          return await sendToInjectedScript('getInteractiveElements');

        case 'getPageInfo':
          return await sendToInjectedScript('getPageInfo');

        case 'clickElement':
          return await sendToInjectedScript('clickElement', payload);

        case 'fillElement':
          return await sendToInjectedScript('fillElement', payload);

        case 'scrollTo':
          return await sendToInjectedScript('scrollTo', payload);

        case 'executeScript':
          return await sendToInjectedScript('executeScript', payload);

        case 'getElementAtPoint':
          return await sendToInjectedScript('getElementAtPoint', payload);

        case 'getFormData':
          return await sendToInjectedScript('getFormData');

        case 'getPageContext':
          // Combined call for efficiency
          const [elements, pageInfo] = await Promise.all([
            sendToInjectedScript('getInteractiveElements'),
            sendToInjectedScript('getPageInfo')
          ]);
          return { elements, pageInfo };

        case 'ping':
          return { status: 'ok', injectedReady: injectedScriptReady };

        case 'setWatchMode':
          return setWatchMode(payload.enabled);

        case 'getWatchState':
          return {
            watchMode: watchModeEnabled,
            url: window.location.href,
            title: document.title,
            forms: getFormSummary(),
            elementCount: lastElementCount
          };

        // ========== NEW TOOL ACTIONS ==========
        case 'getVisibleText':
          return await sendToInjectedScript('getVisibleText', payload);

        case 'waitForSelector':
          return await sendToInjectedScript('waitForSelector', payload);

        case 'waitForPageLoad':
          return await sendToInjectedScript('waitForPageLoad', payload);

        case 'selectOption':
          return await sendToInjectedScript('selectOption', payload);

        case 'isElementVisible':
          return await sendToInjectedScript('isElementVisible', payload);

        case 'getConsoleLogs':
          return await sendToInjectedScript('getConsoleLogs', payload);

        case 'getNetworkRequests':
          return await sendToInjectedScript('getNetworkRequests', payload);

        case 'getLocalStorage':
          return await sendToInjectedScript('getLocalStorage', payload);

        case 'getCookies':
          return await sendToInjectedScript('getCookies', payload);

        default:
          return { error: `Unknown action: ${action}` };
      }
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Wait for injected script to be ready
   */
  function waitForInjectedScript(timeout = 3000) {
    return new Promise((resolve, reject) => {
      if (injectedScriptReady) {
        resolve();
        return;
      }

      const startTime = Date.now();
      const check = () => {
        if (injectedScriptReady) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Injected script failed to initialize'));
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  // Watch mode state
  let watchModeEnabled = false;
  let watchDebounceTimer = null;
  let lastElementCount = 0;
  let mutationObserver = null;

  /**
   * Set up mutation observer to handle dynamic content
   * (useful for SPAs that load content dynamically)
   */
  function setupMutationObserver() {
    mutationObserver = new MutationObserver((mutations) => {
      if (!watchModeEnabled) return;

      // Debounce rapid changes
      clearTimeout(watchDebounceTimer);
      watchDebounceTimer = setTimeout(() => {
        notifyDOMChange(mutations);
      }, 250);
    });

    mutationObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'disabled', 'hidden', 'value']
    });
  }

  /**
   * Analyze DOM changes and notify background script
   */
  async function notifyDOMChange(mutations) {
    try {
      // Get current interactive elements
      const elements = await sendToInjectedScript('getInteractiveElements');
      const currentCount = elements?.length || 0;

      // Detect significant changes
      const changes = analyzeMutations(mutations);

      // Only notify if there are meaningful changes
      if (changes.hasNewForms || changes.hasNewInputs || changes.hasNewButtons ||
          changes.hasNewModals || Math.abs(currentCount - lastElementCount) > 3) {

        lastElementCount = currentCount;

        // Notify background script
        browser.runtime.sendMessage({
          action: 'domChanged',
          payload: {
            url: window.location.href,
            title: document.title,
            changes: changes,
            elementCount: currentCount,
            timestamp: Date.now(),
            // Include summary of interactive elements
            forms: getFormSummary(),
            inputs: getInputSummary(elements)
          }
        });
      }
    } catch (error) {
      console.error('[MCP Eyes] Error notifying DOM change:', error);
    }
  }

  /**
   * Analyze mutations for significant changes
   */
  function analyzeMutations(mutations) {
    const changes = {
      hasNewForms: false,
      hasNewInputs: false,
      hasNewButtons: false,
      hasNewModals: false,
      addedNodes: 0,
      removedNodes: 0,
      changedAttributes: []
    };

    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        changes.addedNodes += mutation.addedNodes.length;
        changes.removedNodes += mutation.removedNodes.length;

        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          const el = node;
          // Check if it's a significant element
          if (el.tagName === 'FORM' || el.querySelector?.('form')) {
            changes.hasNewForms = true;
          }
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
              el.querySelector?.('input, textarea')) {
            changes.hasNewInputs = true;
          }
          if (el.tagName === 'BUTTON' || el.querySelector?.('button, [role="button"]')) {
            changes.hasNewButtons = true;
          }
          // Check for modals/dialogs
          if (el.matches?.('[role="dialog"], [role="alertdialog"], .modal, .dialog') ||
              el.querySelector?.('[role="dialog"], [role="alertdialog"], .modal, .dialog')) {
            changes.hasNewModals = true;
          }
        }
      } else if (mutation.type === 'attributes') {
        changes.changedAttributes.push(mutation.attributeName);
      }
    }

    return changes;
  }

  /**
   * Get summary of forms on the page
   */
  function getFormSummary() {
    const forms = [];
    document.querySelectorAll('form').forEach((form, index) => {
      const inputs = form.querySelectorAll('input, textarea, select');
      forms.push({
        index,
        id: form.id || null,
        name: form.name || null,
        action: form.action || null,
        method: form.method || 'get',
        inputCount: inputs.length,
        inputs: Array.from(inputs).slice(0, 10).map(input => ({
          type: input.type || input.tagName.toLowerCase(),
          name: input.name || null,
          id: input.id || null,
          placeholder: input.placeholder || null,
          required: input.required || false,
          value: input.type === 'password' ? '***' : (input.value || '').substring(0, 50)
        }))
      });
    });
    return forms;
  }

  /**
   * Get summary of input elements
   */
  function getInputSummary(elements) {
    if (!elements) return [];
    return elements
      .filter(el => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
      .slice(0, 20)
      .map(el => ({
        type: el.type || el.tagName,
        name: el.name || null,
        id: el.id || null,
        label: el.label || null,
        placeholder: el.placeholder || null,
        required: el.required || false
      }));
  }

  /**
   * Enable/disable watch mode
   */
  function setWatchMode(enabled) {
    watchModeEnabled = enabled;
    console.log(`[MCP Eyes] Watch mode ${enabled ? 'enabled' : 'disabled'}`);

    if (enabled) {
      // Send initial state
      notifyDOMChange([]);
    }
    return { watchMode: enabled };
  }

  // Initialize
  function init() {
    // Inject the page context script immediately
    injectPageScript();

    // Set up mutation observer once DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setupMutationObserver();
        notifyPageLoaded();
      });
    } else {
      setupMutationObserver();
      notifyPageLoaded();
    }

    console.log('[MCP Eyes] Content script loaded');
  }

  /**
   * Notify background script that page has loaded
   * This triggers the native host connection
   */
  function notifyPageLoaded() {
    browser.runtime.sendMessage({
      action: 'pageLoaded',
      payload: {
        url: window.location.href,
        title: document.title
      }
    }).catch(err => {
      console.log('[MCP Eyes] Could not notify page load:', err.message);
    });
  }

  init();
})();
