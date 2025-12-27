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
  private lastError: string | null = null;
  private stoppedByUser = false;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

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
          console.log('[EmailAgent] Setting up supervisorConfig:', {
            provider: dbSettings.supervisorProvider,
            baseUrl: dbSettings.supervisorBaseUrl,
            model: dbSettings.supervisorModel,
          });
          llm.supervisorConfig = {
            provider: (dbSettings.supervisorProvider as 'vllm' | 'claude' | 'openai') || 'vllm',
            baseUrl: dbSettings.supervisorBaseUrl || dbSettings.llmBaseUrl || undefined,
            apiKey: dbSettings.supervisorApiKey || undefined,
            model: dbSettings.supervisorModel || undefined,
          };
          console.log('[EmailAgent] supervisorConfig created:', JSON.stringify(llm.supervisorConfig));
        } else {
          console.log('[EmailAgent] Provider is not claude-code-managed:', dbSettings.llmProvider);
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
   * Clean up orphaned tasks that are stuck in ANALYZING/EXECUTING status
   * These can occur when the service restarts mid-processing
   *
   * For ANALYZING tasks: Only cleanup if processedAt is set (shouldn't happen) and old
   * For EXECUTING tasks: Cleanup if processedAt is old (they've been executing too long)
   */
  async cleanupOrphanedTasks(): Promise<number> {
    const ORPHAN_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes
    const cutoffTime = new Date(Date.now() - ORPHAN_THRESHOLD_MS);

    try {
      // Only clean up EXECUTING tasks that have been stuck for too long
      // ANALYZING tasks with null processedAt are actively processing and should not be cleaned up
      const result = await prisma.emailTask.updateMany({
        where: {
          OR: [
            // EXECUTING tasks stuck for too long (based on when processing started)
            {
              status: 'EXECUTING',
              processedAt: { lt: cutoffTime },
            },
            // ANALYZING tasks that somehow have processedAt set (shouldn't happen, but cleanup just in case)
            {
              status: 'ANALYZING',
              processedAt: { not: null, lt: cutoffTime },
            },
          ],
        },
        data: {
          status: 'FAILED',
          errorMessage: 'Task orphaned - stuck in processing for over 60 minutes',
          completedAt: new Date(),
        },
      });

      if (result.count > 0) {
        console.log(`[EmailAgent] Cleaned up ${result.count} orphaned task(s)`);
      }

      return result.count;
    } catch (error) {
      console.error('[EmailAgent] Failed to cleanup orphaned tasks:', error);
      return 0;
    }
  }

  /**
   * Start the email agent service
   * Auto-starts if LLM and IMAP are configured, unless stopped by user or there's an error
   */
  async start(userInitiated = false): Promise<boolean> {
    if (this.isRunning) {
      console.log('[EmailAgent] Already running');
      return true;
    }

    // Clean up any orphaned tasks from previous runs
    await this.cleanupOrphanedTasks();

    // Clear stopped-by-user flag if user initiated start
    if (userInitiated) {
      this.stoppedByUser = false;
      this.lastError = null;
    }

    // Don't auto-start if user explicitly stopped it (unless they clicked Start)
    if (this.stoppedByUser && !userInitiated) {
      console.log('[EmailAgent] Stopped by user, waiting for manual start');
      return false;
    }

    // Load settings from database or environment
    const settings = await this.loadSettings();

    // Check LLM config
    if (!settings.llm) {
      this.lastError = 'No LLM configured';
      console.log('[EmailAgent] No LLM configured - skipping email agent');
      return false;
    }
    this.llmConfig = settings.llm;

    // Check IMAP config
    if (!settings.imap) {
      this.lastError = 'No IMAP configured';
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
      this.lastError = `IMAP error: ${err.message}`;
    });

    // Start watching
    try {
      await this.watcher.start();
      this.isRunning = true;
      this.lastError = null;

      // Start periodic cleanup (every 2 minutes)
      this.cleanupInterval = setInterval(() => {
        this.cleanupOrphanedTasks();
      }, 2 * 60 * 1000);

      console.log('[EmailAgent] Started successfully');

      // Process any pending tasks that were left unprocessed
      // Wait 10 seconds for agents to reconnect before processing
      setTimeout(() => {
        console.log('[EmailAgent] Processing pending tasks (after agent reconnect delay)...');
        this.processPendingTasks();
      }, 10000);

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.lastError = `Failed to start: ${errorMsg}`;
      console.error('[EmailAgent] Failed to start:', error);
      return false;
    }
  }

  /**
   * Stop the email agent service
   * @param userInitiated - If true, won't auto-restart until user clicks Start
   */
  stop(userInitiated = false): void {
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isRunning = false;
    if (userInitiated) {
      this.stoppedByUser = true;
      console.log('[EmailAgent] Stopped by user');
    } else {
      console.log('[EmailAgent] Stopped');
    }
  }

  /**
   * Process pending tasks left from previous runs
   */
  private async processPendingTasks(): Promise<void> {
    try {
      const pendingTasks = await prisma.emailTask.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: 10, // Limit to avoid overload
      });

      if (pendingTasks.length === 0) {
        return;
      }

      console.log(`[EmailAgent] Found ${pendingTasks.length} pending task(s) to process`);

      for (const task of pendingTasks) {
        try {
          // Reconstruct the parsed email format
          const parsedEmail: ParsedEmail = {
            uid: task.emailUid,
            messageId: task.messageId || undefined,
            from: task.fromName || task.fromAddress,
            fromAddress: task.fromAddress,
            to: task.toAddresses,
            subject: task.subject,
            textBody: task.body,
            htmlBody: '',
            date: task.receivedAt,
            attachments: [],
            inReplyTo: undefined,
            references: [],
          };

          console.log(`[EmailAgent] Processing pending task: ${task.subject}`);
          await processEmail(parsedEmail, this.llmConfig!, task.id);
        } catch (error) {
          console.error(`[EmailAgent] Failed to process pending task ${task.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[EmailAgent] Failed to query pending tasks:', error);
    }
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
    error: string | null;
    stoppedByUser: boolean;
  } {
    return {
      running: this.isRunning,
      connected: this.watcher?.connected || false,
      llmProvider: this.llmConfig?.provider || null,
      queueLength: this.processingQueue.length,
      error: this.lastError,
      stoppedByUser: this.stoppedByUser,
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
