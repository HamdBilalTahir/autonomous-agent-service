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
  ): Promise<{
    summary: string;
    suggestedAction: string;
    complexity: string;
    filesToChange?: string[];
  }> {
    const prompt = `
      You are an expert software engineer. Analyze the following ticket:
      Title: ${title}
      Description: ${description}

      Provide a JSON response with the following keys:
      - summary: A brief summary of the issue
      - suggestedAction: What should be done
      - complexity: "Low", "Medium", or "High"
      - filesToChange: An array of file paths that likely need modification (guess based on description)

      Return ONLY JSON.
    `;

    const response = await this.generateResponse(prompt);
    try {
      const jsonStr = response.replace(/```json\n|\n```/g, "").trim();
      // Handle potential trailing text
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        return JSON.parse(jsonStr.substring(firstBrace, lastBrace + 1));
      }
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse Ollama response as JSON", e);
      return {
        summary: "Analysis failed",
        suggestedAction: "Manual review required",
        complexity: "Unknown",
        filesToChange: [],
      };
    }
  }

  async generateCode(
    ticketContext: string,
    fileContent: string,
    filePath: string,
  ): Promise<{ code: string; explanation: string }> {
    const prompt = `
      You are an expert developer.
      Ticket: ${ticketContext}
      
      Existing File (${filePath}):
      \`\`\`
      ${fileContent}
      \`\`\`

      Task: Rewrite the file to address the ticket requirements. 
      Return the full updated file content inside a code block.
      After the code block, provide a brief explanation.
    `;

    const response = await this.generateResponse(prompt);

    // Parse response
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/;
    const match = response.match(codeBlockRegex);

    if (match) {
      const code = match[1];
      const explanation = response.replace(match[0], "").trim();
      return { code, explanation };
    }

    return {
      code: response,
      explanation: "No code block found, returning raw response",
    };
  }
}
