/**
 * MCP Eyes - Injected Script (runs in page context)
 *
 * This script is injected into the page's JavaScript context using the Tampermonkey strategy.
 * It has full access to the page's DOM and JavaScript environment.
 * Communicates with the content script via window.postMessage.
 */

(function() {
  'use strict';

  // Unique namespace to avoid conflicts
  const MCP_EYES_NS = '__MCP_EYES__';

  // Create our namespace on window
  window[MCP_EYES_NS] = window[MCP_EYES_NS] || {};

  // ========== Console & Network Hooks (set up early) ==========

  // Store captured console logs
  const capturedConsoleLogs = [];
  const MAX_CONSOLE_LOGS = 500;

  // Store captured network requests
  const capturedNetworkRequests = [];
  const MAX_NETWORK_REQUESTS = 200;

  // Hook console methods to capture logs
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug
  };

  function hookConsole() {
    ['log', 'error', 'warn', 'info', 'debug'].forEach(method => {
      console[method] = function(...args) {
        // Store the log
        capturedConsoleLogs.push({
          type: method,
          timestamp: Date.now(),
          message: args.map(arg => {
            try {
              if (typeof arg === 'object') {
                return JSON.stringify(arg, null, 2).substring(0, 1000);
              }
              return String(arg).substring(0, 1000);
            } catch (e) {
              return String(arg).substring(0, 1000);
            }
          }).join(' ')
        });

        // Trim if too many logs
        if (capturedConsoleLogs.length > MAX_CONSOLE_LOGS) {
          capturedConsoleLogs.shift();
        }

        // Call original
        originalConsole[method].apply(console, args);
      };
    });
  }

  // Hook fetch to capture network requests
  const originalFetch = window.fetch;

  function hookFetch() {
    window.fetch = async function(input, init) {
      const url = typeof input === 'string' ? input : input.url;
      const method = init?.method || 'GET';
      const startTime = Date.now();

      const requestEntry = {
        type: 'fetch',
        url: url,
        method: method,
        timestamp: startTime,
        status: null,
        statusText: null,
        duration: null,
        requestHeaders: init?.headers || {},
        responseHeaders: {},
        error: null
      };

      try {
        const response = await originalFetch.apply(window, arguments);

        requestEntry.status = response.status;
        requestEntry.statusText = response.statusText;
        requestEntry.duration = Date.now() - startTime;

        // Capture response headers
        response.headers.forEach((value, key) => {
          requestEntry.responseHeaders[key] = value;
        });

        capturedNetworkRequests.push(requestEntry);
        if (capturedNetworkRequests.length > MAX_NETWORK_REQUESTS) {
          capturedNetworkRequests.shift();
        }

        return response;
      } catch (error) {
        requestEntry.error = error.message;
        requestEntry.duration = Date.now() - startTime;
        capturedNetworkRequests.push(requestEntry);
        if (capturedNetworkRequests.length > MAX_NETWORK_REQUESTS) {
          capturedNetworkRequests.shift();
        }
        throw error;
      }
    };
  }

  // Hook XMLHttpRequest to capture XHR requests
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  function hookXHR() {
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._mcpEyesUrl = url;
      this._mcpEyesMethod = method;
      this._mcpEyesStartTime = null;
      return originalXHROpen.apply(this, [method, url, ...args]);
    };

    XMLHttpRequest.prototype.send = function(body) {
      this._mcpEyesStartTime = Date.now();

      this.addEventListener('loadend', () => {
        const requestEntry = {
          type: 'xhr',
          url: this._mcpEyesUrl,
          method: this._mcpEyesMethod,
          timestamp: this._mcpEyesStartTime,
          status: this.status,
          statusText: this.statusText,
          duration: Date.now() - this._mcpEyesStartTime,
          responseHeaders: {},
          error: this.status === 0 ? 'Network error or CORS' : null
        };

        // Parse response headers
        const headerStr = this.getAllResponseHeaders();
        if (headerStr) {
          headerStr.trim().split(/[\r\n]+/).forEach(line => {
            const parts = line.split(': ');
            if (parts.length === 2) {
              requestEntry.responseHeaders[parts[0]] = parts[1];
            }
          });
        }

        capturedNetworkRequests.push(requestEntry);
        if (capturedNetworkRequests.length > MAX_NETWORK_REQUESTS) {
          capturedNetworkRequests.shift();
        }
      });

      return originalXHRSend.apply(this, arguments);
    };
  }

  // Initialize hooks
  hookConsole();
  hookFetch();
  hookXHR();

  /**
   * Get all interactive elements on the page with their screen coordinates
   */
  function getInteractiveElements() {
    const elements = [];
    const interactiveSelectors = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[onclick]',
      '[tabindex]:not([tabindex="-1"])',
      'summary',
      'details',
      '[contenteditable="true"]'
    ];

    const allElements = document.querySelectorAll(interactiveSelectors.join(','));

    allElements.forEach((el, index) => {
      const rect = el.getBoundingClientRect();

      // Skip elements that are not visible
      if (rect.width === 0 || rect.height === 0) return;

      // Skip elements outside viewport
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      if (rect.right < 0 || rect.left > window.innerWidth) return;

      // Check if element is actually visible (not hidden by CSS)
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

      // Get element text/label
      let text = '';
      if (el.tagName === 'INPUT') {
        text = el.placeholder || el.value || el.name || '';
        // Look for associated label
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) text = label.textContent.trim() + ': ' + text;
      } else if (el.tagName === 'SELECT') {
        const selected = el.options[el.selectedIndex];
        text = selected ? selected.text : '';
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) text = label.textContent.trim() + ': ' + text;
      } else {
        text = el.textContent?.trim().substring(0, 100) ||
               el.getAttribute('aria-label') ||
               el.getAttribute('title') ||
               el.getAttribute('alt') ||
               '';
      }

      // Generate a unique selector for this element
      const selector = generateSelector(el);

      // Calculate screen coordinates
      // Browser window position + viewport offset + element position
      const screenRect = {
        x: window.screenX + rect.left,
        y: window.screenY + (window.outerHeight - window.innerHeight) + rect.top,
        width: rect.width,
        height: rect.height,
        // Center point for clicking
        centerX: window.screenX + rect.left + rect.width / 2,
        centerY: window.screenY + (window.outerHeight - window.innerHeight) + rect.top + rect.height / 2
      };

      elements.push({
        index,
        type: getElementType(el),
        tagName: el.tagName.toLowerCase(),
        text: text.substring(0, 100),
        selector,
        id: el.id || null,
        name: el.name || null,
        href: el.href || null,
        value: el.value || null,
        checked: el.checked || null,
        disabled: el.disabled || false,
        visible: true,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        },
        screenRect,
        attributes: getRelevantAttributes(el)
      });
    });

    return elements;
  }

  /**
   * Get element type for easier categorization
   */
  function getElementType(el) {
    const tag = el.tagName.toLowerCase();

    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'dropdown';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'input') {
      const type = el.type?.toLowerCase() || 'text';
      if (type === 'submit' || type === 'button') return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'file') return 'file-input';
      return 'input';
    }

    // Check for role
    const role = el.getAttribute('role');
    if (role) return role;

    return 'interactive';
  }

  /**
   * Generate a CSS selector that uniquely identifies an element
   */
  function generateSelector(el) {
    // Try ID first
    if (el.id) {
      return `#${CSS.escape(el.id)}`;
    }

    // Try unique class combination
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.trim().split(/\s+/).filter(c => c);
      if (classes.length > 0) {
        const classSelector = '.' + classes.map(c => CSS.escape(c)).join('.');
        if (document.querySelectorAll(classSelector).length === 1) {
          return classSelector;
        }
      }
    }

    // Try name attribute for form elements
    if (el.name) {
      const nameSelector = `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
      if (document.querySelectorAll(nameSelector).length === 1) {
        return nameSelector;
      }
    }

    // Build a path from ancestors
    const path = [];
    let current = el;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }

      // Add nth-child if needed
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  /**
   * Get relevant attributes for context
   */
  function getRelevantAttributes(el) {
    const attrs = {};
    const relevant = ['aria-label', 'aria-describedby', 'data-testid', 'data-cy', 'placeholder', 'title', 'alt'];

    relevant.forEach(attr => {
      if (el.hasAttribute(attr)) {
        attrs[attr] = el.getAttribute(attr);
      }
    });

    return attrs;
  }

  /**
   * Get page information
   */
  function getPageInfo() {
    return {
      url: window.location.href,
      title: document.title,
      domain: window.location.hostname,
      scrollPosition: {
        x: window.scrollX,
        y: window.scrollY
      },
      viewportSize: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      documentSize: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight
      },
      browserWindow: {
        screenX: window.screenX,
        screenY: window.screenY,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        chromeHeight: window.outerHeight - window.innerHeight
      }
    };
  }

  /**
   * Click an element by selector (silent mode)
   */
  function clickElement(selector) {
    const el = document.querySelector(selector);
    if (!el) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    el.click();
    return { success: true, selector };
  }

  /**
   * Fill an input element (silent mode)
   */
  function fillElement(selector, value) {
    const el = document.querySelector(selector);
    if (!el) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    // Focus the element
    el.focus();

    // Clear and set value
    el.value = value;

    // Dispatch events to trigger any listeners
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true, selector, value };
  }

  /**
   * Scroll to an element or by direction
   */
  function scrollTo(target) {
    if (typeof target === 'string') {
      if (target === 'up') {
        window.scrollBy(0, -window.innerHeight * 0.8);
      } else if (target === 'down') {
        window.scrollBy(0, window.innerHeight * 0.8);
      } else if (target === 'top') {
        window.scrollTo(0, 0);
      } else if (target === 'bottom') {
        window.scrollTo(0, document.documentElement.scrollHeight);
      } else {
        // Assume it's a selector
        const el = document.querySelector(target);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return { success: true, scrolledTo: target };
        }
        return { success: false, error: `Element not found: ${target}` };
      }
    }
    return { success: true, scrolledTo: target };
  }

  /**
   * Execute arbitrary JavaScript (with safety wrapper)
   */
  function executeScript(code) {
    try {
      const result = eval(code);
      return { success: true, result: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get element at specific screen coordinates
   */
  function getElementAtPoint(screenX, screenY) {
    // Convert screen coordinates to viewport coordinates
    const viewportX = screenX - window.screenX;
    const viewportY = screenY - window.screenY - (window.outerHeight - window.innerHeight);

    const el = document.elementFromPoint(viewportX, viewportY);
    if (!el) {
      return null;
    }

    return {
      tagName: el.tagName.toLowerCase(),
      text: el.textContent?.trim().substring(0, 100) || '',
      selector: generateSelector(el),
      rect: el.getBoundingClientRect()
    };
  }

  /**
   * Get form data from the page
   */
  function getFormData() {
    const forms = [];
    document.querySelectorAll('form').forEach((form, index) => {
      const formData = {
        index,
        id: form.id || null,
        name: form.name || null,
        action: form.action || null,
        method: form.method || 'get',
        fields: []
      };

      form.querySelectorAll('input, select, textarea').forEach(field => {
        formData.fields.push({
          type: field.type || field.tagName.toLowerCase(),
          name: field.name || null,
          id: field.id || null,
          value: field.value || null,
          placeholder: field.placeholder || null,
          required: field.required || false,
          selector: generateSelector(field)
        });
      });

      forms.push(formData);
    });

    return forms;
  }

  // ========== NEW TOOLS ==========

  /**
   * Get all visible text content from the page
   */
  function getVisibleText(maxLength = 100000) {
    // Get the main text content
    let text = document.body.innerText || '';

    // Clean up excessive whitespace
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    // Truncate if too long
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '\n\n[... truncated ...]';
    }

    return {
      text,
      length: text.length,
      truncated: text.length >= maxLength,
      url: window.location.href,
      title: document.title
    };
  }

  /**
   * Wait for a selector to appear in the DOM
   */
  function waitForSelector(selector, timeout = 10000) {
    return new Promise((resolve) => {
      // Check if element already exists
      const existing = document.querySelector(selector);
      if (existing) {
        resolve({
          success: true,
          found: true,
          selector,
          element: {
            tagName: existing.tagName.toLowerCase(),
            text: existing.textContent?.trim().substring(0, 100) || '',
            visible: isElementActuallyVisible(existing)
          }
        });
        return;
      }

      // Set up mutation observer
      const observer = new MutationObserver((mutations, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve({
            success: true,
            found: true,
            selector,
            element: {
              tagName: el.tagName.toLowerCase(),
              text: el.textContent?.trim().substring(0, 100) || '',
              visible: isElementActuallyVisible(el)
            }
          });
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true
      });

      // Timeout
      setTimeout(() => {
        observer.disconnect();
        resolve({
          success: false,
          found: false,
          selector,
          error: `Timeout waiting for selector: ${selector}`
        });
      }, timeout);
    });
  }

  /**
   * Wait for page load to complete
   */
  function waitForPageLoad(timeout = 30000) {
    return new Promise((resolve) => {
      // Check if already loaded
      if (document.readyState === 'complete') {
        resolve({
          success: true,
          readyState: document.readyState,
          url: window.location.href,
          title: document.title
        });
        return;
      }

      const onLoad = () => {
        window.removeEventListener('load', onLoad);
        resolve({
          success: true,
          readyState: document.readyState,
          url: window.location.href,
          title: document.title
        });
      };

      window.addEventListener('load', onLoad);

      // Also check readyState changes
      const checkState = () => {
        if (document.readyState === 'complete') {
          window.removeEventListener('load', onLoad);
          resolve({
            success: true,
            readyState: document.readyState,
            url: window.location.href,
            title: document.title
          });
        }
      };

      document.addEventListener('readystatechange', checkState);

      // Timeout
      setTimeout(() => {
        window.removeEventListener('load', onLoad);
        document.removeEventListener('readystatechange', checkState);
        resolve({
          success: false,
          readyState: document.readyState,
          error: 'Timeout waiting for page load',
          url: window.location.href
        });
      }, timeout);
    });
  }

  /**
   * Select an option in a dropdown/select element
   */
  function selectOption(selector, value) {
    const el = document.querySelector(selector);
    if (!el) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    if (el.tagName.toLowerCase() !== 'select') {
      return { success: false, error: `Element is not a select: ${el.tagName}` };
    }

    // Find the option by value or text
    let optionFound = false;
    for (let i = 0; i < el.options.length; i++) {
      const option = el.options[i];
      if (option.value === value || option.text === value || option.textContent?.trim() === value) {
        el.selectedIndex = i;
        optionFound = true;
        break;
      }
    }

    if (!optionFound) {
      // List available options for debugging
      const availableOptions = Array.from(el.options).map(o => ({
        value: o.value,
        text: o.text
      }));
      return {
        success: false,
        error: `Option "${value}" not found`,
        availableOptions
      };
    }

    // Dispatch change event
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));

    return {
      success: true,
      selector,
      selectedValue: el.value,
      selectedText: el.options[el.selectedIndex].text
    };
  }

  /**
   * Check if an element exists and is visible
   */
  function isElementVisible(selector) {
    const el = document.querySelector(selector);
    if (!el) {
      return {
        exists: false,
        visible: false,
        selector,
        error: 'Element not found'
      };
    }

    const isVisible = isElementActuallyVisible(el);
    const rect = el.getBoundingClientRect();

    return {
      exists: true,
      visible: isVisible,
      selector,
      tagName: el.tagName.toLowerCase(),
      text: el.textContent?.trim().substring(0, 100) || '',
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      inViewport: rect.top < window.innerHeight && rect.bottom > 0 &&
                  rect.left < window.innerWidth && rect.right > 0
    };
  }

  /**
   * Helper to check if element is actually visible
   */
  function isElementActuallyVisible(el) {
    if (!el) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const style = window.getComputedStyle(el);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;

    return true;
  }

  /**
   * Get captured console logs
   */
  function getConsoleLogs(filter = null, clear = false) {
    let logs = [...capturedConsoleLogs];

    // Filter by type if specified
    if (filter && filter !== 'all') {
      logs = logs.filter(log => log.type === filter);
    }

    const result = {
      logs,
      count: logs.length,
      types: {
        log: capturedConsoleLogs.filter(l => l.type === 'log').length,
        error: capturedConsoleLogs.filter(l => l.type === 'error').length,
        warn: capturedConsoleLogs.filter(l => l.type === 'warn').length,
        info: capturedConsoleLogs.filter(l => l.type === 'info').length,
        debug: capturedConsoleLogs.filter(l => l.type === 'debug').length
      }
    };

    // Clear logs if requested
    if (clear) {
      capturedConsoleLogs.length = 0;
    }

    return result;
  }

  /**
   * Get captured network requests
   */
  function getNetworkRequests(filter = null, clear = false) {
    let requests = [...capturedNetworkRequests];

    // Filter by type if specified (fetch or xhr)
    if (filter && filter !== 'all') {
      requests = requests.filter(req => req.type === filter);
    }

    const result = {
      requests,
      count: requests.length,
      summary: {
        total: capturedNetworkRequests.length,
        fetch: capturedNetworkRequests.filter(r => r.type === 'fetch').length,
        xhr: capturedNetworkRequests.filter(r => r.type === 'xhr').length,
        successful: capturedNetworkRequests.filter(r => r.status >= 200 && r.status < 300).length,
        failed: capturedNetworkRequests.filter(r => r.error || r.status >= 400).length
      }
    };

    // Clear requests if requested
    if (clear) {
      capturedNetworkRequests.length = 0;
    }

    return result;
  }

  /**
   * Get localStorage contents
   */
  function getLocalStorage() {
    try {
      const items = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          let value = localStorage.getItem(key);
          // Try to parse JSON values
          try {
            value = JSON.parse(value);
          } catch (e) {
            // Keep as string
          }
          items[key] = value;
        }
      }

      return {
        success: true,
        items,
        count: localStorage.length,
        domain: window.location.hostname
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        domain: window.location.hostname
      };
    }
  }

  /**
   * Get cookies for the current domain
   */
  function getCookies() {
    try {
      const cookieString = document.cookie;
      const cookies = {};

      if (cookieString) {
        cookieString.split(';').forEach(cookie => {
          const [name, ...valueParts] = cookie.trim().split('=');
          if (name) {
            cookies[name] = valueParts.join('=');
          }
        });
      }

      return {
        success: true,
        cookies,
        count: Object.keys(cookies).length,
        domain: window.location.hostname,
        raw: cookieString
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        domain: window.location.hostname
      };
    }
  }

  // Message handler for communication with content script
  window.addEventListener('message', async function(event) {
    // Only accept messages from our content script
    if (event.source !== window || !event.data || event.data.source !== 'mcp-eyes-content') {
      return;
    }

    const { action, payload, requestId } = event.data;
    let response;

    try {
      switch (action) {
        case 'getInteractiveElements':
          response = getInteractiveElements();
          break;
        case 'getPageInfo':
          response = getPageInfo();
          break;
        case 'clickElement':
          response = clickElement(payload.selector);
          break;
        case 'fillElement':
          response = fillElement(payload.selector, payload.value);
          break;
        case 'scrollTo':
          response = scrollTo(payload.target);
          break;
        case 'executeScript':
          response = executeScript(payload.script);
          break;
        case 'getElementAtPoint':
          response = getElementAtPoint(payload.x, payload.y);
          break;
        case 'getFormData':
          response = getFormData();
          break;
        case 'ping':
          response = { status: 'ok', timestamp: Date.now() };
          break;

        // ========== NEW TOOL ACTIONS ==========
        case 'getVisibleText':
          response = getVisibleText(payload.maxLength);
          break;
        case 'waitForSelector':
          response = await waitForSelector(payload.selector, payload.timeout);
          break;
        case 'waitForPageLoad':
          response = await waitForPageLoad(payload.timeout);
          break;
        case 'selectOption':
          response = selectOption(payload.selector, payload.value);
          break;
        case 'isElementVisible':
          response = isElementVisible(payload.selector);
          break;
        case 'getConsoleLogs':
          response = getConsoleLogs(payload.filter, payload.clear);
          break;
        case 'getNetworkRequests':
          response = getNetworkRequests(payload.filter, payload.clear);
          break;
        case 'getLocalStorage':
          response = getLocalStorage();
          break;
        case 'getCookies':
          response = getCookies();
          break;

        default:
          response = { error: `Unknown action: ${action}` };
      }
    } catch (error) {
      response = { error: error.message };
    }

    // Send response back to content script
    window.postMessage({
      source: 'mcp-eyes-injected',
      requestId,
      response
    }, '*');
  });

  // Signal that injected script is ready
  window.postMessage({
    source: 'mcp-eyes-injected',
    action: 'ready'
  }, '*');

  console.log('[MCP Eyes] Injected script loaded');
})();
