/**
 * Email Agent Service
 *
 * Main entry point for the email-triggered AI agent.
 * Watches an IMAP mailbox and processes emails through an LLM.
 */

import { IMAPWatcher, createIMAPWatcherFromEnv, ParsedEmail } from './imap-watcher';
import { processEmail } from './processor';
import { getLLMConfigFromEnv, LLMConfig } from '../llm';

export class EmailAgentService {
  private watcher: IMAPWatcher | null = null;
  private llmConfig: LLMConfig | null = null;
  private isRunning = false;
  private processingQueue: ParsedEmail[] = [];
  private isProcessing = false;

  constructor() {
    // Load config from environment
    this.llmConfig = getLLMConfigFromEnv();
  }

  /**
   * Start the email agent service
   */
  async start(): Promise<boolean> {
    if (this.isRunning) {
      console.log('[EmailAgent] Already running');
      return true;
    }

    // Check LLM config
    if (!this.llmConfig) {
      console.log('[EmailAgent] No LLM configured - skipping email agent');
      return false;
    }

    // Create IMAP watcher
    this.watcher = createIMAPWatcherFromEnv();
    if (!this.watcher) {
      console.log('[EmailAgent] No IMAP configured - skipping email agent');
      return false;
    }

    // Set up email handler
    this.watcher.on('email', (email: ParsedEmail) => {
      this.queueEmail(email);
    });

    this.watcher.on('error', (err: Error) => {
      console.error('[EmailAgent] IMAP error:', err.message);
    });

    // Start watching
    try {
      await this.watcher.start();
      this.isRunning = true;
      console.log('[EmailAgent] Started successfully');
      return true;
    } catch (error) {
      console.error('[EmailAgent] Failed to start:', error);
      return false;
    }
  }

  /**
   * Stop the email agent service
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }
    this.isRunning = false;
    console.log('[EmailAgent] Stopped');
  }

  /**
   * Queue an email for processing
   */
  private queueEmail(email: ParsedEmail): void {
    this.processingQueue.push(email);
    this.processQueue();
  }

  /**
   * Process emails in the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.processingQueue.length > 0) {
      const email = this.processingQueue.shift()!;

      try {
        await processEmail(email, this.llmConfig!);

        // Mark as read after successful processing
        if (this.watcher) {
          await this.watcher.markAsRead(email.uid);
        }
      } catch (error) {
        console.error('[EmailAgent] Processing failed:', error);
        // Don't mark as read - will retry on next check
      }
    }

    this.isProcessing = false;
  }

  /**
   * Get service status
   */
  getStatus(): {
    running: boolean;
    connected: boolean;
    llmProvider: string | null;
    queueLength: number;
  } {
    return {
      running: this.isRunning,
      connected: this.watcher?.connected || false,
      llmProvider: this.llmConfig?.provider || null,
      queueLength: this.processingQueue.length,
    };
  }

  /**
   * Update LLM configuration
   */
  setLLMConfig(config: LLMConfig): void {
    this.llmConfig = config;
    console.log(`[EmailAgent] LLM config updated: ${config.provider}`);
  }
}

// Singleton instance
let emailAgentInstance: EmailAgentService | null = null;

/**
 * Get or create the email agent service instance
 */
export function getEmailAgentService(): EmailAgentService {
  if (!emailAgentInstance) {
    emailAgentInstance = new EmailAgentService();
  }
  return emailAgentInstance;
}

/**
 * Start the email agent (called from server.ts)
 */
export async function startEmailAgent(): Promise<boolean> {
  const service = getEmailAgentService();
  return service.start();
}

/**
 * Stop the email agent
 */
export function stopEmailAgent(): void {
  if (emailAgentInstance) {
    emailAgentInstance.stop();
  }
}

export { IMAPWatcher, ParsedEmail } from './imap-watcher';
export { processEmail } from './processor';
