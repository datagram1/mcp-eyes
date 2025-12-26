/**
 * Managed Claude Code Provider
 *
 * Runs Claude Code with a supervisor LLM that handles questions automatically.
 * This creates a "tag team" where the local LLM (vLLM) manages Claude Code's execution,
 * answering any questions or clarifications without human intervention.
 */

import { spawn, ChildProcess } from 'child_process';
import { LLMConfig, LLMMessage, LLMProvider, LLMResponse } from '../types';
import { VLLMProvider } from './vllm';

// Patterns that indicate Claude Code is asking a question
const QUESTION_PATTERNS = [
  /\?\s*$/m,                          // Ends with question mark
  /choose|select|pick|which one/i,    // Choice prompts
  /would you like|do you want/i,      // Preference questions
  /should I|shall I/i,                // Confirmation requests
  /option \d|choice \d/i,             // Numbered options
  /\[y\/n\]|\[yes\/no\]/i,            // Yes/no prompts
  /please (confirm|specify|clarify)/i, // Clarification requests
  /waiting for (input|response)/i,    // Explicit wait
];

// Patterns that indicate task completion
const COMPLETION_PATTERNS = [
  /task completed/i,
  /done\s*$/i,
  /finished/i,
  /successfully/i,
];

export interface ManagedClaudeCodeConfig extends LLMConfig {
  supervisorConfig: LLMConfig;  // Config for the supervisor LLM (vLLM)
}

export class ManagedClaudeCodeProvider implements LLMProvider {
  name = 'Managed Claude Code';
  private config: ManagedClaudeCodeConfig;
  private supervisor: VLLMProvider;
  private apiKey: string;
  private conversationLog: string[] = [];
  private originalTask: string = '';

  constructor(config: ManagedClaudeCodeConfig) {
    this.config = config;
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.supervisor = new VLLMProvider(config.supervisorConfig);
  }

