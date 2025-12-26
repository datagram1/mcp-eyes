/**
 * Email Processor
 *
 * Processes incoming emails through the LLM and executes resulting actions.
 */

import { prisma } from '../prisma';
import { createLLMProvider, LLMConfig, LLMMessage } from '../llm';
import { ParsedEmail } from './imap-watcher';
import { agentRegistry } from '../control-server/agent-registry';
import { sendReplyEmail, ReplySmtpConfig } from './reply-mailer';

// Default system prompt for email processing
const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant that helps manage ScreenControl agents - remote machines that can be controlled via commands.

When you receive an email, analyze it and determine what actions to take. You have access to the following capabilities:

1. **Agent Management**: List agents, check their status, connect to specific agents
2. **System Control**: Take screenshots, click, type, run commands on agents
3. **Diagnostics**: Check system logs, investigate issues, gather information

For each email, respond with a JSON object containing:
{
  "understanding": "Brief summary of what the email is asking",
  "actions": [
    {
      "type": "screenshot" | "execute_command" | "get_agent_info" | "investigate" | "reply_only",
      "agentId": "optional - specific agent to target",
      "agentName": "optional - agent name/pattern to find",
      "command": "optional - command to run",
      "description": "what this action will do"
    }
  ],
  "response": "Draft response to send back to the sender",
  "priority": "low" | "normal" | "high" | "urgent"
}

If the email is not actionable (spam, unrelated, etc.), set actions to empty and explain in the response.

