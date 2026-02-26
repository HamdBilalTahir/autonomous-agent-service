import { NextRequest, NextResponse } from "next/server";
import { GeminiService } from "../../../lib/gemini";
import { AgentPrompts } from "../../../lib/prompts";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const modelName = process.env.GEMINI_MODEL || "gemini-1.5-pro";

    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not set" },
        { status: 500 },
      );
    }

    const gemini = new GeminiService(apiKey, modelName);

    // Mock Data
    const mockTicket = {
      id: "TEST-123",
      title: "Add a Login Button to the Navbar",
      description:
        "As a user, I want to see a login button in the navbar so I can access my account.",
      status: "To Do",
    };

    const mockCodebaseContext = {
      structure: [
        "src/components/Navbar.tsx",
        "src/components/Button.tsx",
        "app/page.tsx",
      ],
    };

    // 1. Test Analysis Prompt
    const analysisPrompt = AgentPrompts.getAnalysisPrompt(
      mockTicket.title,
      mockTicket.description,
      mockCodebaseContext,
    );

    console.log("--- GEMINI TEST: ANALYSIS INPUT ---");
    console.log(analysisPrompt);
    console.log("-----------------------------------");

    // 2. Execute Analysis
    const analysisStartTime = Date.now();
    const analysisResult = await gemini.analyzeTicket(
      mockTicket.title,
      mockTicket.description,
      mockCodebaseContext,
    );
    const analysisDuration = Date.now() - analysisStartTime;

    console.log("--- GEMINI TEST: ANALYSIS OUTPUT ---");
    console.log(JSON.stringify(analysisResult, null, 2));
    console.log("------------------------------------");

    // 3. Test Code Generation Prompt
    // Simulating a NEW file creation by passing empty content
    const existingNavbar = "";
    const targetFilePath = "src/components/LoginButton.tsx";

    const codeGenPrompt = AgentPrompts.getCodeGenerationPrompt(
      mockTicket,
      existingNavbar,
      targetFilePath,
      analysisResult,
    );

    console.log("--- GEMINI TEST: CODE GEN INPUT ---");
    console.log(codeGenPrompt);
    console.log("-----------------------------------");

    // 4. Execute Code Generation
    const codeGenStartTime = Date.now();
    const codeGenResult = await gemini.generateCode(
      mockTicket,
      existingNavbar,
      targetFilePath,
      analysisResult,
    );
    const codeGenDuration = Date.now() - codeGenStartTime;

    console.log("--- GEMINI TEST: CODE GEN OUTPUT ---");
    console.log(codeGenResult.code);
    console.log("------------------------------------");

    return NextResponse.json({
      status: "success",
      model: modelName,
      timings: {
        analysis: `${analysisDuration}ms`,
        codeGeneration: `${codeGenDuration}ms`,
      },
      inputs: {
        analysisPrompt,
        codeGenPrompt,
      },
      outputs: {
        analysis: analysisResult,
        codeGeneration: codeGenResult,
      },
    });
  } catch (error: any) {
    console.error("Gemini Test Failed:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error.message,
        stack: error.stack,
      },
      { status: 500 },
    );
  }
}
