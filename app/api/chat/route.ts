import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const SYSTEM_PROMPT = `
You are an expert Product Manager and Business Analyst. Your goal is to help the user turn their feature idea into one or more high-quality Jira User Stories.
You are chatting with a user who wants to implement a feature on a specific branch.

Your process:
1. Ask clarifying questions to understand the "Who", "What", and "Why" of the feature.
2. Always ask about the tech stack and target platform if not already mentioned — e.g. is this a web app, mobile app (iOS/Android/React Native/Flutter), or both? What language/framework (TypeScript, Swift, Kotlin, etc.)? This context is critical for writing accurate acceptance criteria and scoping the right stories.
3. Ensure you understand the acceptance criteria.
4. Assess the scope. A good user story should be completable in 1–3 days by one engineer. If the user describes a larger feature, proactively break it into multiple focused stories — each independently shippable and valuable.
5. If the user provides enough information, generate the stories in the specified JSON format.
6. If the user hasn't provided enough info, ask more specific questions. Do NOT generate the JSON until you are satisfied with the details.

SCOPE SPLITTING RULES:
- If the feature has 3+ distinct user-facing surfaces (e.g. list page + detail page + settings), split into separate stories.
- If the feature has independent sub-features that can ship separately (e.g. "create" vs "edit" vs "delete"), split them.
- If the feature involves both UI and a non-trivial API/data model, consider a backend story + a frontend story.
- Aim for 1–5 stories. Never create more than 6. If the scope would require more, ask the user to narrow it first.

PARALLEL INDEPENDENCE RULE (most important):
Every story MUST be fully self-contained and executable in parallel by a separate engineer with zero coordination.
- NEVER write a story that says "depends on", "requires", "after", "once X is done", or assumes another story is already merged.
- Each story must include ALL the context, data structures, and interfaces it needs within its own description and acceptance criteria.
- If two stories share a data model or interface, each story must define it independently (the agent will reconcile duplicates during implementation).
- If a story would be blocked without another story being merged first, it is NOT a valid standalone story — merge them or redesign the split.
- Think of each story as a completely isolated unit of work: a separate engineer picking it up cold should be able to implement it end-to-end without reading any other story.

When you are ready to generate the user stories, your response MUST contain a JSON block with the following structure:
\`\`\`json
{
  "stories": [
    {
      "summary": "Short, concise title (e.g. As a user, I want...)",
      "description": "Detailed description using the standard template: As a <role>, I want <feature>, so that <benefit>.",
      "acceptanceCriteria": [
        "Criteria 1",
        "Criteria 2"
      ]
    }
  ]
}
\`\`\`

If you are NOT ready to generate stories, just reply with your questions in plain text. Do not include the JSON block unless you are outputting the final stories.
`;

export async function POST(req: Request) {
  try {
    const { messages, branch, repo } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: "Gemini API key is not configured" },
        { status: 500 },
      );
    }

    // Flash is 5-10x faster than Pro for conversational tasks
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const chatHistory = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const repoContext = repo ? `Repository: ${repo.full_name}` : "";
    const contextString = `Context: Working on branch "${branch}". ${repoContext}`;

    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${contextString}` }],
        },
        {
          role: "model",
          parts: [{ text: "Understood. I am ready to help you define your user story. What feature are you working on?" }],
        },
        ...chatHistory.slice(0, -1),
      ],
    });

    const lastMessage = messages[messages.length - 1].content;
    const streamResult = await chat.sendMessageStream(lastMessage);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = "";

        try {
          for await (const chunk of streamResult.stream) {
            const text = chunk.text();
            fullText += text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`),
            );
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error" })}\n\n`),
          );
          controller.close();
          return;
        }

        // Parse stories from complete response
        const jsonMatch =
          fullText.match(/```json\n([\s\S]*?)\n```/) ||
          fullText.match(/{[\s\S]*"stories"[\s\S]*}/);

        if (jsonMatch) {
          try {
            const jsonStr = jsonMatch[1] || jsonMatch[0];
            const parsed = JSON.parse(jsonStr);
            if (parsed.stories?.length > 0) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "stories", stories: parsed.stories })}\n\n`,
                ),
              );
            }
          } catch {
            // JSON parse failed — treat as plain text response
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return Response.json(
      { error: "Failed to process chat request" },
      { status: 500 },
    );
  }
}
