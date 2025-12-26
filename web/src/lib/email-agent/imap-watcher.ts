/**
 * IMAP Email Watcher
 *
 * Connects to an IMAP mailbox and watches for new emails.
 * When a new email arrives, it triggers the email processing pipeline.
 */

import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { EventEmitter } from 'events';

export interface IMAPConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  mailbox?: string;  // Default: INBOX
}

export interface ParsedEmail {
  uid: number;
  messageId: string | undefined;
  from: string;
  fromAddress: string;
  to: string[];
  subject: string;
  textBody: string;
  htmlBody: string;
  date: Date;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }>;
  inReplyTo?: string;
  references?: string[];
}

export class IMAPWatcher extends EventEmitter {
  private config: IMAPConfig;
  private imap: Imap | null = null;
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private processedUIDs: Set<number> = new Set();

  constructor(config: IMAPConfig) {
    super();
    this.config = {
      mailbox: 'INBOX',
      ...config,
    };
  }

  /**
   * Start watching for new emails
   */
  async start(): Promise<void> {
    if (this.isConnected) {
      console.log('[IMAP] Already connected');
      return;
    }

    await this.connect();
  }

  /**
   * Stop watching and disconnect
   */
  stop(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.imap) {
      this.imap.end();
      this.imap = null;
    }

    this.isConnected = false;
    console.log('[IMAP] Stopped');
  }

  /**
   * Connect to IMAP server
   */
  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.imap = new Imap({
        user: this.config.user,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls,
        autotls: 'always', // Enable STARTTLS for non-TLS connections
        tlsOptions: { rejectUnauthorized: false }, // Allow self-signed/IP certs
      });

      this.imap.once('ready', () => {
        console.log('[IMAP] Connected to', this.config.host);
        this.isConnected = true;
        this.openMailbox().then(resolve).catch(reject);
      });

      this.imap.once('error', (err: Error) => {
        console.error('[IMAP] Connection error:', err.message);
        this.emit('error', err);
        this.scheduleReconnect();
      });

      this.imap.once('end', () => {
        console.log('[IMAP] Connection ended');
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.imap.connect();
    });
  }

  /**
   * Open the mailbox and start watching
   */
  private openMailbox(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.imap) {
        reject(new Error('IMAP not connected'));
        return;
      }

      this.imap.openBox(this.config.mailbox!, false, (err, box) => {
        if (err) {
          console.error('[IMAP] Failed to open mailbox:', err.message);
          reject(err);
          return;
        }

        console.log(`[IMAP] Opened ${this.config.mailbox} (${box.messages.total} messages)`);

        // Fetch any unread messages first
        this.fetchUnreadMessages();

        // Watch for new messages
        this.imap!.on('mail', (numNew: number) => {
          console.log(`[IMAP] ${numNew} new message(s)`);
          this.fetchUnreadMessages();
        });

        resolve();
      });
    });
  }

  /**
   * Fetch all unread (UNSEEN) messages
   */
  private fetchUnreadMessages(): void {
    if (!this.imap) return;

    this.imap.search(['UNSEEN'], (err, uids) => {
      if (err) {
        console.error('[IMAP] Search error:', err.message);
        return;
      }

      if (uids.length === 0) {
        console.log('[IMAP] No unread messages');
        return;
      }

      console.log(`[IMAP] Found ${uids.length} unread message(s)`);

      // Filter out already processed UIDs
      const newUIDs = uids.filter((uid) => !this.processedUIDs.has(uid));
      if (newUIDs.length === 0) return;

      this.fetchMessages(newUIDs);
    });
  }

  /**
   * Fetch specific messages by UID
   */
  private fetchMessages(uids: number[]): void {
    if (!this.imap || uids.length === 0) return;

    const fetch = this.imap.fetch(uids, {
      bodies: '',
      struct: true,
      markSeen: false,  // Don't mark as read until processed
    });

    fetch.on('message', (msg, seqno) => {
      let uid = 0;

      msg.on('attributes', (attrs) => {
        uid = attrs.uid;
      });

      msg.on('body', (stream) => {
        let buffer = '';
        stream.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
        });

        stream.once('end', async () => {
          try {
            const parsed = await simpleParser(buffer);
            const email = this.convertParsedMail(uid, parsed);

            // Mark as processed to avoid re-processing
            this.processedUIDs.add(uid);

            console.log(`[IMAP] New email from ${email.from}: ${email.subject}`);
            this.emit('email', email);
          } catch (parseErr) {
            console.error('[IMAP] Failed to parse email:', parseErr);
          }
        });
      });
    });

    fetch.once('error', (err) => {
      console.error('[IMAP] Fetch error:', err.message);
    });
  }

  /**
   * Convert mailparser output to our format
   */
  private convertParsedMail(uid: number, mail: ParsedMail): ParsedEmail {
    const fromAddr = mail.from?.value?.[0];

    return {
      uid,
      messageId: mail.messageId,
      from: fromAddr?.name || fromAddr?.address || 'unknown',
      fromAddress: fromAddr?.address || 'unknown',
      to: (Array.isArray(mail.to) ? mail.to : mail.to ? [mail.to] : [])
        .flatMap((t) => t.value?.map((a) => a.address || '') || []),
      subject: mail.subject || '(no subject)',
      textBody: mail.text || '',
      htmlBody: mail.html || '',
      date: mail.date || new Date(),
      attachments: (mail.attachments || []).map((att) => ({
        filename: att.filename || 'unnamed',
        contentType: att.contentType,
        size: att.size,
        content: att.content,
      })),
      inReplyTo: mail.inReplyTo,
      references: Array.isArray(mail.references) ? mail.references : mail.references ? [mail.references] : [],
    };
  }

  /**
   * Mark a message as read (SEEN)
   */
  markAsRead(uid: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.imap) {
        reject(new Error('IMAP not connected'));
        return;
      }

      this.imap.addFlags(uid, ['\\Seen'], (err) => {
        if (err) {
          console.error('[IMAP] Failed to mark as read:', err.message);
          reject(err);
        } else {
          console.log(`[IMAP] Marked UID ${uid} as read`);
          resolve();
        }
      });
    });
  }

  /**
   * Move a message to a folder
   */
  moveToFolder(uid: number, folder: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.imap) {
        reject(new Error('IMAP not connected'));
        return;
      }

      this.imap.move(uid, folder, (err) => {
        if (err) {
          console.error(`[IMAP] Failed to move to ${folder}:`, err.message);
          reject(err);
        } else {
          console.log(`[IMAP] Moved UID ${uid} to ${folder}`);
          resolve();
        }
      });
    });
  }

  /**
   * Schedule reconnection after disconnect
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    console.log('[IMAP] Reconnecting in 30 seconds...');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        console.error('[IMAP] Reconnect failed:', err.message);
      });
    }, 30000);
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

/**
 * Create IMAP watcher from environment variables
 */
export function createIMAPWatcherFromEnv(): IMAPWatcher | null {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const password = process.env.IMAP_PASSWORD;

  if (!host || !user || !password) {
    console.log('[IMAP] Missing IMAP configuration in environment');
    return null;
  }

  return new IMAPWatcher({
    host,
    port: parseInt(process.env.IMAP_PORT || '143', 10),
    user,
    password,
    tls: process.env.IMAP_TLS === 'true',
    mailbox: process.env.IMAP_MAILBOX || 'INBOX',
  });
}
