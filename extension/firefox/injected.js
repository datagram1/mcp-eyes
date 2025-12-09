/**
 * ScreenControl - Injected Script (runs in page context)
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
   * Priority order:
   * 1. data-testid, data-qa, data-cy, data-test (testing attributes)
   * 2. ID
   * 3. name attribute (for form elements)
   * 4. aria-label (for accessibility)
   * 5. Unique class combination
   * 6. Hierarchical path with stability optimizations
   */
  function generateSelector(el, options = {}) {
    const { preferTestIds = true, includeAlternatives = false } = options;
    const alternatives = [];

    // 1. Try testing attributes first (most stable for automation)
    if (preferTestIds) {
      const testAttrs = ['data-testid', 'data-qa', 'data-cy', 'data-test', 'data-automation-id'];
      for (const attr of testAttrs) {
        const value = el.getAttribute(attr);
        if (value) {
          const selector = `[${attr}="${CSS.escape(value)}"]`;
          if (document.querySelectorAll(selector).length === 1) {
            if (includeAlternatives) alternatives.push({ selector, type: 'test-id', attr });
            else return selector;
          }
        }
      }
    }

    // 2. Try ID
    if (el.id) {
      const selector = `#${CSS.escape(el.id)}`;
      if (document.querySelectorAll(selector).length === 1) {
        if (includeAlternatives) alternatives.push({ selector, type: 'id' });
        else return selector;
      }
    }

    // 3. Try name attribute for form elements
    if (el.name) {
      const nameSelector = `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
      if (document.querySelectorAll(nameSelector).length === 1) {
        if (includeAlternatives) alternatives.push({ selector: nameSelector, type: 'name' });
        else return nameSelector;
      }
    }

    // 4. Try aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      const ariaSelector = `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel)}"]`;
      if (document.querySelectorAll(ariaSelector).length === 1) {
        if (includeAlternatives) alternatives.push({ selector: ariaSelector, type: 'aria-label' });
        else return ariaSelector;
      }
    }

    // 5. Try unique class combination
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.trim().split(/\s+/).filter(c => c && !c.match(/^(active|hover|focus|selected|open|closed|visible|hidden|disabled|enabled)$/i));
      if (classes.length > 0) {
        const classSelector = '.' + classes.map(c => CSS.escape(c)).join('.');
        if (document.querySelectorAll(classSelector).length === 1) {
          if (includeAlternatives) alternatives.push({ selector: classSelector, type: 'class' });
          else return classSelector;
        }
      }
    }

    // 6. Build hierarchical path with stability optimizations
    const path = buildHierarchicalSelector(el);
    if (includeAlternatives) {
      alternatives.push({ selector: path, type: 'hierarchical' });
      return alternatives.length > 0 ? alternatives[0].selector : path;
    }

    return path;
  }

  /**
   * Build a hierarchical CSS selector path
   * Optimized for stability - uses stable attributes when available
   */
  function buildHierarchicalSelector(el) {
    const path = [];
    let current = el;

    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      let foundStableSelector = false;

      // Check for stable attributes at this level
      const testAttrs = ['data-testid', 'data-qa', 'data-cy', 'data-test'];
      for (const attr of testAttrs) {
        const value = current.getAttribute(attr);
        if (value) {
          selector = `[${attr}="${CSS.escape(value)}"]`;
          foundStableSelector = true;
          break;
        }
      }

      if (!foundStableSelector && current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break; // ID is unique, no need to go further
      }

      if (!foundStableSelector && current.name && (current.tagName === 'INPUT' || current.tagName === 'SELECT' || current.tagName === 'TEXTAREA')) {
        selector = `${current.tagName.toLowerCase()}[name="${CSS.escape(current.name)}"]`;
        const matches = document.querySelectorAll(selector);
        if (matches.length === 1) {
          path.unshift(selector);
          break;
        }
      }

      // Add nth-of-type for disambiguation if needed
      if (!foundStableSelector) {
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector += `:nth-of-type(${index})`;
          }
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
   * Fill an input element with enhanced event simulation
   * Simulates realistic keyboard input to bypass form validation that checks for real typing
   */
  function fillElement(selector, value, options = {}) {
    const el = document.querySelector(selector);
    if (!el) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    const { simulateTyping = true, clearFirst = true } = options;

    // Focus the element
    el.focus();
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    // Clear existing value if requested
    if (clearFirst && el.value) {
      el.value = '';
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'deleteContentBackward',
        data: null
      }));
    }

    if (simulateTyping) {
      // Simulate typing character by character for better compatibility
      for (let i = 0; i < value.length; i++) {
        const char = value[i];

        // Dispatch keydown
        el.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: char,
          code: `Key${char.toUpperCase()}`,
          charCode: char.charCodeAt(0),
          keyCode: char.charCodeAt(0),
          which: char.charCodeAt(0)
        }));

        // Dispatch keypress (deprecated but still used by some frameworks)
        el.dispatchEvent(new KeyboardEvent('keypress', {
          bubbles: true,
          cancelable: true,
          key: char,
          code: `Key${char.toUpperCase()}`,
          charCode: char.charCodeAt(0),
          keyCode: char.charCodeAt(0),
          which: char.charCodeAt(0)
        }));

        // Update the value
        el.value = value.substring(0, i + 1);

        // Dispatch input event with InputEvent for React compatibility
        el.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: char
        }));

        // Dispatch keyup
        el.dispatchEvent(new KeyboardEvent('keyup', {
          bubbles: true,
          cancelable: true,
          key: char,
          code: `Key${char.toUpperCase()}`,
          charCode: char.charCodeAt(0),
          keyCode: char.charCodeAt(0),
          which: char.charCodeAt(0)
        }));
      }
    } else {
      // Simple value set (old behavior)
      el.value = value;
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: value
      }));
    }

    // Final change event
    el.dispatchEvent(new Event('change', { bubbles: true }));

    // Blur to trigger validation
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    return { success: true, selector, value, simulatedTyping: simulateTyping };
  }

  /**
   * Get element coordinates for native input fallback
   * Returns coordinates that can be used with native macOS click + typeText
   * Use this when fillElement doesn't work (forms checking for trusted events)
   */
  function getElementForNativeInput(selector) {
    const el = document.querySelector(selector);
    if (!el) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    const rect = el.getBoundingClientRect();

    // Check if element is visible and interactable
    if (rect.width === 0 || rect.height === 0) {
      return { success: false, error: 'Element has no dimensions' };
    }

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return { success: false, error: 'Element is not visible' };
    }

    // Scroll element into view
    el.scrollIntoView({ behavior: 'instant', block: 'center' });

    // Recalculate rect after scroll
    const newRect = el.getBoundingClientRect();

    return {
      success: true,
      selector,
      elementType: el.tagName.toLowerCase(),
      inputType: el.type || null,
      currentValue: el.value || '',
      coordinates: {
        // Absolute coordinates within the viewport
        absolute: {
          x: Math.round(newRect.left),
          y: Math.round(newRect.top),
          width: Math.round(newRect.width),
          height: Math.round(newRect.height),
          centerX: Math.round(newRect.left + newRect.width / 2),
          centerY: Math.round(newRect.top + newRect.height / 2)
        },
        // Normalized coordinates (0-1) for use with native click
        normalized: {
          x: newRect.left / window.innerWidth,
          y: newRect.top / window.innerHeight,
          centerX: (newRect.left + newRect.width / 2) / window.innerWidth,
          centerY: (newRect.top + newRect.height / 2) / window.innerHeight
        }
      },
      // Hint for the caller about whether to use native input
      requiresNativeInput: true,
      instructions: 'Use focusApplication("Firefox") → click(normalized.centerX, normalized.centerY) → typeText(value)'
    };
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
      // Wrap code in an immediately-invoked function to support return statements
      const wrappedCode = `(function() { ${code} })()`;
      const result = eval(wrappedCode);
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

  // ========== BROWSER AUTOMATION TOOLS (Playwright-style) ==========

  /**
   * Get the HTML content of the page
   */
  function getVisibleHtml(options = {}) {
    const {
      selector,
      removeScripts = true,
      removeStyles = false,
      cleanHtml = false,
      maxLength = 50000
    } = options;

    try {
      let container = document;
      if (selector) {
        const el = document.querySelector(selector);
        if (!el) {
          return { error: `Selector not found: ${selector}` };
        }
        container = el;
      }

      // Clone the content to avoid modifying the page
      let html = container === document
        ? document.documentElement.outerHTML
        : container.outerHTML;

      // Remove scripts if requested
      if (removeScripts) {
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }

      // Remove styles if requested
      if (removeStyles) {
        html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
      }

      // Clean HTML if requested
      if (cleanHtml) {
        // Remove comments
        html = html.replace(/<!--[\s\S]*?-->/g, '');
        // Remove excessive whitespace
        html = html.replace(/\s+/g, ' ');
        // Remove empty attributes
        html = html.replace(/\s+(?:class|id|style)=["']\s*["']/gi, '');
      }

      // Truncate if needed
      const truncated = html.length > maxLength;
      if (truncated) {
        html = html.substring(0, maxLength) + '\n<!-- ... truncated ... -->';
      }

      return {
        html,
        length: html.length,
        truncated,
        selector: selector || 'document',
        url: window.location.href
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Hover over an element
   */
  function hoverElement(selector) {
    try {
      const el = document.querySelector(selector);
      if (!el) {
        return { error: `Element not found: ${selector}` };
      }

      // Scroll into view first
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Dispatch mouse events to simulate hover
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const mouseEnterEvent = new MouseEvent('mouseenter', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY
      });

      const mouseOverEvent = new MouseEvent('mouseover', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY
      });

      const mouseMoveEvent = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY
      });

      el.dispatchEvent(mouseEnterEvent);
      el.dispatchEvent(mouseOverEvent);
      el.dispatchEvent(mouseMoveEvent);

      return {
        success: true,
        selector,
        tagName: el.tagName.toLowerCase(),
        text: el.textContent?.trim().substring(0, 100) || ''
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Drag an element to a target
   */
  function dragElement(sourceSelector, targetSelector) {
    try {
      const source = document.querySelector(sourceSelector);
      const target = document.querySelector(targetSelector);

      if (!source) {
        return { error: `Source element not found: ${sourceSelector}` };
      }
      if (!target) {
        return { error: `Target element not found: ${targetSelector}` };
      }

      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      const sourceCenterX = sourceRect.left + sourceRect.width / 2;
      const sourceCenterY = sourceRect.top + sourceRect.height / 2;
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;

      // Create and dispatch drag events
      const dataTransfer = new DataTransfer();

      // Mouse down on source
      source.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, view: window,
        clientX: sourceCenterX, clientY: sourceCenterY
      }));

      // Drag start
      source.dispatchEvent(new DragEvent('dragstart', {
        bubbles: true, cancelable: true,
        clientX: sourceCenterX, clientY: sourceCenterY,
        dataTransfer
      }));

      // Drag over target
      target.dispatchEvent(new DragEvent('dragover', {
        bubbles: true, cancelable: true,
        clientX: targetCenterX, clientY: targetCenterY,
        dataTransfer
      }));

      // Drop on target
      target.dispatchEvent(new DragEvent('drop', {
        bubbles: true, cancelable: true,
        clientX: targetCenterX, clientY: targetCenterY,
        dataTransfer
      }));

      // Drag end
      source.dispatchEvent(new DragEvent('dragend', {
        bubbles: true, cancelable: true,
        clientX: targetCenterX, clientY: targetCenterY,
        dataTransfer
      }));

      // Mouse up
      target.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true, cancelable: true, view: window,
        clientX: targetCenterX, clientY: targetCenterY
      }));

      return {
        success: true,
        source: sourceSelector,
        target: targetSelector
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Press a keyboard key
   */
  function pressKey(key, selector) {
    try {
      let targetElement = document.activeElement || document.body;

      // If selector provided, focus that element first
      if (selector) {
        const el = document.querySelector(selector);
        if (!el) {
          return { error: `Element not found: ${selector}` };
        }
        el.focus();
        targetElement = el;
      }

      // Parse key combination (e.g., "Ctrl+a", "Shift+Tab")
      let keyName = key;
      let ctrlKey = false;
      let shiftKey = false;
      let altKey = false;
      let metaKey = false;

      if (key.includes('+')) {
        const parts = key.split('+');
        keyName = parts.pop();
        for (const modifier of parts) {
          const mod = modifier.toLowerCase();
          if (mod === 'ctrl' || mod === 'control') ctrlKey = true;
          if (mod === 'shift') shiftKey = true;
          if (mod === 'alt') altKey = true;
          if (mod === 'meta' || mod === 'cmd' || mod === 'command') metaKey = true;
        }
      }

      // Map common key names to key codes
      const keyMap = {
        'enter': { key: 'Enter', keyCode: 13 },
        'tab': { key: 'Tab', keyCode: 9 },
        'escape': { key: 'Escape', keyCode: 27 },
        'esc': { key: 'Escape', keyCode: 27 },
        'backspace': { key: 'Backspace', keyCode: 8 },
        'delete': { key: 'Delete', keyCode: 46 },
        'arrowup': { key: 'ArrowUp', keyCode: 38 },
        'arrowdown': { key: 'ArrowDown', keyCode: 40 },
        'arrowleft': { key: 'ArrowLeft', keyCode: 37 },
        'arrowright': { key: 'ArrowRight', keyCode: 39 },
        'home': { key: 'Home', keyCode: 36 },
        'end': { key: 'End', keyCode: 35 },
        'pageup': { key: 'PageUp', keyCode: 33 },
        'pagedown': { key: 'PageDown', keyCode: 34 },
        'space': { key: ' ', keyCode: 32 },
        ' ': { key: ' ', keyCode: 32 }
      };

      const keyInfo = keyMap[keyName.toLowerCase()] || {
        key: keyName,
        keyCode: keyName.length === 1 ? keyName.charCodeAt(0) : 0
      };

      const eventOptions = {
        key: keyInfo.key,
        keyCode: keyInfo.keyCode,
        code: keyInfo.key.length === 1 ? `Key${keyInfo.key.toUpperCase()}` : keyInfo.key,
        which: keyInfo.keyCode,
        bubbles: true,
        cancelable: true,
        ctrlKey,
        shiftKey,
        altKey,
        metaKey
      };

      // Dispatch keydown
      targetElement.dispatchEvent(new KeyboardEvent('keydown', eventOptions));

      // Dispatch keypress (for printable characters)
      if (keyInfo.key.length === 1) {
        targetElement.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
      }

      // Dispatch keyup
      targetElement.dispatchEvent(new KeyboardEvent('keyup', eventOptions));

      return {
        success: true,
        key,
        selector: selector || 'activeElement',
        targetTag: targetElement.tagName.toLowerCase()
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Crop a screenshot to a specific element (returns element bounds for external cropping)
   */
  function cropScreenshotToElement(screenshot, selector) {
    try {
      const el = document.querySelector(selector);
      if (!el) {
        return { error: `Element not found: ${selector}` };
      }

      const rect = el.getBoundingClientRect();

      // Return the bounds for the background script to do the actual cropping
      return {
        bounds: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        selector,
        // Note: actual cropping would need to be done with canvas in background script
        note: 'Element bounds returned - cropping requires canvas API'
      };
    } catch (error) {
      return { error: error.message };
    }
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

  // ========== ENHANCED TOOLS ==========

  /**
   * Inspect current page - unified tool combining screenshot + elements + OCR
   */
  async function inspectCurrentPage(options = {}) {
    const result = {
      pageInfo: getPageInfo(),
      elements: getUIElementsEnhanced(),
      screenshot: null,
      ocr: null
    };

    // Add screenshot if requested (default: true)
    if (options.includeScreenshot !== false) {
      try {
        // Take screenshot using canvas API
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Note: This is a placeholder - actual screenshot requires browser API
        // which must be called from background script, not injected script
        result.screenshot = {
          note: 'Screenshot must be captured by background script using browser.tabs.captureVisibleTab',
          width: window.innerWidth,
          height: window.innerHeight
        };
      } catch (error) {
        result.screenshot = { error: error.message };
      }
    }

    // Add OCR if requested (default: false)
    if (options.includeOCR) {
      // OCR would require Tesseract.js or similar - placeholder for now
      result.ocr = {
        note: 'OCR requires Tesseract.js library to be loaded',
        text: getVisibleText(50000).text
      };
    }

    return result;
  }

  /**
   * Get UI elements with enhanced form field detection
   * Returns elements with:
   * - Type (text input, dropdown, radio, checkbox, button)
   * - Labels (from <label> tags or aria-label or placeholder)
   * - Current values
   * - Coordinates (both absolute pixels AND normalized 0-1)
   * - Grouped radio buttons
   */
  function getUIElementsEnhanced() {
    const elements = [];
    const radioGroups = {}; // Track radio buttons by name

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

      // Check if element is actually visible (not hidden by CSS)
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

      // Determine element type (with combo-box detection)
      const typeInfo = getEnhancedElementType(el, true);
      const elementType = typeInfo.type;

      // Get label for the element
      const label = getElementLabel(el);

      // Get current value
      const currentValue = getElementValue(el);

      // Generate selector
      const selector = generateSelector(el);

      // Calculate coordinates (both absolute and normalized)
      const absoluteCoords = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        centerX: Math.round(rect.left + rect.width / 2),
        centerY: Math.round(rect.top + rect.height / 2)
      };

      const normalizedCoords = {
        x: rect.left / window.innerWidth,
        y: rect.top / window.innerHeight,
        width: rect.width / window.innerWidth,
        height: rect.height / window.innerHeight,
        centerX: (rect.left + rect.width / 2) / window.innerWidth,
        centerY: (rect.top + rect.height / 2) / window.innerHeight
      };

      // Screen coordinates for native input fallback
      const screenCoords = {
        x: window.screenX + rect.left,
        y: window.screenY + (window.outerHeight - window.innerHeight) + rect.top,
        centerX: window.screenX + rect.left + rect.width / 2,
        centerY: window.screenY + (window.outerHeight - window.innerHeight) + rect.top + rect.height / 2
      };

      const elementData = {
        index,
        type: elementType,
        tagName: el.tagName.toLowerCase(),
        label,
        currentValue,
        selector,
        id: el.id || null,
        name: el.name || null,
        placeholder: el.placeholder || null,
        disabled: el.disabled || false,
        required: el.required || false,
        checked: el.checked || null,
        visible: true,
        coordinates: {
          absolute: absoluteCoords,
          normalized: normalizedCoords,
          screen: screenCoords
        },
        attributes: getRelevantAttributes(el)
      };

      // Add combo-box metadata if detected
      if (typeInfo.comboBox) {
        elementData.comboBox = {
          framework: typeInfo.comboBox.framework,
          isOpen: typeInfo.comboBox.isOpen,
          toggleSelector: typeInfo.comboBox.toggleSelector,
          containerSelector: typeInfo.comboBox.containerSelector,
          hasOptions: typeInfo.comboBox.hasOptions,
          optionCount: typeInfo.comboBox.options?.length || 0,
          screenCoordinates: typeInfo.comboBox.screenCoordinates,
          hint: 'Use getDropdownOptions to open and see available choices, or click toggleSelector to open manually'
        };
      }

      // Handle radio buttons specially - group them
      if (elementType === 'radio' && el.name) {
        if (!radioGroups[el.name]) {
          radioGroups[el.name] = [];
        }
        radioGroups[el.name].push(elementData);
      }

      elements.push(elementData);
    });

    return {
      elements,
      radioGroups,
      summary: {
        total: elements.length,
        inputs: elements.filter(e => e.type === 'text-input' || e.type === 'email-input' || e.type === 'password-input' || e.type === 'number-input').length,
        dropdowns: elements.filter(e => e.type === 'dropdown').length,
        comboBoxes: elements.filter(e => e.type === 'combo-box').length,
        checkboxes: elements.filter(e => e.type === 'checkbox').length,
        radioButtons: elements.filter(e => e.type === 'radio').length,
        radioGroups: Object.keys(radioGroups).length,
        buttons: elements.filter(e => e.type === 'button' || e.type === 'submit-button').length,
        links: elements.filter(e => e.type === 'link').length
      }
    };
  }

  /**
   * Detect if an element is part of a custom combo-box/dropdown component
   * Returns metadata about the combo-box for LLM consumption
   */
  function detectComboBox(el) {
    // Check if this input is inside a react-select or similar component
    const container = el.closest('[class*="select"], [class*="combobox"], [class*="autocomplete"], [class*="dropdown"]');
    if (!container) return null;

    const result = {
      isComboBox: true,
      framework: null,
      isOpen: false,
      toggleSelector: null,
      containerSelector: null,
      inputSelector: generateSelector(el),
      hasOptions: false,
      options: [],
      screenCoordinates: null
    };

    // Detect framework from class names
    const containerClasses = container.className || '';
    if (containerClasses.includes('react-select') || el.id?.includes('react-select')) {
      result.framework = 'react-select';
    } else if (containerClasses.includes('MuiSelect') || containerClasses.includes('MuiAutocomplete')) {
      result.framework = 'material-ui';
    } else if (containerClasses.includes('ant-select')) {
      result.framework = 'ant-design';
    } else if (containerClasses.includes('vs__') || containerClasses.includes('vue-select')) {
      result.framework = 'vue-select';
    } else if (containerClasses.includes('choices') || containerClasses.includes('select2')) {
      result.framework = 'choices-js';
    } else {
      result.framework = 'custom';
    }

    // Find the toggle button
    const toggleButton = container.querySelector('button[aria-label*="Toggle"], button[aria-label*="toggle"], [class*="indicator"], [class*="arrow"], [role="button"]');
    if (toggleButton) {
      result.toggleSelector = generateSelector(toggleButton);
    }

    // Check if dropdown is open
    const menu = container.querySelector('[class*="menu"], [class*="listbox"], [role="listbox"], [class*="options"]');
    result.isOpen = !!(menu && menu.offsetParent !== null);

    // Get container selector
    result.containerSelector = generateSelector(container);

    // Get screen coordinates for native input fallback
    const rect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    result.screenCoordinates = {
      input: {
        x: window.screenX + rect.left,
        y: window.screenY + (window.outerHeight - window.innerHeight) + rect.top,
        centerX: window.screenX + rect.left + rect.width / 2,
        centerY: window.screenY + (window.outerHeight - window.innerHeight) + rect.top + rect.height / 2,
        normalized: {
          x: rect.left / window.innerWidth,
          y: rect.top / window.innerHeight,
          centerX: (rect.left + rect.width / 2) / window.innerWidth,
          centerY: (rect.top + rect.height / 2) / window.innerHeight
        }
      },
      container: {
        x: window.screenX + containerRect.left,
        y: window.screenY + (window.outerHeight - window.innerHeight) + containerRect.top,
        centerX: window.screenX + containerRect.left + containerRect.width / 2,
        centerY: window.screenY + (window.outerHeight - window.innerHeight) + containerRect.top + containerRect.height / 2,
        normalized: {
          x: containerRect.left / window.innerWidth,
          y: containerRect.top / window.innerHeight,
          centerX: (containerRect.left + containerRect.width / 2) / window.innerWidth,
          centerY: (containerRect.top + containerRect.height / 2) / window.innerHeight
        }
      }
    };

    // If open, get visible options
    if (result.isOpen && menu) {
      const optionEls = menu.querySelectorAll('[role="option"], [class*="option"], [id*="option"]');
      optionEls.forEach(opt => {
        if (opt.offsetParent !== null) { // visible
          const optRect = opt.getBoundingClientRect();
          result.options.push({
            text: opt.textContent?.trim(),
            selector: generateSelector(opt),
            value: opt.getAttribute('data-value') || opt.getAttribute('value') || null,
            screenCoordinates: {
              centerX: window.screenX + optRect.left + optRect.width / 2,
              centerY: window.screenY + (window.outerHeight - window.innerHeight) + optRect.top + optRect.height / 2,
              normalized: {
                centerX: (optRect.left + optRect.width / 2) / window.innerWidth,
                centerY: (optRect.top + optRect.height / 2) / window.innerHeight
              }
            }
          });
        }
      });
      result.hasOptions = result.options.length > 0;
    }

    return result;
  }

  /**
   * Get dropdown options for a combo-box element
   * Opens the dropdown if needed and returns available options with coordinates
   */
  async function getDropdownOptions(selector, options = {}) {
    const { waitMs = 300, closeAfter = false } = options;

    const el = document.querySelector(selector);
    if (!el) {
      return { error: `Element not found: ${selector}` };
    }

    // Detect if it's a combo-box
    const comboInfo = detectComboBox(el);

    // If it's a native select, return options directly
    if (!comboInfo && el.tagName === 'SELECT') {
      const options = [];
      for (const opt of el.options) {
        options.push({
          text: opt.text,
          value: opt.value,
          selected: opt.selected
        });
      }
      return {
        type: 'native-select',
        isOpen: true,
        options
      };
    }

    if (!comboInfo) {
      return { error: 'Element is not a recognized combo-box or select' };
    }

    // If not open, try to open it
    if (!comboInfo.isOpen) {
      // Try clicking toggle button first
      if (comboInfo.toggleSelector) {
        const toggle = document.querySelector(comboInfo.toggleSelector);
        if (toggle) toggle.click();
      } else {
        // For react-select style components, we need to:
        // 1. Focus the element
        // 2. Dispatch proper mouse events (React listens to mousedown)
        // 3. Or type something to trigger autocomplete
        el.focus();

        // Dispatch mousedown which React's synthetic event system listens to
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.click();

        // Also try keyboard event to open (ArrowDown opens react-select)
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
      }

      // Wait for dropdown to open
      await new Promise(r => setTimeout(r, waitMs));
    }

    // Re-detect to get options now that it's open
    const updatedInfo = detectComboBox(el);

    if (!updatedInfo) {
      return { error: 'Could not detect combo-box after opening' };
    }

    // If still no options visible, try to find them in the DOM
    if (!updatedInfo.hasOptions) {
      // Look for menu that might have appeared anywhere in DOM (portaled)
      const menus = document.querySelectorAll('[class*="menu"], [role="listbox"], [class*="dropdown-menu"]');
      for (const menu of menus) {
        if (menu.offsetParent !== null) { // visible
          const optionEls = menu.querySelectorAll('[role="option"], [class*="option"], [id*="option"], li');
          optionEls.forEach(opt => {
            if (opt.offsetParent !== null && opt.textContent?.trim()) {
              const optRect = opt.getBoundingClientRect();
              updatedInfo.options.push({
                text: opt.textContent?.trim(),
                selector: generateSelector(opt),
                value: opt.getAttribute('data-value') || opt.getAttribute('value') || null,
                screenCoordinates: {
                  centerX: window.screenX + optRect.left + optRect.width / 2,
                  centerY: window.screenY + (window.outerHeight - window.innerHeight) + optRect.top + optRect.height / 2,
                  normalized: {
                    centerX: (optRect.left + optRect.width / 2) / window.innerWidth,
                    centerY: (optRect.top + optRect.height / 2) / window.innerHeight
                  }
                }
              });
            }
          });
          updatedInfo.hasOptions = updatedInfo.options.length > 0;
          if (updatedInfo.hasOptions) break;
        }
      }
    }

    // Optionally close the dropdown
    if (closeAfter && comboInfo.toggleSelector) {
      const toggle = document.querySelector(comboInfo.toggleSelector);
      if (toggle) toggle.click();
    }

    return {
      type: 'combo-box',
      framework: updatedInfo.framework,
      isOpen: true,
      options: updatedInfo.options,
      optionCount: updatedInfo.options.length,
      inputSelector: updatedInfo.inputSelector,
      toggleSelector: updatedInfo.toggleSelector,
      containerSelector: updatedInfo.containerSelector,
      screenCoordinates: updatedInfo.screenCoordinates,
      hint: updatedInfo.options.length > 0
        ? 'Use fillElement to type and filter, then click an option selector. Or use screenCoordinates for native input fallback.'
        : 'No options found. Try typing in the input to load options.'
    };
  }

  /**
   * Get enhanced element type with more specificity for form fields
   * Also returns combo-box info if the element is part of a custom dropdown
   */
  function getEnhancedElementType(el, returnComboInfo = false) {
    const tag = el.tagName.toLowerCase();

    // Check for combo-box first (for input elements)
    if (tag === 'input') {
      const comboInfo = detectComboBox(el);
      if (comboInfo) {
        if (returnComboInfo) return { type: 'combo-box', comboBox: comboInfo };
        return 'combo-box';
      }
    }

    if (tag === 'a') return returnComboInfo ? { type: 'link' } : 'link';
    if (tag === 'button') {
      const type = el.type === 'submit' ? 'submit-button' : 'button';
      return returnComboInfo ? { type } : type;
    }
    if (tag === 'select') return returnComboInfo ? { type: 'dropdown' } : 'dropdown';
    if (tag === 'textarea') return returnComboInfo ? { type: 'textarea' } : 'textarea';

    if (tag === 'input') {
      const type = el.type?.toLowerCase() || 'text';
      let result;
      if (type === 'submit') result = 'submit-button';
      else if (type === 'button') result = 'button';
      else if (type === 'checkbox') result = 'checkbox';
      else if (type === 'radio') result = 'radio';
      else if (type === 'file') result = 'file-input';
      else if (type === 'email') result = 'email-input';
      else if (type === 'password') result = 'password-input';
      else if (type === 'number') result = 'number-input';
      else if (type === 'tel') result = 'tel-input';
      else if (type === 'url') result = 'url-input';
      else if (type === 'date') result = 'date-input';
      else result = 'text-input';
      return returnComboInfo ? { type: result } : result;
    }

    // Check for role
    const role = el.getAttribute('role');
    if (role) return returnComboInfo ? { type: role } : role;

    return returnComboInfo ? { type: 'interactive' } : 'interactive';
  }

  /**
   * Get label for an element (from <label>, aria-label, or placeholder)
   */
  function getElementLabel(el) {
    // Check for explicit label element
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) {
        return label.textContent?.trim() || '';
      }
    }

    // Check for parent label
    const parentLabel = el.closest('label');
    if (parentLabel) {
      // Get label text excluding the input's own text
      const clone = parentLabel.cloneNode(true);
      const inputInClone = clone.querySelector(el.tagName.toLowerCase());
      if (inputInClone) inputInClone.remove();
      return clone.textContent?.trim() || '';
    }

    // Check aria-label
    if (el.getAttribute('aria-label')) {
      return el.getAttribute('aria-label');
    }

    // Check aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) {
        return labelEl.textContent?.trim() || '';
      }
    }

    // For non-input elements, use text content
    if (el.tagName.toLowerCase() !== 'input' && el.tagName.toLowerCase() !== 'select') {
      return el.textContent?.trim().substring(0, 100) || '';
    }

    // Fallback to placeholder
    if (el.placeholder) {
      return el.placeholder;
    }

    // Fallback to name or id
    return el.name || el.id || '';
  }

  /**
   * Get current value of an element
   */
  function getElementValue(el) {
    const tag = el.tagName.toLowerCase();

    if (tag === 'input') {
      if (el.type === 'checkbox' || el.type === 'radio') {
        return el.checked;
      }
      if (el.type === 'password') {
        return el.value ? '***' : '';
      }
      return el.value || '';
    }

    if (tag === 'select') {
      const selected = el.options[el.selectedIndex];
      return selected ? {
        value: selected.value,
        text: selected.text
      } : null;
    }

    if (tag === 'textarea') {
      return el.value || '';
    }

    return null;
  }

  /**
   * Fill a form field by its label
   * Finds the field, clicks it, and fills it atomically
   */
  function fillFormField(label, value) {
    // Find all potential form fields
    const allInputs = document.querySelectorAll('input, select, textarea');

    let matchedElement = null;
    let matchScore = 0;

    // Try to find the best matching element by label
    allInputs.forEach(el => {
      const elementLabel = getElementLabel(el).toLowerCase();
      const searchLabel = label.toLowerCase();

      // Exact match
      if (elementLabel === searchLabel) {
        matchedElement = el;
        matchScore = 100;
        return;
      }

      // Contains match
      if (elementLabel.includes(searchLabel) || searchLabel.includes(elementLabel)) {
        if (matchScore < 50) {
          matchedElement = el;
          matchScore = 50;
        }
      }

      // Fuzzy match on placeholder
      if (el.placeholder && el.placeholder.toLowerCase().includes(searchLabel)) {
        if (matchScore < 30) {
          matchedElement = el;
          matchScore = 30;
        }
      }

      // Fuzzy match on name/id
      const nameId = (el.name || el.id || '').toLowerCase();
      if (nameId.includes(searchLabel)) {
        if (matchScore < 20) {
          matchedElement = el;
          matchScore = 20;
        }
      }
    });

    if (!matchedElement) {
      // Return available field labels for debugging
      const availableLabels = Array.from(allInputs).slice(0, 20).map(el => ({
        label: getElementLabel(el),
        type: el.type || el.tagName.toLowerCase(),
        name: el.name || null,
        id: el.id || null
      }));

      return {
        success: false,
        error: `No form field found matching label: "${label}"`,
        availableFields: availableLabels
      };
    }

    // Focus the element
    try {
      matchedElement.focus();
    } catch (e) {
      // Ignore focus errors
    }

    // Click the element (for custom controls)
    try {
      matchedElement.click();
    } catch (e) {
      // Ignore click errors
    }

    // Fill the value based on element type
    const tag = matchedElement.tagName.toLowerCase();

    if (tag === 'select') {
      // Handle dropdowns
      return selectOption(generateSelector(matchedElement), value);
    } else if (tag === 'input' && (matchedElement.type === 'checkbox' || matchedElement.type === 'radio')) {
      // Handle checkboxes and radios
      if (value === true || value === 'true' || value === 'yes' || value === '1') {
        matchedElement.checked = true;
      } else {
        matchedElement.checked = false;
      }
      matchedElement.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        success: true,
        label,
        elementLabel: getElementLabel(matchedElement),
        selector: generateSelector(matchedElement),
        checked: matchedElement.checked
      };
    } else {
      // Handle text inputs and textareas
      matchedElement.value = value;
      matchedElement.dispatchEvent(new Event('input', { bubbles: true }));
      matchedElement.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        success: true,
        label,
        elementLabel: getElementLabel(matchedElement),
        selector: generateSelector(matchedElement),
        value: matchedElement.value
      };
    }
  }

  // ========== LLM INTROSPECTION TOOLS ==========

  /**
   * List all interactive elements in a format optimized for LLM consumption
   * This is the PRIMARY tool for LLMs to understand what actions are available on a page
   *
   * Returns structured data with:
   * - tag, type, id, name, classes
   * - visible text
   * - aria-label / placeholder
   * - the CSS selector to use for actions
   * - alternatives selectors for robustness
   */
  function listInteractiveElements(options = {}) {
    const {
      includeHidden = false,
      maxElements = 200,
      filterType = null, // 'input', 'button', 'link', etc.
      searchText = null,
      includeShadowDOM = true,
      includeIframes = true
    } = options;

    const results = [];
    const interactiveSelectors = [
      'a[href]', 'button', 'input', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
      '[role="menuitem"]', '[role="tab"]', '[role="combobox"]', '[role="listbox"]',
      '[onclick]', '[tabindex]:not([tabindex="-1"])',
      'summary', 'details', '[contenteditable="true"]'
    ];

    // Collect elements from main document
    collectElementsFromRoot(document, results, interactiveSelectors, options);

    // Collect from shadow DOMs
    if (includeShadowDOM) {
      collectFromShadowRoots(document.body, results, interactiveSelectors, options);
    }

    // Collect from same-origin iframes
    if (includeIframes) {
      collectFromIframes(results, interactiveSelectors, options);
    }

    // Apply filters
    let filtered = results;

    if (filterType) {
      filtered = filtered.filter(el => el.type === filterType || el.tagName === filterType);
    }

    if (searchText) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(el =>
        (el.text || '').toLowerCase().includes(search) ||
        (el.ariaLabel || '').toLowerCase().includes(search) ||
        (el.placeholder || '').toLowerCase().includes(search) ||
        (el.name || '').toLowerCase().includes(search) ||
        (el.id || '').toLowerCase().includes(search)
      );
    }

    // Limit results
    filtered = filtered.slice(0, maxElements);

    return {
      elements: filtered,
      total: results.length,
      filtered: filtered.length,
      truncated: results.length > maxElements,
      summary: {
        byType: countByProperty(filtered, 'type'),
        byTag: countByProperty(filtered, 'tagName'),
        withTestId: filtered.filter(e => e.hasTestId).length,
        withAriaLabel: filtered.filter(e => e.ariaLabel).length,
        inShadowDOM: filtered.filter(e => e.inShadowDOM).length,
        inIframe: filtered.filter(e => e.inIframe).length
      }
    };
  }

  /**
   * Collect interactive elements from a root node
   */
  function collectElementsFromRoot(root, results, selectors, options, context = {}) {
    const { includeHidden = false } = options;
    const { inShadowDOM = false, inIframe = false, iframeSelector = null, shadowHost = null } = context;

    const allElements = root.querySelectorAll(selectors.join(','));

    allElements.forEach((el, index) => {
      // Visibility check
      if (!includeHidden && !isElementActuallyVisible(el)) return;

      const rect = el.getBoundingClientRect();

      // Get comprehensive element info
      const elementInfo = {
        index: results.length,

        // Basic info
        tagName: el.tagName.toLowerCase(),
        type: getEnhancedElementType(el),

        // Identifiers
        id: el.id || null,
        name: el.name || null,
        classes: el.className && typeof el.className === 'string'
          ? el.className.trim().split(/\s+/).filter(c => c)
          : [],

        // Text content
        text: getElementTextContent(el),
        ariaLabel: el.getAttribute('aria-label') || null,
        placeholder: el.placeholder || null,
        title: el.title || null,

        // State
        value: getElementValue(el),
        checked: el.checked ?? null,
        disabled: el.disabled || false,
        required: el.required || false,
        readOnly: el.readOnly || false,

        // Testing attributes (important for automation)
        testId: el.getAttribute('data-testid') || el.getAttribute('data-qa') ||
                el.getAttribute('data-cy') || el.getAttribute('data-test') || null,
        hasTestId: !!(el.getAttribute('data-testid') || el.getAttribute('data-qa') ||
                      el.getAttribute('data-cy') || el.getAttribute('data-test')),

        // Selectors (primary and alternatives for robustness)
        selector: generateSelector(el),
        alternativeSelectors: getAlternativeSelectors(el),

        // Position
        visible: true,
        inViewport: isInViewport(rect),
        coordinates: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          centerX: Math.round(rect.left + rect.width / 2),
          centerY: Math.round(rect.top + rect.height / 2)
        },

        // Context
        inShadowDOM,
        shadowHost: shadowHost ? generateSelector(shadowHost) : null,
        inIframe,
        iframeSelector,

        // For forms - additional context
        formIndex: el.form ? Array.from(document.forms).indexOf(el.form) : null,
        labelText: getElementLabel(el)
      };

      results.push(elementInfo);
    });
  }

  /**
   * Recursively collect elements from shadow DOMs
   */
  function collectFromShadowRoots(node, results, selectors, options) {
    if (!node) return;

    // Check if this node has a shadow root
    if (node.shadowRoot) {
      collectElementsFromRoot(node.shadowRoot, results, selectors, options, {
        inShadowDOM: true,
        shadowHost: node
      });

      // Recursively check shadow root for more shadow DOMs
      collectFromShadowRoots(node.shadowRoot, results, selectors, options);
    }

    // Check all children
    if (node.children) {
      Array.from(node.children).forEach(child => {
        collectFromShadowRoots(child, results, selectors, options);
      });
    }

    // Also check in shadow root's children
    if (node.shadowRoot && node.shadowRoot.children) {
      Array.from(node.shadowRoot.children).forEach(child => {
        collectFromShadowRoots(child, results, selectors, options);
      });
    }
  }

  /**
   * Collect elements from same-origin iframes
   */
  function collectFromIframes(results, selectors, options) {
    const iframes = document.querySelectorAll('iframe');

    iframes.forEach((iframe, index) => {
      try {
        // Check if we can access the iframe content (same-origin policy)
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) return;

        const iframeSelector = generateSelector(iframe);

        collectElementsFromRoot(iframeDoc, results, selectors, options, {
          inIframe: true,
          iframeSelector
        });
      } catch (e) {
        // Cross-origin iframe - can't access
        console.log(`[ScreenControl] Cannot access iframe ${index}: ${e.message}`);
      }
    });
  }

  /**
   * Get text content of an element, cleaned up for display
   */
  function getElementTextContent(el) {
    let text = '';

    if (el.tagName === 'INPUT') {
      text = el.placeholder || el.value || '';
    } else if (el.tagName === 'SELECT') {
      const selected = el.options[el.selectedIndex];
      text = selected ? selected.text : '';
    } else {
      // Get direct text content, not children's text
      text = el.textContent?.trim() || '';
    }

    // Truncate and clean
    return text.substring(0, 150).replace(/\s+/g, ' ').trim();
  }

  /**
   * Get alternative selectors for robustness
   */
  function getAlternativeSelectors(el) {
    const alternatives = [];

    // Test ID selectors
    const testAttrs = ['data-testid', 'data-qa', 'data-cy', 'data-test'];
    for (const attr of testAttrs) {
      const value = el.getAttribute(attr);
      if (value) {
        alternatives.push({
          selector: `[${attr}="${CSS.escape(value)}"]`,
          type: 'test-id',
          confidence: 'high'
        });
      }
    }

    // ID selector
    if (el.id) {
      alternatives.push({
        selector: `#${CSS.escape(el.id)}`,
        type: 'id',
        confidence: 'high'
      });
    }

    // Name selector
    if (el.name) {
      alternatives.push({
        selector: `[name="${CSS.escape(el.name)}"]`,
        type: 'name',
        confidence: 'medium'
      });
    }

    // Aria-label selector
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      alternatives.push({
        selector: `[aria-label="${CSS.escape(ariaLabel)}"]`,
        type: 'aria-label',
        confidence: 'medium'
      });
    }

    // Text-based selector (for buttons/links)
    const text = el.textContent?.trim();
    if (text && text.length < 50 && (el.tagName === 'BUTTON' || el.tagName === 'A')) {
      alternatives.push({
        selector: `${el.tagName.toLowerCase()}:contains("${text.substring(0, 30)}")`,
        type: 'text-content',
        confidence: 'low',
        note: 'Use clickByText() for text-based selection'
      });
    }

    return alternatives;
  }

  /**
   * Check if element is in viewport
   */
  function isInViewport(rect) {
    return rect.top < window.innerHeight && rect.bottom > 0 &&
           rect.left < window.innerWidth && rect.right > 0;
  }

  /**
   * Count elements by a property value
   */
  function countByProperty(elements, property) {
    const counts = {};
    elements.forEach(el => {
      const value = el[property] || 'unknown';
      counts[value] = (counts[value] || 0) + 1;
    });
    return counts;
  }

  // ========== ENHANCED DEBUG FEEDBACK ==========

  /**
   * Click an element with detailed debug feedback on failure
   */
  function clickElementWithDebug(selector) {
    const debugInfo = findElementWithDebug(selector);

    if (!debugInfo.found) {
      return {
        success: false,
        error: debugInfo.error,
        debug: debugInfo
      };
    }

    try {
      debugInfo.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      debugInfo.element.click();
      return {
        success: true,
        selector,
        clickedElement: {
          tagName: debugInfo.element.tagName.toLowerCase(),
          text: debugInfo.element.textContent?.trim().substring(0, 50) || '',
          rect: debugInfo.element.getBoundingClientRect()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Click failed: ${error.message}`,
        debug: debugInfo
      };
    }
  }

  /**
   * Find an element with detailed debug information on failure
   */
  function findElementWithDebug(selector) {
    const result = {
      selector,
      found: false,
      element: null,
      error: null,
      matchCount: 0,
      candidates: [],
      suggestions: []
    };

    try {
      const elements = document.querySelectorAll(selector);
      result.matchCount = elements.length;

      if (elements.length === 0) {
        result.error = 'No element found matching selector';
        result.suggestions = generateSelectorSuggestions(selector);
        return result;
      }

      if (elements.length > 1) {
        result.error = `Multiple elements found (${elements.length}). Selector is ambiguous.`;
        result.candidates = Array.from(elements).slice(0, 5).map((el, i) => ({
          index: i,
          tagName: el.tagName.toLowerCase(),
          id: el.id || null,
          classes: el.className || null,
          text: el.textContent?.trim().substring(0, 50) || '',
          visible: isElementActuallyVisible(el),
          selector: generateSelector(el)
        }));
        result.suggestions = [
          'Use a more specific selector',
          'Add index parameter to select nth match',
          'Use one of the candidate selectors listed above'
        ];
        // Still return the first visible element
        const visibleElement = Array.from(elements).find(el => isElementActuallyVisible(el));
        if (visibleElement) {
          result.found = true;
          result.element = visibleElement;
          result.warning = `Selected first visible element out of ${elements.length} matches`;
        }
        return result;
      }

      const el = elements[0];

      // Check visibility
      if (!isElementActuallyVisible(el)) {
        result.error = 'Element found but not visible';
        result.element = el;
        result.visibility = {
          display: window.getComputedStyle(el).display,
          visibility: window.getComputedStyle(el).visibility,
          opacity: window.getComputedStyle(el).opacity,
          rect: el.getBoundingClientRect()
        };
        result.suggestions = [
          'Scroll the element into view first',
          'Check if the element is hidden by CSS',
          'Wait for the element to become visible'
        ];
        return result;
      }

      // Check if element is interactable
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        result.error = 'Element has no dimensions (width or height is 0)';
        result.element = el;
        return result;
      }

      // Success
      result.found = true;
      result.element = el;
      return result;

    } catch (error) {
      result.error = `Invalid selector: ${error.message}`;
      result.suggestions = ['Check selector syntax', 'Escape special characters'];
      return result;
    }
  }

  /**
   * Generate selector suggestions when element not found
   */
  function generateSelectorSuggestions(failedSelector) {
    const suggestions = [];

    // Try to find similar elements
    const tagMatch = failedSelector.match(/^([a-z]+)/i);
    if (tagMatch) {
      const tag = tagMatch[1];
      const similarCount = document.querySelectorAll(tag).length;
      if (similarCount > 0) {
        suggestions.push(`Found ${similarCount} <${tag}> elements on page. Try a more specific selector.`);
      }
    }

    // Check for ID
    const idMatch = failedSelector.match(/#([^.\s\[]+)/);
    if (idMatch) {
      const similarIds = Array.from(document.querySelectorAll('[id]'))
        .filter(el => el.id.toLowerCase().includes(idMatch[1].toLowerCase()))
        .slice(0, 3);
      if (similarIds.length > 0) {
        suggestions.push(`Similar IDs found: ${similarIds.map(el => '#' + el.id).join(', ')}`);
      }
    }

    // Check for class
    const classMatch = failedSelector.match(/\.([^.\s\[]+)/);
    if (classMatch) {
      const similarClasses = Array.from(document.querySelectorAll('[class]'))
        .filter(el => el.className.toLowerCase().includes(classMatch[1].toLowerCase()))
        .slice(0, 3);
      if (similarClasses.length > 0) {
        suggestions.push(`Elements with similar classes: ${similarClasses.map(el => generateSelector(el)).join(', ')}`);
      }
    }

    suggestions.push('Use listInteractiveElements() to see all available elements');

    return suggestions;
  }

  // ========== NEW ENHANCED TOOLS ==========

  /**
   * Click an element by its visible text content
   * Supports element type filtering and index for multiple matches
   */
  function clickByText(text, options = {}) {
    const { index = 0, elementType = 'any', waitForNavigation = false } = options;

    if (!text) {
      return { success: false, error: 'Text is required' };
    }

    // Define selectors based on element type
    let selectors;
    switch (elementType) {
      case 'button':
        selectors = ['button', 'input[type="button"]', 'input[type="submit"]', '[role="button"]'];
        break;
      case 'link':
        selectors = ['a[href]', '[role="link"]'];
        break;
      case 'any':
      default:
        selectors = [
          'button', 'a[href]', 'input[type="button"]', 'input[type="submit"]',
          '[role="button"]', '[role="link"]', '[onclick]', '[tabindex]:not([tabindex="-1"])'
        ];
    }

    // Find all matching elements
    const allElements = document.querySelectorAll(selectors.join(','));
    const matches = [];
    const searchText = text.toLowerCase().trim();

    allElements.forEach(el => {
      // Check if element is visible
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

      // Get element text
      const elementText = (el.textContent || el.value || el.getAttribute('aria-label') || '').toLowerCase().trim();

      // Check for match (exact or contains)
      if (elementText === searchText || elementText.includes(searchText)) {
        matches.push({
          element: el,
          text: elementText,
          exact: elementText === searchText,
          selector: generateSelector(el)
        });
      }
    });

    if (matches.length === 0) {
      return {
        success: false,
        error: `No clickable element found with text: "${text}"`,
        searchedText: text,
        elementType,
        suggestion: 'Try using browser_getInteractiveElements to see available elements'
      };
    }

    // Sort by exact match first
    matches.sort((a, b) => b.exact - a.exact);

    // Get the element at the specified index
    if (index >= matches.length) {
      return {
        success: false,
        error: `Index ${index} out of range. Found ${matches.length} matches.`,
        matchCount: matches.length,
        matches: matches.slice(0, 5).map(m => ({ text: m.text, selector: m.selector }))
      };
    }

    const target = matches[index];

    // Click the element
    try {
      target.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.element.click();

      return {
        success: true,
        clickedText: target.text,
        selector: target.selector,
        index,
        totalMatches: matches.length,
        waitForNavigation
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to click element: ${error.message}`,
        selector: target.selector
      };
    }
  }

  /**
   * Click multiple elements in sequence with optional delays
   */
  async function clickMultiple(selectors, delayMs = 100) {
    if (!selectors || !Array.isArray(selectors) || selectors.length === 0) {
      return { success: false, error: 'Array of selectors is required' };
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];

      // Add delay between clicks (except for the first)
      if (i > 0 && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      try {
        const el = document.querySelector(selector);
        if (!el) {
          results.push({
            index: i,
            selector,
            success: false,
            error: 'Element not found'
          });
          failCount++;
          continue;
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.click();

        results.push({
          index: i,
          selector,
          success: true
        });
        successCount++;
      } catch (error) {
        results.push({
          index: i,
          selector,
          success: false,
          error: error.message
        });
        failCount++;
      }
    }

    return {
      success: failCount === 0,
      results,
      summary: {
        total: selectors.length,
        succeeded: successCount,
        failed: failCount
      }
    };
  }

  /**
   * Get form structure with question grouping for screening questions
   * Groups related fields together (radio buttons with same name, etc.)
   */
  function getFormStructure() {
    const forms = [];
    const questions = [];
    const radioGroups = {};

    // Find all forms or form-like containers
    const formElements = document.querySelectorAll('form, [role="form"], .form, .questionnaire, [data-form]');

    // If no forms found, treat the whole page as a form
    const containers = formElements.length > 0 ? formElements : [document.body];

    containers.forEach((container, formIndex) => {
      const formData = {
        index: formIndex,
        id: container.id || null,
        name: container.name || null,
        action: container.action || null,
        questions: []
      };

      // Find all question-like structures
      // Look for fieldsets, labeled groups, or individual inputs
      const fieldsets = container.querySelectorAll('fieldset, [role="group"], .question, .field-group, .form-group');

      if (fieldsets.length > 0) {
        fieldsets.forEach((fieldset, qIndex) => {
          const question = extractQuestionFromFieldset(fieldset, qIndex);
          if (question) {
            formData.questions.push(question);
            questions.push(question);
          }
        });
      }

      // Also find standalone inputs that aren't in fieldsets
      const standaloneInputs = container.querySelectorAll('input, select, textarea');
      standaloneInputs.forEach(input => {
        // Skip if already processed in a fieldset
        if (input.closest('fieldset, [role="group"], .question, .field-group, .form-group')) return;

        // Skip hidden inputs
        if (input.type === 'hidden') return;

        const question = extractQuestionFromInput(input, questions.length);
        if (question) {
          formData.questions.push(question);
          questions.push(question);
        }
      });

      forms.push(formData);
    });

    // Group radio buttons by name
    questions.forEach(q => {
      if (q.type === 'radio' && q.name) {
        if (!radioGroups[q.name]) {
          radioGroups[q.name] = {
            name: q.name,
            label: q.label,
            options: []
          };
        }
        radioGroups[q.name].options.push({
          value: q.value,
          label: q.optionLabel || q.value,
          selector: q.selector,
          checked: q.checked
        });
      }
    });

    return {
      forms,
      questions,
      radioGroups,
      summary: {
        formCount: forms.length,
        questionCount: questions.length,
        radioGroupCount: Object.keys(radioGroups).length,
        types: {
          text: questions.filter(q => q.type === 'text' || q.type === 'email' || q.type === 'tel').length,
          select: questions.filter(q => q.type === 'select').length,
          radio: Object.keys(radioGroups).length,
          checkbox: questions.filter(q => q.type === 'checkbox').length,
          textarea: questions.filter(q => q.type === 'textarea').length
        }
      }
    };
  }

  /**
   * Extract a question structure from a fieldset or group element
   */
  function extractQuestionFromFieldset(fieldset, index) {
    // Get the legend or group label
    const legend = fieldset.querySelector('legend, .legend, .question-text, h3, h4, label:first-child');
    const label = legend ? legend.textContent?.trim() : '';

    // Find all inputs in this group
    const inputs = fieldset.querySelectorAll('input, select, textarea');
    if (inputs.length === 0) return null;

    const firstInput = inputs[0];
    const type = firstInput.type || firstInput.tagName.toLowerCase();

    // Handle radio/checkbox groups
    if (type === 'radio' || type === 'checkbox') {
      const options = [];
      inputs.forEach(input => {
        const optionLabel = input.labels?.[0]?.textContent?.trim() ||
                            input.nextElementSibling?.textContent?.trim() ||
                            input.value;
        options.push({
          value: input.value,
          label: optionLabel,
          selector: generateSelector(input),
          checked: input.checked
        });
      });

      return {
        index,
        type: type === 'radio' ? 'radio-group' : 'checkbox-group',
        label,
        name: firstInput.name,
        options,
        required: firstInput.required,
        selector: generateSelector(fieldset)
      };
    }

    // Single input in fieldset
    return extractQuestionFromInput(firstInput, index, label);
  }

  /**
   * Extract a question structure from a single input
   */
  function extractQuestionFromInput(input, index, providedLabel = null) {
    const type = input.type || input.tagName.toLowerCase();
    const label = providedLabel || getElementLabel(input);

    const question = {
      index,
      type,
      label,
      name: input.name || null,
      id: input.id || null,
      selector: generateSelector(input),
      required: input.required || false,
      value: input.value || null,
      placeholder: input.placeholder || null
    };

    // Add type-specific properties
    if (type === 'select') {
      question.options = Array.from(input.options).map(opt => ({
        value: opt.value,
        label: opt.text,
        selected: opt.selected
      }));
    }

    if (type === 'radio' || type === 'checkbox') {
      question.checked = input.checked;
      question.optionLabel = input.labels?.[0]?.textContent?.trim() ||
                             input.nextElementSibling?.textContent?.trim() ||
                             input.value;
    }

    return question;
  }

  /**
   * Answer multiple screening questions at once
   * Takes a map of question labels/names to answers
   */
  function answerQuestions(answers, defaultAnswer = null) {
    if (!answers || typeof answers !== 'object') {
      return { success: false, error: 'Answers object is required' };
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;

    // Get form structure to understand questions
    const formStructure = getFormStructure();

    for (const [questionKey, answer] of Object.entries(answers)) {
      // Find matching question
      const question = findMatchingQuestion(formStructure.questions, questionKey);

      if (!question) {
        results.push({
          question: questionKey,
          success: false,
          error: 'Question not found'
        });
        failCount++;
        continue;
      }

      try {
        const result = answerSingleQuestion(question, answer, formStructure);
        results.push({
          question: questionKey,
          matchedLabel: question.label,
          ...result
        });

        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        results.push({
          question: questionKey,
          success: false,
          error: error.message
        });
        failCount++;
      }
    }

    // If there are unanswered questions and a default answer is provided
    if (defaultAnswer !== null) {
      const answeredKeys = Object.keys(answers).map(k => k.toLowerCase());

      formStructure.questions.forEach(q => {
        const qKey = (q.label || q.name || '').toLowerCase();
        if (!answeredKeys.some(k => qKey.includes(k) || k.includes(qKey))) {
          // Unanswered question - try to apply default
          if (q.type === 'radio-group' || q.type === 'checkbox-group') {
            try {
              const result = answerSingleQuestion(q, defaultAnswer, formStructure);
              if (result.success) {
                results.push({
                  question: q.label || q.name,
                  appliedDefault: true,
                  ...result
                });
                successCount++;
              }
            } catch (e) {
              // Ignore errors for default answers
            }
          }
        }
      });
    }

    return {
      success: failCount === 0,
      results,
      summary: {
        total: results.length,
        succeeded: successCount,
        failed: failCount
      }
    };
  }

  /**
   * Find a question matching a key (by label, name, or fuzzy match)
   */
  function findMatchingQuestion(questions, key) {
    const searchKey = key.toLowerCase().trim();

    // Exact match on label
    let match = questions.find(q =>
      (q.label || '').toLowerCase().trim() === searchKey
    );
    if (match) return match;

    // Exact match on name
    match = questions.find(q =>
      (q.name || '').toLowerCase() === searchKey
    );
    if (match) return match;

    // Contains match on label
    match = questions.find(q =>
      (q.label || '').toLowerCase().includes(searchKey) ||
      searchKey.includes((q.label || '').toLowerCase())
    );
    if (match) return match;

    // Contains match on name
    match = questions.find(q =>
      (q.name || '').toLowerCase().includes(searchKey)
    );
    if (match) return match;

    return null;
  }

  /**
   * Answer a single question based on its type
   */
  function answerSingleQuestion(question, answer, formStructure) {
    const answerLower = String(answer).toLowerCase().trim();

    switch (question.type) {
      case 'radio-group':
        // Find the option that matches the answer
        const radioOption = question.options.find(opt =>
          opt.value.toLowerCase() === answerLower ||
          opt.label.toLowerCase() === answerLower ||
          opt.label.toLowerCase().includes(answerLower) ||
          (answerLower === 'yes' && (opt.label.toLowerCase().includes('yes') || opt.value.toLowerCase() === 'yes')) ||
          (answerLower === 'no' && (opt.label.toLowerCase().includes('no') || opt.value.toLowerCase() === 'no'))
        );

        if (!radioOption) {
          return {
            success: false,
            error: `No matching option for answer: ${answer}`,
            availableOptions: question.options.map(o => ({ value: o.value, label: o.label }))
          };
        }

        const radioEl = document.querySelector(radioOption.selector);
        if (!radioEl) {
          return { success: false, error: 'Radio button element not found' };
        }

        radioEl.checked = true;
        radioEl.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, selectedOption: radioOption.label, selector: radioOption.selector };

      case 'checkbox-group':
        // For checkboxes, 'yes' means check, 'no' means uncheck
        const shouldCheck = answerLower === 'yes' || answerLower === 'true' || answerLower === '1';

        question.options.forEach(opt => {
          const checkEl = document.querySelector(opt.selector);
          if (checkEl) {
            checkEl.checked = shouldCheck;
            checkEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });

        return { success: true, checked: shouldCheck };

      case 'checkbox':
        const cbEl = document.querySelector(question.selector);
        if (!cbEl) {
          return { success: false, error: 'Checkbox element not found' };
        }

        const checkValue = answerLower === 'yes' || answerLower === 'true' || answerLower === '1';
        cbEl.checked = checkValue;
        cbEl.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, checked: checkValue };

      case 'radio':
        // Single radio - look up the group
        const groupName = question.name;
        if (groupName && formStructure.radioGroups[groupName]) {
          const group = formStructure.radioGroups[groupName];
          const groupOpt = group.options.find(opt =>
            opt.value.toLowerCase() === answerLower ||
            opt.label.toLowerCase() === answerLower ||
            opt.label.toLowerCase().includes(answerLower)
          );

          if (groupOpt) {
            const groupRadioEl = document.querySelector(groupOpt.selector);
            if (groupRadioEl) {
              groupRadioEl.checked = true;
              groupRadioEl.dispatchEvent(new Event('change', { bubbles: true }));
              return { success: true, selectedOption: groupOpt.label };
            }
          }
        }

        return { success: false, error: 'Could not find radio option to select' };

      case 'select':
        const selectEl = document.querySelector(question.selector);
        if (!selectEl) {
          return { success: false, error: 'Select element not found' };
        }

        // Find matching option
        const selectOpt = question.options.find(opt =>
          opt.value.toLowerCase() === answerLower ||
          opt.label.toLowerCase() === answerLower ||
          opt.label.toLowerCase().includes(answerLower)
        );

        if (!selectOpt) {
          return {
            success: false,
            error: `No matching option for answer: ${answer}`,
            availableOptions: question.options
          };
        }

        selectEl.value = selectOpt.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, selectedValue: selectOpt.value, selectedLabel: selectOpt.label };

      case 'text':
      case 'email':
      case 'tel':
      case 'url':
      case 'number':
      case 'textarea':
      default:
        const inputEl = document.querySelector(question.selector);
        if (!inputEl) {
          return { success: false, error: 'Input element not found' };
        }

        inputEl.focus();
        inputEl.value = answer;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, value: answer };
    }
  }

  // Message handler for communication with content script
  window.addEventListener('message', async function(event) {
    // Only accept messages from our content script
    if (event.source !== window || !event.data || event.data.source !== 'screencontrol-content') {
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
          response = fillElement(payload.selector, payload.value, {
            simulateTyping: payload.simulateTyping !== false,
            clearFirst: payload.clearFirst !== false
          });
          break;
        case 'getElementForNativeInput':
          response = getElementForNativeInput(payload.selector);
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

        // ========== ENHANCED TOOLS ==========
        case 'inspectCurrentPage':
          response = await inspectCurrentPage(payload);
          break;
        case 'getUIElements':
          response = getUIElementsEnhanced();
          break;
        case 'fillFormField':
          response = fillFormField(payload.label, payload.value);
          break;
        case 'getDropdownOptions':
          response = await getDropdownOptions(payload.selector, {
            waitMs: payload.waitMs || 300,
            closeAfter: payload.closeAfter || false
          });
          break;

        // ========== LLM INTROSPECTION ==========
        case 'listInteractiveElements':
          response = listInteractiveElements(payload);
          break;
        case 'clickElementWithDebug':
          response = clickElementWithDebug(payload.selector);
          break;
        case 'findElementWithDebug':
          const debugResult = findElementWithDebug(payload.selector);
          // Don't include the actual element in the response
          delete debugResult.element;
          response = debugResult;
          break;

        // ========== NEW ENHANCED TOOLS ==========
        case 'clickByText':
          response = clickByText(payload.text, {
            index: payload.index || 0,
            elementType: payload.elementType || 'any',
            waitForNavigation: payload.waitForNavigation || false
          });
          break;
        case 'clickMultiple':
          response = await clickMultiple(payload.selectors, payload.delayMs || 100);
          break;
        case 'getFormStructure':
          response = getFormStructure();
          break;
        case 'answerQuestions':
          response = answerQuestions(payload.answers, payload.defaultAnswer || null);
          break;

        // ========== BROWSER AUTOMATION TOOLS (Playwright-style) ==========
        case 'hover':
          response = hoverElement(payload.selector);
          break;
        case 'drag':
          response = dragElement(payload.sourceSelector, payload.targetSelector);
          break;
        case 'pressKey':
          response = pressKey(payload.key, payload.selector);
          break;
        case 'getVisibleHtml':
          response = getVisibleHtml(payload);
          break;
        case 'uploadFile':
          response = { error: 'File upload requires native file system access - use native click on file input then interact with OS file picker' };
          break;
        case 'cropScreenshot':
          response = cropScreenshotToElement(payload.screenshot, payload.selector);
          break;

        default:
          response = { error: `Unknown action: ${action}` };
      }
    } catch (error) {
      response = { error: error.message };
    }

    // Send response back to content script
    window.postMessage({
      source: 'screencontrol-injected',
      requestId,
      response
    }, '*');
  });

  // Signal that injected script is ready
  window.postMessage({
    source: 'screencontrol-injected',
    action: 'ready'
  }, '*');

  console.log('[ScreenControl] Injected script loaded');
})();
