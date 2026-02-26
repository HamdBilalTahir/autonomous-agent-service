import { GoogleGenerativeAI } from "@google/generative-ai";
import { AgentPrompts, AnalysisResponse } from "./prompts";
import { Ticket } from "./types";

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private jsonModel: any;

  constructor(apiKey: string, modelName: string = "gemini-1.5-pro") {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: modelName });
    this.jsonModel = this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: "application/json" },
    });
  }

  async checkHealth(): Promise<boolean> {
    try {
      // Simple generation to check if API key and model work
      const result = await this.model.generateContent("Hello");
      const response = await result.response;
      return !!response.text();
    } catch (e) {
      console.error("Gemini Service health check failed:", e);
      return false;
    }
  }

  async generateResponse(prompt: string, context?: string): Promise<string> {
    const fullPrompt = context
      ? `Context: ${context}\n\nTask: ${prompt}`
      : prompt;

    const result = await this.model.generateContent(fullPrompt);
    const response = await result.response;
    return response.text();
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

    console.log("[GeminiService] Analyzing ticket with JSON model...");
    try {
      console.log("[GeminiService] Sending request to Gemini JSON model...");
      const result = await this.jsonModel.generateContent(prompt);
      console.log("[GeminiService] Request sent, awaiting response...");

      const response = await result.response;
      const text = response.text();
      console.log("[GeminiService] Response received. Length:", text.length);

      console.log("Raw Gemini Analysis Response:", text);
      const parsed = JSON.parse(text);

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
      console.error("[GeminiService] Error during analysis:", e);
      return AgentPrompts.getFallbackAnalysis({ title, description });
    }
  }

  async generateCode(
    ticket: Ticket,
    existingContent: string,
    filePath: string,
    analysis: AnalysisResponse,
  ): Promise<{ code: string; explanation: string }> {
    console.log(`[GeminiService] Generating code for ${filePath}...`);
    console.log(`[GeminiService] Ticket: ${ticket.id} - ${ticket.title}`);

    const prompt = AgentPrompts.getCodeGenerationPrompt(
      ticket,
      existingContent,
      filePath,
      analysis,
    );

    console.log(
      `[GeminiService] Generated Prompt (first 200 chars): ${prompt.substring(0, 200)}...`,
    );

    console.log("[GeminiService] Sending code generation request to Gemini...");
    const response = await this.generateResponse(prompt);
    console.log(`[GeminiService] Raw Response length: ${response.length}`);

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
