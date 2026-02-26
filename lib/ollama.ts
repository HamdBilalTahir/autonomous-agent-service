import { AgentPrompts, AnalysisResponse } from "./prompts";
import { Ticket } from "./types";

export class OllamaService {
  private baseUrl: string;
  private model: string;
  private isHf: boolean;
  private apiKey?: string;

  constructor(
    baseUrl: string,
    model: string = "codegemma:2b",
    apiKey?: string,
  ) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.isHf = baseUrl.includes("huggingface.co");
    this.apiKey = apiKey;
  }

  async checkHealth(): Promise<boolean> {
    try {
      if (this.isHf) {
        // Simple request to check if token works
        const response = await fetch(`${this.baseUrl}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ inputs: "hello" }),
        });
        return response.ok;
      } else {
        // Ollama tags endpoint
        const response = await fetch(`${this.baseUrl}/api/tags`);
        return response.ok;
      }
    } catch (e) {
      console.error("AI Service health check failed:", e);
      return false;
    }
  }

  async generateResponse(prompt: string, context?: string): Promise<string> {
    const fullPrompt = context
      ? `Context: ${context}\n\nTask: ${prompt}`
      : prompt;

    if (this.isHf) {
      return this.generateHfResponse(fullPrompt);
    } else {
      return this.generateOllamaResponse(fullPrompt);
    }
  }

  private async generateOllamaResponse(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt: prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  private async generateHfResponse(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 1024,
          return_full_text: false,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Hugging Face API error: ${response.statusText}`);
    }

    const data = await response.json();
    // HF Inference API usually returns an array of objects
    if (Array.isArray(data) && data.length > 0 && data[0].generated_text) {
      return data[0].generated_text;
    }
    return JSON.stringify(data);
  }

  async analyzeTicket(
    title: string,
    description: string,
    codebaseContext?: any,
  ): Promise<AnalysisResponse> {
    const prompt = AgentPrompts.getAnalysisPrompt(
      title,
      description,
      codebaseContext,
    );

    const response = await this.generateResponse(prompt);
    console.log("Raw AI Analysis Response:", response);

    try {
      // Extract JSON content between curly braces
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      let jsonStr = jsonMatch ? jsonMatch[0] : response;

      // Clean up common AI mistakes
      jsonStr = jsonStr
        // Remove trailing commas before closing braces/brackets
        .replace(/,(\s*[}\]])/g, "$1")
        // Quote unquoted property names
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');

      const parsed = JSON.parse(jsonStr);

      // Ensure response matches interface structure
      return {
        summary: parsed.summary || `Analysis of ${title}`,
        suggestedAction: parsed.suggestedAction || "Review code changes",
        complexity: parsed.complexity || "Medium",
        filesToChange: Array.isArray(parsed.filesToChange)
          ? parsed.filesToChange
          : [],
        newFilesToCreate: Array.isArray(parsed.newFilesToCreate)
          ? parsed.newFilesToCreate
          : [],
        estimatedLines: parsed.estimatedLines,
        dependencies: parsed.dependencies,
        testFiles: parsed.testFiles,
      };
    } catch (e) {
      console.error("Failed to parse Ollama response as JSON:", e);
      console.error("Raw response that failed:", response);
      return AgentPrompts.getFallbackAnalysis({ title, description });
    }
  }

  async generateCode(
    ticket: Ticket,
    existingContent: string,
    filePath: string,
    analysis: AnalysisResponse,
  ): Promise<{ code: string; explanation: string }> {
    console.log(`[OllamaService] Generating code for ${filePath}...`);
    console.log(`[OllamaService] Ticket: ${ticket.id} - ${ticket.title}`);

    const prompt = AgentPrompts.getCodeGenerationPrompt(
      ticket,
      existingContent,
      filePath,
      analysis,
    );

    console.log(
      `[OllamaService] Generated Prompt (first 200 chars): ${prompt.substring(0, 200)}...`,
    );

    const response = await this.generateResponse(prompt);
    console.log(`[OllamaService] Raw Response length: ${response.length}`);

    // Parse response
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/;
    const match = response.match(codeBlockRegex);

    if (match) {
      const code = match[1];
      const explanation = response.replace(match[0], "").trim();
      return { code, explanation };
    }

    // If no code block, assume the whole response is code (per the new prompt instructions)
    // providing it doesn't look like a conversational response
    if (
      !response.includes("Here is the code") &&
      !response.includes("I have generated")
    ) {
      return {
        code: response,
        explanation: "Raw code response (no markdown blocks detected)",
      };
    }

    return {
      code: response,
      explanation: "No code block found, returning raw response",
    };
  }
}