Available agents will be provided in the context.`;

export interface ProcessedAction {
  type: string;
  agentId?: string;
  agentName?: string;
  command?: string;
  description: string;
  result?: string;
  success?: boolean;
}

export interface LLMAnalysis {
  understanding: string;
  actions: ProcessedAction[];
  response: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

export interface EmailAgentConfig {
  allowedSenders: string[];
  autoReply: boolean;
  replySmtp: ReplySmtpConfig | null;
}

/**
 * Check if the sender is authorized to trigger the email agent
 */
function isAuthorizedSender(fromAddress: string, allowedSenders: string[]): boolean {
  // If no allowed senders configured, reject all (fail-safe)
  if (!allowedSenders || allowedSenders.length === 0) {
    console.log(`[EmailProcessor] No allowed senders configured - rejecting ${fromAddress}`);
    return false;
  }

  // Normalize the from address
  const normalizedFrom = fromAddress.toLowerCase().trim();

  // Check if the sender is in the allowed list
  const isAllowed = allowedSenders.some((allowed) => {
    const normalizedAllowed = allowed.toLowerCase().trim();
    // Support wildcard domain matching (e.g., *@example.com)
    if (normalizedAllowed.startsWith('*@')) {
      const domain = normalizedAllowed.substring(2);
      return normalizedFrom.endsWith(`@${domain}`);
    }
    return normalizedFrom === normalizedAllowed;
  });

  if (!isAllowed) {
    console.log(`[EmailProcessor] Unauthorized sender: ${fromAddress} (allowed: ${allowedSenders.join(', ')})`);
  }

  return isAllowed;
}

/**
 * Load email agent configuration from database
 */
async function loadEmailAgentConfig(): Promise<EmailAgentConfig> {
  const settings = await prisma.emailAgentSettings.findFirst();

  if (!settings) {
    return {
      allowedSenders: [],
      autoReply: true,
      replySmtp: null,
    };
  }

  const replySmtp: ReplySmtpConfig | null = settings.replySmtpHost
    ? {
        host: settings.replySmtpHost,
        port: settings.replySmtpPort,
        user: settings.replySmtpUser,
        password: settings.replySmtpPass,
        tls: settings.replySmtpTls,
        fromEmail: settings.replyFromEmail,
        fromName: settings.replyFromName,
      }
    : null;

  return {
    allowedSenders: settings.allowedSenders,
    autoReply: settings.autoReply,
    replySmtp,
  };
}

/**
 * Process an incoming email
 */
export async function processEmail(email: ParsedEmail, llmConfig: LLMConfig): Promise<string> {
  console.log(`[EmailProcessor] Processing email from ${email.fromAddress}: ${email.subject}`);

  // Load configuration including allowed senders and reply SMTP
  const config = await loadEmailAgentConfig();

  // Check if sender is authorized BEFORE creating task record
  if (!isAuthorizedSender(email.fromAddress, config.allowedSenders)) {
    console.log(`[EmailProcessor] Skipping unauthorized email from ${email.fromAddress}`);

    // Still create a task record for audit purposes, but mark as SKIPPED
    await prisma.emailTask.create({
      data: {
        emailUid: email.uid,
        messageId: email.messageId,
        fromAddress: email.fromAddress,
        fromName: email.from,
        toAddresses: email.to,
        subject: email.subject,
        body: email.textBody || email.htmlBody.replace(/<[^>]*>/g, ''),
        receivedAt: email.date,
        status: 'SKIPPED',
        errorMessage: `Unauthorized sender: ${email.fromAddress}`,
        completedAt: new Date(),
      },
    });

    return 'SKIPPED';
  }

  // Create task record for authorized sender
  const task = await prisma.emailTask.create({
    data: {
      emailUid: email.uid,
      messageId: email.messageId,
      fromAddress: email.fromAddress,
      fromName: email.from,
      toAddresses: email.to,
      subject: email.subject,
      body: email.textBody || email.htmlBody.replace(/<[^>]*>/g, ''),
      receivedAt: email.date,
      status: 'ANALYZING',
    },
  });

  try {
    // Get available agents for context
    const agentContext = await getAgentContext();

    // Build messages for LLM
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: DEFAULT_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: buildEmailPrompt(email, agentContext),
      },
    ];

    // Call LLM
    const provider = createLLMProvider(llmConfig);
    console.log(`[EmailProcessor] Calling ${provider.name}...`);

    const response = await provider.chat(messages);

    // Parse LLM response
    const analysis = parseAnalysis(response.content);

    // Update task with analysis
    await prisma.emailTask.update({
      where: { id: task.id },
      data: {
        status: 'READY',
        llmProvider: llmConfig.provider,
        llmModel: response.model,
        llmAnalysis: analysis.understanding,
        llmActions: analysis.actions as unknown as object,
        processedAt: new Date(),
      },
    });

    // Execute actions
    const executionLog = await executeActions(analysis.actions);

    // Build final response
    const finalResponse = buildFinalResponse(analysis, executionLog);

    // Send reply email using dedicated reply SMTP server
    let responseSent = false;
    if (config.autoReply && email.fromAddress && !email.fromAddress.includes('noreply')) {
      if (config.replySmtp) {
        const replyResult = await sendReplyEmail(config.replySmtp, {
          to: email.fromAddress,
          subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
          body: finalResponse,
          inReplyTo: email.messageId,
          references: email.messageId,
        });
        responseSent = replyResult.success;
        if (!replyResult.success) {
          console.error(`[EmailProcessor] Failed to send reply: ${replyResult.error}`);
        }
      } else {
        console.warn('[EmailProcessor] Reply SMTP not configured - skipping reply');
      }
    }

    // Mark task as completed
    await prisma.emailTask.update({
      where: { id: task.id },
      data: {
        status: 'COMPLETED',
        executionLog: executionLog.map((e) => `${e.description}: ${e.result}`).join('\n'),
        responseSent,
        responseBody: finalResponse,
        executedAt: new Date(),
        completedAt: new Date(),
      },
    });

    console.log(`[EmailProcessor] Completed task ${task.id}`);
    return task.id;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[EmailProcessor] Failed:`, errorMessage);

    await prisma.emailTask.update({
      where: { id: task.id },
      data: {
        status: 'FAILED',
        errorMessage,
      },
    });

    throw error;
  }
}

/**
 * Get context about available agents
 */
async function getAgentContext(): Promise<string> {
  // Get agents from registry (connected agents)
  const connectedAgents = agentRegistry.getAllAgents();

  // Also get agents from database
  const dbAgents = await prisma.agent.findMany({
    where: { state: 'ACTIVE' },
    select: {
      id: true,
      hostname: true,
      displayName: true,
      osType: true,
      status: true,
      ipAddress: true,
      lastSeenAt: true,
    },
  });

  if (connectedAgents.length === 0 && dbAgents.length === 0) {
    return 'No agents currently available.';
  }

  let context = 'Available agents:\n';

  // Add connected agents
  for (const agent of connectedAgents) {
    const dbInfo = dbAgents.find((a) => a.id === agent.agentId);
    context += `- ID: ${agent.agentId}\n`;
    context += `  Name: ${dbInfo?.displayName || dbInfo?.hostname || 'Unknown'}\n`;
    context += `  OS: ${dbInfo?.osType || 'Unknown'}\n`;
    context += `  Status: ONLINE (connected)\n`;
    context += `  IP: ${agent.ipAddress || dbInfo?.ipAddress || 'Unknown'}\n\n`;
  }

  // Add offline agents from DB
  for (const agent of dbAgents) {
    if (!connectedAgents.find((a) => a.agentId === agent.id)) {
      context += `- ID: ${agent.id}\n`;
      context += `  Name: ${agent.displayName || agent.hostname || 'Unknown'}\n`;
      context += `  OS: ${agent.osType}\n`;
      context += `  Status: OFFLINE (last seen: ${agent.lastSeenAt?.toISOString() || 'never'})\n`;
      context += `  IP: ${agent.ipAddress || 'Unknown'}\n\n`;
    }
  }

  return context;
}

