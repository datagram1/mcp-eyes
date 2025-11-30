/**
 * MCP Eyes Browser Tools
 *
 * MCP tool definitions for browser automation.
 * These tools work with the browser extension (Chrome/Firefox) or AppleScript (Safari).
 */

import { BrowserBridge, SafariBridge, InteractiveElement, PageInfo } from './browser-bridge';

// Tool definitions for MCP
export const browserToolDefinitions = [
  {
    name: 'browser_getPageContext',
    description: `Get the current webpage context including all interactive elements with their screen coordinates.
Returns a structured view of the page that includes:
- All clickable elements (buttons, links, inputs) with screen coordinates
- Page info (URL, title, scroll position, viewport size)
- Element selectors for silent mode automation

Use this to understand what's on a webpage before interacting with it.
The screenRect.centerX and screenRect.centerY values can be used with moveMouse and click for natural interaction.`,
    inputSchema: {
      type: 'object',
      properties: {
        browser: {
          type: 'string',
          enum: ['chrome', 'firefox', 'safari'],
          description: 'Browser to target (default: auto-detect)',
        },
        tabId: {
          type: 'number',
          description: 'Specific tab ID to target (optional, defaults to active tab)',
        },
      },
    },
  },
  {
    name: 'browser_getInteractiveElements',
    description: `Get all interactive elements on the current webpage with their screen coordinates.
Returns buttons, links, inputs, and other clickable elements.
Each element includes:
- type: The element type (button, link, input, etc.)
- text: The visible text or label
- selector: CSS selector for silent mode
- screenRect: Screen coordinates with centerX/centerY for mouse clicking

This is the key tool for understanding what can be clicked on a page.`,
    inputSchema: {
      type: 'object',
      properties: {
        browser: {
          type: 'string',
          enum: ['chrome', 'firefox', 'safari'],
          description: 'Browser to target',
        },
        filterType: {
          type: 'string',
          enum: ['button', 'link', 'input', 'all'],
          description: 'Filter elements by type (default: all)',
        },
      },
    },
  },
  {
    name: 'browser_clickElement',
    description: `Click an element on the webpage using JavaScript injection (silent mode).
Use this for fast, reliable clicking when natural mouse movement isn't required.
For bot-detection-sensitive sites, use moveMouse + click instead.

Provide either:
- selector: CSS selector for the element
- text: Text content to search for and click`,
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click',
        },
        text: {
          type: 'string',
          description: 'Text content to find and click (alternative to selector)',
        },
        browser: {
          type: 'string',
          enum: ['chrome', 'firefox', 'safari'],
          description: 'Browser to target',
        },
      },
    },
  },
  {
    name: 'browser_fillInput',
    description: `Fill an input field on the webpage.
For silent mode (JavaScript injection), use this directly.
For natural typing, use this to identify the element, then use keyboard tools.`,
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input element',
        },
        value: {
          type: 'string',
          description: 'Value to fill into the input',
        },
        browser: {
          type: 'string',
          enum: ['chrome', 'firefox', 'safari'],
          description: 'Browser to target',
        },
      },
      required: ['value'],
    },
  },
  {
    name: 'browser_scroll',
    description: `Scroll the webpage.
Can scroll by direction (up, down, top, bottom) or to a specific element.`,
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Direction (up, down, top, bottom) or CSS selector to scroll to',
        },
        browser: {
          type: 'string',
          enum: ['chrome', 'firefox', 'safari'],
          description: 'Browser to target',
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'browser_executeScript',
    description: `Execute JavaScript in the webpage context.
Use for advanced automation that isn't covered by other tools.
Returns the result of the script execution.`,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute',
        },
        browser: {
          type: 'string',
          enum: ['chrome', 'firefox', 'safari'],
          description: 'Browser to target',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'browser_getPageInfo',
    description: `Get information about the current webpage including URL, title, and scroll position.`,
    inputSchema: {
      type: 'object',
      properties: {
        browser: {
          type: 'string',
          enum: ['chrome', 'firefox', 'safari'],
          description: 'Browser to target',
        },
      },
    },
  },
  {
    name: 'browser_getTabs',
    description: `Get a list of all open browser tabs.
Returns tab ID, URL, title, and whether it's the active tab.`,
    inputSchema: {
      type: 'object',
      properties: {
        browser: {
          type: 'string',
          enum: ['chrome', 'firefox', 'safari'],
          description: 'Browser to target',
        },
      },
    },
  },
  {
    name: 'browser_findClickTarget',
    description: `Find an element to click based on text or description.
Returns the element's screen coordinates for natural mouse clicking.
Use this before moveMouse + click for natural-looking automation.`,
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text or description of the element to find (e.g., "Add to Cart", "Submit", "Login")',
        },
        elementType: {
          type: 'string',
          enum: ['button', 'link', 'input', 'any'],
          description: 'Type of element to find (default: any)',
        },
        browser: {
          type: 'string',
          enum: ['chrome', 'firefox', 'safari'],
          description: 'Browser to target',
        },
      },
      required: ['text'],
    },
  },
];

