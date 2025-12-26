/**
 * Email Agent Service
 *
 * Main entry point for the email-triggered AI agent.
 * Watches an IMAP mailbox and processes emails through an LLM.
 */

import { IMAPWatcher, createIMAPWatcherFromEnv, ParsedEmail, IMAPConfig } from './imap-watcher';
import { processEmail } from './processor';
import { getLLMConfigFromEnv, LLMConfig } from '../llm';
import { prisma } from '../prisma';

export class EmailAgentService {
  private watcher: IMAPWatcher | null = null;
  private llmConfig: LLMConfig | null = null;
  private isRunning = false;
  private processingQueue: ParsedEmail[] = [];
  private isProcessing = false;

  constructor() {
    // Config will be loaded from database on start
  }

  /**
   * Load settings from database, fall back to environment variables
   */
  private async loadSettings(): Promise<{ imap: IMAPConfig | null; llm: LLMConfig | null; enabled: boolean }> {
    try {
      const dbSettings = await prisma.emailAgentSettings.findFirst();

      if (dbSettings) {
        console.log('[EmailAgent] Loading settings from database');

        const imap: IMAPConfig = {
          host: dbSettings.imapHost,
          port: dbSettings.imapPort,
          user: dbSettings.imapUser,
          password: dbSettings.imapPassword,
          tls: dbSettings.imapTls,
          mailbox: dbSettings.imapMailbox,
        };

        const llm: LLMConfig = {
          provider: dbSettings.llmProvider as 'vllm' | 'claude' | 'openai' | 'claude-code' | 'claude-code-managed',
          baseUrl: dbSettings.llmBaseUrl || undefined,
          apiKey: dbSettings.llmApiKey || undefined,
          model: dbSettings.llmModel || undefined,
        };

        // Add supervisor config for managed claude-code mode
        if (dbSettings.llmProvider === 'claude-code-managed') {
          llm.supervisorConfig = {
            provider: (dbSettings.supervisorProvider as 'vllm' | 'claude' | 'openai') || 'vllm',
            baseUrl: dbSettings.supervisorBaseUrl || dbSettings.llmBaseUrl || undefined,
            apiKey: dbSettings.supervisorApiKey || undefined,
            model: dbSettings.supervisorModel || undefined,
          };
        }

        return { imap, llm, enabled: dbSettings.isEnabled };
      }
    } catch (error) {
      console.log('[EmailAgent] Database not available, using environment variables');
    }

    // Fall back to environment variables
    console.log('[EmailAgent] Loading settings from environment');

    const envLLM = getLLMConfigFromEnv();
    const envHost = process.env.IMAP_HOST;
    const envUser = process.env.IMAP_USER;
    const envPassword = process.env.IMAP_PASSWORD;

    const imap = envHost && envUser && envPassword
      ? {
          host: envHost,
          port: parseInt(process.env.IMAP_PORT || '143', 10),
          user: envUser,
          password: envPassword,
          tls: process.env.IMAP_TLS === 'true',
          mailbox: process.env.IMAP_MAILBOX || 'INBOX',
        }
      : null;

    return { imap, llm: envLLM, enabled: true };
  }

  /**
   * Start the email agent service
   */
  async start(): Promise<boolean> {
    if (this.isRunning) {
      console.log('[EmailAgent] Already running');
      return true;
    }

    // Load settings from database or environment
    const settings = await this.loadSettings();

    if (!settings.enabled) {
      console.log('[EmailAgent] Disabled in settings');
      return false;
    }

    // Check LLM config
    if (!settings.llm) {
      console.log('[EmailAgent] No LLM configured - skipping email agent');
      return false;
    }
    this.llmConfig = settings.llm;

    // Check IMAP config
    if (!settings.imap) {
      console.log('[EmailAgent] No IMAP configured - skipping email agent');
      return false;
    }

    // Create IMAP watcher with loaded settings
    this.watcher = new IMAPWatcher(settings.imap);

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

export { IMAPWatcher } from './imap-watcher';
export type { ParsedEmail } from './imap-watcher';
export { processEmail } from './processor';