  isConfigured(): boolean {
    return this.supervisor.isConfigured();
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const systemMessage = messages.find((m) => m.role === 'system');
    const userMessage = messages.find((m) => m.role === 'user');

    if (!userMessage) {
      throw new Error('No user message provided');
    }

    // Build the prompt with system context
    let fullPrompt = userMessage.content;
    if (systemMessage) {
      fullPrompt = `${systemMessage.content}\n\n---\n\n${fullPrompt}`;
    }

    this.originalTask = fullPrompt;
    this.conversationLog = [];

    const model = this.config.model || 'claude-sonnet-4-5-20250514';

    try {
      const result = await this.runManagedClaudeCode(fullPrompt, model);
      return {
        content: result,
        model: `${model} (managed by ${this.config.supervisorConfig.model || 'vLLM'})`,
        finishReason: 'stop',
      };
    } catch (error) {
      throw new Error(`Managed Claude Code error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async runManagedClaudeCode(prompt: string, model: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
      console.log(`[ManagedClaudeCode] Starting managed session with model: ${model}`);
      console.log(`[ManagedClaudeCode] Supervisor: ${this.config.supervisorConfig.provider}`);

      // Add instruction to Claude Code to be more autonomous
      const enhancedPrompt = `${prompt}

IMPORTANT: Complete this task autonomously. Make reasonable decisions without asking for clarification. If you must choose between options, pick the most sensible one and proceed. Only output results, not questions.`;

      const args = [
        '--print',
        '--model', model,
        '--max-turns', '20',
        '--dangerously-skip-permissions',
        enhancedPrompt
      ];

      const env = { ...process.env };
      if (this.apiKey) {
        env.ANTHROPIC_API_KEY = this.apiKey;
      }

      const proc = spawn('npx', ['@anthropic-ai/claude-code', ...args], {
        env,
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let lastOutputTime = Date.now();
      let checkInterval: NodeJS.Timeout;

      // Monitor for questions and stalls
      const startMonitoring = () => {
        checkInterval = setInterval(async () => {
          const timeSinceOutput = Date.now() - lastOutputTime;

          // If no output for 10 seconds and there's pending output, check for questions
          if (timeSinceOutput > 10000 && stdout.length > 0) {
            const recentOutput = stdout.slice(-500); // Last 500 chars

            if (this.looksLikeQuestion(recentOutput)) {
              console.log(`[ManagedClaudeCode] Detected question, consulting supervisor...`);
              this.conversationLog.push(`Claude Code: ${recentOutput}`);

              try {
                const response = await this.getSupervisorResponse(recentOutput);
                console.log(`[ManagedClaudeCode] Supervisor response: ${response.substring(0, 100)}...`);
                this.conversationLog.push(`Supervisor: ${response}`);

                // Send response to Claude Code
                if (proc.stdin.writable) {
                  proc.stdin.write(response + '\n');
                  lastOutputTime = Date.now();
                }
              } catch (err) {
                console.error(`[ManagedClaudeCode] Supervisor error:`, err);
              }
            }
          }
        }, 5000);
      };

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        lastOutputTime = Date.now();
        console.log(`[ManagedClaudeCode] Output: ${chunk.substring(0, 200)}`);
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        clearInterval(checkInterval);
        reject(new Error(`Failed to start Claude Code: ${error.message}`));
      });

      proc.on('close', (code) => {
        clearInterval(checkInterval);

        if (code === 0) {
          // Append conversation log to result
          let result = stdout.trim() || 'Task completed';
          if (this.conversationLog.length > 0) {
            result += '\n\n---\nSupervisor Interventions:\n' + this.conversationLog.join('\n');
          }
          resolve(result);
        } else {
          if (stderr.includes('not logged in') || stderr.includes('login')) {
            reject(new Error('Claude Code not logged in. Run "claude /login" to authenticate.'));
          } else {
            reject(new Error(`Claude Code exited with code ${code}: ${stderr || stdout}`));
          }
        }
      });

      startMonitoring();

      // Timeout after 10 minutes for managed mode (longer than regular)
      setTimeout(() => {
        clearInterval(checkInterval);
        proc.kill();
        reject(new Error('Managed Claude Code timed out after 10 minutes'));
      }, 10 * 60 * 1000);
    });
  }

  private looksLikeQuestion(text: string): boolean {
    return QUESTION_PATTERNS.some(pattern => pattern.test(text));
  }

  private async getSupervisorResponse(question: string): Promise<string> {
    const supervisorPrompt = `You are a supervisor LLM helping to manage an autonomous Claude Code agent.
The agent was given this original task:

---
${this.originalTask}
---

The agent is now asking a question or needs clarification:

---
${question}
---

Previous conversation:
${this.conversationLog.slice(-6).join('\n')}

Your job is to provide a clear, decisive answer that helps the agent continue without further questions.
- Make reasonable decisions on behalf of the user
- Choose the most sensible option when given choices
- Keep the task moving forward
- Be concise and direct

Respond with ONLY the answer/decision, no explanation needed:`;

    try {
      const response = await this.supervisor.chat([
        { role: 'system', content: 'You are a supervisor providing quick, decisive answers to help an AI agent complete tasks.' },
        { role: 'user', content: supervisorPrompt }
      ]);
      return response.content.trim();
    } catch (error) {
      console.error('[ManagedClaudeCode] Supervisor LLM error:', error);
      // Fallback to a generic "continue" response
      return 'Yes, proceed with the recommended approach.';
    }
  }
}

/**
 * Create a managed Claude Code provider with vLLM supervisor
 */
export function createManagedClaudeCodeProvider(
  claudeCodeConfig: LLMConfig,
  supervisorConfig: LLMConfig
): ManagedClaudeCodeProvider {
  return new ManagedClaudeCodeProvider({
    ...claudeCodeConfig,
    supervisorConfig,
  } as ManagedClaudeCodeConfig);
}
