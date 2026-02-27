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

    private _extractAndAccumulate(llmOutput: Record<string, any> | undefined) {
      if (!llmOutput) return;
      // Check all known token usage locations:
      // - OpenAI style: llmOutput.tokenUsage / llmOutput.estimatedTokenUsage
      // - Gemini style: llmOutput.usage_metadata (set by @langchain/google-genai)
      const usage =
        llmOutput.tokenUsage ||
        llmOutput.estimatedTokenUsage ||
        llmOutput.usage_metadata;
      if (!usage) return;

      // Handle all field name variants across providers:
      // OpenAI: promptTokens / completionTokens / totalTokens
      // Gemini (snake): input_tokens / output_tokens / total_tokens
      // Gemini (camel): inputTokens / outputTokens / totalTokens
      // Gemini (raw API): promptTokenCount / candidatesTokenCount / totalTokenCount
      usageRef.prompt +=
        usage.promptTokens ??
        usage.prompt_tokens ??
        usage.inputTokens ??
        usage.input_tokens ??
        usage.promptTokenCount ??
        0;
      usageRef.completion +=
        usage.completionTokens ??
        usage.completion_tokens ??
        usage.outputTokens ??
        usage.output_tokens ??
        usage.candidatesTokenCount ??
        0;
      usageRef.total +=
        usage.totalTokens ??
        usage.total_tokens ??
        usage.totalTokenCount ??
        0;
    }

    // Called for BaseLLM subclasses
    async handleLLMEnd(output: LLMResult) {
      this._extractAndAccumulate(output.llmOutput);
    }

    // Called for BaseChatModel subclasses (ChatGoogleGenerativeAI).
    // LangChain falls back to handleLLMEnd when this is absent, but defining
    // it explicitly avoids relying on that fallback behavior.
    async handleChatModelEnd(output: LLMResult) {
      this._extractAndAccumulate(output.llmOutput);
    }
  };
}

// Pricing Constants (per 1M tokens)
const PRICING = {
  GEMINI_3_1_PRO: {
    PROMPT_LIMIT: 200_000,
    SHORT_PROMPT: {
      INPUT: 2.0, // $2.00 per 1M
      OUTPUT: 12.0, // $12.00 per 1M
    },
    LONG_PROMPT: {
      INPUT: 4.0, // $4.00 per 1M
      OUTPUT: 18.0, // $18.00 per 1M
    },
  },
  GEMINI_3_FLASH: {
    INPUT: 0.5, // $0.50 per 1M
    OUTPUT: 3.0, // $3.00 per 1M
  },
};

// Override specifically for the confusion:
// Initial Prompt said "$2.00 per 1M input / $12.00 per 1M output tokens (for prompts <= 200k)"
// Then later "$4 per 1M input tokens / $18.00 per 1M output tokens (for tokens > 200k)"
// I will use 2/12 and 4/18.

const NODE_MODEL_MAPPING: Record<string, "GEMINI_3_1_PRO" | "GEMINI_3_FLASH"> =
  {
    // Pro Nodes
    frontendEngineerNode: "GEMINI_3_1_PRO",
    emNode: "GEMINI_3_1_PRO",
    designNode: "GEMINI_3_1_PRO",
    architectureNode: "GEMINI_3_1_PRO",
    validationNode: "GEMINI_3_1_PRO",

    // Flash Nodes
    pmNode: "GEMINI_3_FLASH",
    triageNode: "GEMINI_3_FLASH",
    updateJiraMetadataNode: "GEMINI_3_FLASH",
    updateJiraStatusNode: "GEMINI_3_FLASH",
    createPrNode: "GEMINI_3_FLASH",
  };

export function calculateLLMCost(
  nodeName: string,
  inputTokens: number,
  outputTokens: number,
): number {
  // Default to Flash if unknown node, or if we want to be safe
  // Check if node is explicitly mapped, otherwise check if it contains mapped keywords?
  // For now, strict mapping based on known nodes.
  let modelType = NODE_MODEL_MAPPING[nodeName];

  // If nodeName is suffixed (e.g. validationNode_attempt_1), strip suffix to find base node
  if (!modelType) {
    const baseNodeName = Object.keys(NODE_MODEL_MAPPING).find((key) =>
      nodeName.startsWith(key),
    );
    if (baseNodeName) {
      modelType = NODE_MODEL_MAPPING[baseNodeName];
    } else {
      modelType = "GEMINI_3_FLASH"; // Fallback
    }
  }

  let cost = 0;

  if (modelType === "GEMINI_3_1_PRO") {
    const { PROMPT_LIMIT, SHORT_PROMPT, LONG_PROMPT } = PRICING.GEMINI_3_1_PRO;

    if (inputTokens <= PROMPT_LIMIT) {
      cost += (inputTokens / 1_000_000) * SHORT_PROMPT.INPUT;
      cost += (outputTokens / 1_000_000) * SHORT_PROMPT.OUTPUT; // Using $12.00
    } else {
      cost += (inputTokens / 1_000_000) * LONG_PROMPT.INPUT;
      cost += (outputTokens / 1_000_000) * LONG_PROMPT.OUTPUT;
    }
  } else {
    // Flash Pricing (Flat)
    const { INPUT, OUTPUT } = PRICING.GEMINI_3_FLASH;
    cost += (inputTokens / 1_000_000) * INPUT;
    cost += (outputTokens / 1_000_000) * OUTPUT;
  }

  return cost;
}
