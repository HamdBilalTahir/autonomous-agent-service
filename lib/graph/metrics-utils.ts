import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { LLMResult } from "@langchain/core/outputs";

export function extractTokenUsage(response: any): {
  prompt: number;
  completion: number;
  total: number;
} {
  const usage =
    response?.usage_metadata || response?.response_metadata?.tokenUsage;

  if (usage) {
    return {
      prompt: usage.input_tokens || usage.promptTokens || 0,
      completion: usage.output_tokens || usage.completionTokens || 0,
      total: usage.total_tokens || usage.totalTokens || 0,
    };
  }

  return { prompt: 0, completion: 0, total: 0 };
}

export function createTokenUsageCallback(usageRef: {
  prompt: number;
  completion: number;
  total: number;
}) {
  return class TokenUsageHandler extends BaseCallbackHandler {
    name = "TokenUsageHandler";
    async handleLLMEnd(output: LLMResult) {
      const usage =
        output.llmOutput?.tokenUsage || output.llmOutput?.estimatedTokenUsage;
      if (usage) {
        usageRef.prompt += usage.promptTokens || usage.prompt_tokens || 0;
        usageRef.completion +=
          usage.completionTokens || usage.completion_tokens || 0;
        usageRef.total += usage.totalTokens || usage.total_tokens || 0;
      }
    }
  };
}