/**
 * Build the prompt for the LLM
 */
function buildEmailPrompt(email: ParsedEmail, agentContext: string): string {
  let prompt = `New email received:\n\n`;
  prompt += `From: ${email.from} <${email.fromAddress}>\n`;
  prompt += `To: ${email.to.join(', ')}\n`;
  prompt += `Subject: ${email.subject}\n`;
  prompt += `Date: ${email.date.toISOString()}\n`;
  prompt += `\n---\n\n`;
  prompt += email.textBody || email.htmlBody.replace(/<[^>]*>/g, '');
  prompt += `\n\n---\n\n`;
  prompt += `Context:\n${agentContext}`;

  if (email.attachments.length > 0) {
    prompt += `\n\nAttachments:\n`;
    for (const att of email.attachments) {
      prompt += `- ${att.filename} (${att.contentType}, ${att.size} bytes)\n`;
    }
  }

  return prompt;
}

/**
 * Parse the LLM response into structured actions
 */
function parseAnalysis(content: string): LLMAnalysis {
  // Try to extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        understanding: parsed.understanding || 'No analysis provided',
        actions: parsed.actions || [],
        response: parsed.response || 'No response generated',
        priority: parsed.priority || 'normal',
      };
    } catch {
      console.warn('[EmailProcessor] Failed to parse LLM JSON response');
    }
  }

  // Fallback: treat entire response as understanding
  return {
    understanding: content,
    actions: [],
    response: content,
    priority: 'normal',
  };
}

/**
 * Execute the planned actions
 */
async function executeActions(actions: ProcessedAction[]): Promise<ProcessedAction[]> {
  const results: ProcessedAction[] = [];

  for (const action of actions) {
    console.log(`[EmailProcessor] Executing: ${action.description}`);

    try {
      switch (action.type) {
        case 'get_agent_info': {
          const agents = agentRegistry.getAllAgents();
          action.result = `Found ${agents.length} connected agent(s)`;
          action.success = true;
          break;
        }

        case 'screenshot': {
          if (action.agentId) {
            const agent = agentRegistry.getAgent(action.agentId);
            if (agent) {
              // Send screenshot command to agent
              const response = await agentRegistry.sendCommand(action.agentId, {
                method: 'screenshot',
                params: {},
              });
              action.result = response ? 'Screenshot captured' : 'Failed to capture screenshot';
              action.success = !!response;
            } else {
              action.result = 'Agent not connected';
              action.success = false;
            }
          } else {
            action.result = 'No agent specified';
            action.success = false;
          }
          break;
        }

        case 'execute_command': {
          if (action.agentId && action.command) {
            const response = await agentRegistry.sendCommand(action.agentId, {
              method: 'shell_exec',
              params: { command: action.command },
            });
            action.result = response?.result?.stdout || 'Command executed';
            action.success = true;
          } else {
            action.result = 'Missing agent or command';
            action.success = false;
          }
          break;
        }

        case 'investigate': {
          action.result = 'Investigation noted - requires further analysis';
          action.success = true;
          break;
        }

        case 'reply_only':
        default: {
          action.result = 'No action needed';
          action.success = true;
          break;
        }
      }
    } catch (error) {
      action.result = `Error: ${error instanceof Error ? error.message : 'Unknown'}`;
      action.success = false;
    }

    results.push(action);
  }

  return results;
}

/**
 * Build the final response combining analysis and execution results
 */
function buildFinalResponse(analysis: LLMAnalysis, executionLog: ProcessedAction[]): string {
  let response = analysis.response;

  if (executionLog.length > 0) {
    response += '\n\n---\nActions taken:\n';
    for (const action of executionLog) {
      const status = action.success ? '✓' : '✗';
      response += `${status} ${action.description}: ${action.result}\n`;
    }
  }

  response += '\n\n---\nThis is an automated response from ScreenControl AI.';

  return response;
}