/**
 * Browser Tools Handler
 */
export class BrowserToolsHandler {
  private chromeBridge: BrowserBridge | null = null;
  private firefoxBridge: BrowserBridge | null = null;
  private safariBridge: SafariBridge | null = null;

  constructor() {
    // Bridges are lazily initialized on first use
  }

  private getChromeBridge(): BrowserBridge {
    if (!this.chromeBridge) {
      this.chromeBridge = new BrowserBridge();
    }
    return this.chromeBridge;
  }

  private getFirefoxBridge(): BrowserBridge {
    if (!this.firefoxBridge) {
      this.firefoxBridge = new BrowserBridge();
    }
    return this.firefoxBridge;
  }

  private getSafariBridge(): SafariBridge {
    if (!this.safariBridge) {
      this.safariBridge = new SafariBridge();
    }
    return this.safariBridge;
  }

  /**
   * Handle a browser tool call
   */
  async handleTool(name: string, args: any): Promise<any> {
    const browser = args?.browser || 'safari'; // Default to Safari for macOS

    try {
      switch (name) {
        case 'browser_getPageContext':
          return await this.getPageContext(browser, args?.tabId);

        case 'browser_getInteractiveElements':
          return await this.getInteractiveElements(browser, args?.filterType);

        case 'browser_clickElement':
          return await this.clickElement(browser, args?.selector, args?.text);

        case 'browser_fillInput':
          return await this.fillInput(browser, args?.selector, args?.value);

        case 'browser_scroll':
          return await this.scroll(browser, args?.target);

        case 'browser_executeScript':
          return await this.executeScript(browser, args?.code);

        case 'browser_getPageInfo':
          return await this.getPageInfo(browser);

        case 'browser_getTabs':
          return await this.getTabs(browser);

        case 'browser_findClickTarget':
          return await this.findClickTarget(browser, args?.text, args?.elementType);

        default:
          throw new Error(`Unknown browser tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async getPageContext(browser: string, tabId?: number): Promise<any> {
    let elements: InteractiveElement[];
    let pageInfo: PageInfo;

    if (browser === 'safari') {
      const bridge = this.getSafariBridge();
      [elements, pageInfo] = await Promise.all([
        bridge.getInteractiveElements(),
        bridge.getPageInfo(),
      ]);
    } else {
      const bridge = browser === 'firefox' ? this.getFirefoxBridge() : this.getChromeBridge();
      const context = await bridge.getPageContext(tabId);
      elements = context.elements;
      pageInfo = context.pageInfo;
    }

    // Format for LLM consumption
    const summary = this.formatElementsSummary(elements);

    return {
      content: [
        {
          type: 'text',
          text: `Page: ${pageInfo.title}\nURL: ${pageInfo.url}\n\n${summary}\n\nTotal interactive elements: ${elements.length}`,
        },
      ],
      _raw: { elements, pageInfo },
    };
  }

  private async getInteractiveElements(browser: string, filterType?: string): Promise<any> {
    let elements: InteractiveElement[];

    if (browser === 'safari') {
      elements = await this.getSafariBridge().getInteractiveElements();
    } else {
      const bridge = browser === 'firefox' ? this.getFirefoxBridge() : this.getChromeBridge();
      elements = await bridge.getInteractiveElements();
    }

    // Filter if requested
    if (filterType && filterType !== 'all') {
      elements = elements.filter(el => el.type === filterType);
    }

    const summary = this.formatElementsSummary(elements);

    return {
      content: [
        {
          type: 'text',
          text: summary,
        },
      ],
      _raw: { elements },
    };
  }

  private formatElementsSummary(elements: InteractiveElement[]): string {
    const byType: Record<string, InteractiveElement[]> = {};

    elements.forEach(el => {
      const type = el.type || 'other';
      if (!byType[type]) byType[type] = [];
      byType[type].push(el);
    });

    const lines: string[] = [];

    for (const [type, els] of Object.entries(byType)) {
      lines.push(`\n## ${type.charAt(0).toUpperCase() + type.slice(1)}s (${els.length})`);
      els.slice(0, 10).forEach(el => {
        const text = el.text || el.id || el.selector;
        lines.push(`  - "${text.substring(0, 50)}" at (${Math.round(el.screenRect.centerX)}, ${Math.round(el.screenRect.centerY)})`);
      });
      if (els.length > 10) {
        lines.push(`  ... and ${els.length - 10} more`);
      }
    }

    return lines.join('\n');
  }

  private async clickElement(browser: string, selector?: string, text?: string): Promise<any> {
    let targetSelector = selector;

    // If text is provided, find the element first
    if (!targetSelector && text) {
      const elements = browser === 'safari'
        ? await this.getSafariBridge().getInteractiveElements()
        : await (browser === 'firefox' ? this.getFirefoxBridge() : this.getChromeBridge()).getInteractiveElements();

      const match = elements.find(el =>
        el.text?.toLowerCase().includes(text.toLowerCase())
      );

      if (!match) {
        return {
          content: [{ type: 'text', text: `No element found with text: "${text}"` }],
          isError: true,
        };
      }

      targetSelector = match.selector;
    }

    if (!targetSelector) {
      return {
        content: [{ type: 'text', text: 'Either selector or text must be provided' }],
        isError: true,
      };
    }

    const result = browser === 'safari'
      ? await this.getSafariBridge().clickElement(targetSelector)
      : await (browser === 'firefox' ? this.getFirefoxBridge() : this.getChromeBridge()).clickElement(targetSelector);

    return {
      content: [
        {
          type: 'text',
          text: result.success
            ? `Clicked element: ${targetSelector}`
            : `Failed to click: ${result.error}`,
        },
      ],
      isError: !result.success,
    };
  }

  private async fillInput(browser: string, selector: string | undefined, value: string): Promise<any> {
    if (!selector) {
      return {
        content: [{ type: 'text', text: 'Selector is required for fillInput' }],
        isError: true,
      };
    }

    const result = browser === 'safari'
      ? await this.getSafariBridge().fillElement(selector, value)
      : await (browser === 'firefox' ? this.getFirefoxBridge() : this.getChromeBridge()).fillElement(selector, value);

    return {
      content: [
        {
          type: 'text',
          text: result.success
            ? `Filled "${value}" into ${selector}`
            : `Failed to fill: ${result.error}`,
        },
      ],
      isError: !result.success,
    };
  }

  private async scroll(browser: string, target: string): Promise<any> {
    const result = browser === 'safari'
      ? await this.getSafariBridge().scrollTo(target)
      : await (browser === 'firefox' ? this.getFirefoxBridge() : this.getChromeBridge()).scrollTo(target);

    return {
      content: [
        {
          type: 'text',
          text: `Scrolled ${target}`,
        },
      ],
    };
  }

  private async executeScript(browser: string, code: string): Promise<any> {
    const result = browser === 'safari'
      ? await this.getSafariBridge().executeScript(code)
      : await (browser === 'firefox' ? this.getFirefoxBridge() : this.getChromeBridge()).executeScript(code);

    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result),
        },
      ],
    };
  }

  private async getPageInfo(browser: string): Promise<any> {
    const pageInfo = browser === 'safari'
      ? await this.getSafariBridge().getPageInfo()
      : await (browser === 'firefox' ? this.getFirefoxBridge() : this.getChromeBridge()).getPageInfo();

    return {
      content: [
        {
          type: 'text',
          text: `URL: ${pageInfo.url}\nTitle: ${pageInfo.title}\nDomain: ${pageInfo.domain}\nViewport: ${pageInfo.viewportSize.width}x${pageInfo.viewportSize.height}\nScroll: (${pageInfo.scrollPosition.x}, ${pageInfo.scrollPosition.y})`,
        },
      ],
      _raw: pageInfo,
    };
  }

  private async getTabs(browser: string): Promise<any> {
    const tabs = browser === 'safari'
      ? await this.getSafariBridge().getTabs()
      : await (browser === 'firefox' ? this.getFirefoxBridge() : this.getChromeBridge()).getTabs();

    const tabList = tabs.map(tab =>
      `${tab.active ? '▶' : ' '} [${tab.id}] ${tab.title}\n    ${tab.url}`
    ).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `Open tabs:\n${tabList}`,
        },
      ],
      _raw: tabs,
    };
  }

  private async findClickTarget(browser: string, text: string, elementType?: string): Promise<any> {
    const elements = browser === 'safari'
      ? await this.getSafariBridge().getInteractiveElements()
      : await (browser === 'firefox' ? this.getFirefoxBridge() : this.getChromeBridge()).getInteractiveElements();

    // Filter by type if specified
    let candidates = elements;
    if (elementType && elementType !== 'any') {
      candidates = elements.filter(el => el.type === elementType);
    }

    // Find by text match
    const searchText = text.toLowerCase();
    const match = candidates.find(el =>
      el.text?.toLowerCase().includes(searchText) ||
      el.id?.toLowerCase().includes(searchText) ||
      el.attributes?.['aria-label']?.toLowerCase().includes(searchText)
    );

    if (!match) {
      return {
        content: [
          {
            type: 'text',
            text: `No element found matching "${text}".\n\nAvailable elements:\n${candidates.slice(0, 5).map(el => `- ${el.text || el.id || el.selector}`).join('\n')}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Found: "${match.text}" (${match.type})\nScreen position: (${Math.round(match.screenRect.centerX)}, ${Math.round(match.screenRect.centerY)})\nSelector: ${match.selector}\n\nTo click naturally, use:\n  moveMouse(x: ${match.screenRect.centerX / 1000}, y: ${match.screenRect.centerY / 1000})\n  click()`,
        },
      ],
      _raw: match,
    };
  }
}

export default BrowserToolsHandler;
