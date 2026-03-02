import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const SYSTEM_PROMPT = `
You are an expert Product Manager and Business Analyst. Your goal is to help the user turn their feature idea into one or more high-quality Jira User Stories.
You are chatting with a user who wants to implement a feature on a specific branch.

Your process:
1. Ask clarifying questions to understand the "Who", "What", and "Why" of the feature.
2. Ensure you understand the acceptance criteria.
3. Assess the scope. A good user story should be completable in 1–3 days by one engineer. If the user describes a larger feature, proactively break it into multiple focused stories — each independently shippable and valuable.
4. If the user provides enough information, generate the stories in the specified JSON format.
5. If the user hasn't provided enough info, ask more specific questions. Do NOT generate the JSON until you are satisfied with the details.

SCOPE SPLITTING RULES:
- If the feature has 3+ distinct user-facing surfaces (e.g. list page + detail page + settings), split into separate stories.
- If the feature has independent sub-features that can ship separately (e.g. "create" vs "edit" vs "delete"), split them.
- If the feature involves both UI and a non-trivial API/data model, consider a backend story + a frontend story.
- Aim for 1–5 stories. Never create more than 6. If the scope would require more, ask the user to narrow it first.
- Each story must stand alone — do NOT create a story that depends entirely on another unshipped story.

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
      return NextResponse.json(
        { error: "Gemini API key is not configured" },
        { status: 500 },
      );
    }

    const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

    // Construct the chat history for Gemini
    const chatHistory = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const repoContext = repo ? `Repository: ${repo.full_name}` : "";
    const contextString = `Context: Working on branch "${branch}". ${repoContext}`;

    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [
            {
              text: `${SYSTEM_PROMPT}\n\n${contextString}`,
            },
          ],
        },
        {
          role: "model",
          parts: [
            {
              text: "Understood. I am ready to help you define your user story. What feature are you working on?",
            },
          ],
        },
        ...chatHistory.slice(0, -1), // Previous history
      ],
    });

    const lastMessage = messages[messages.length - 1].content;
    const result = await chat.sendMessage(lastMessage);
    const responseText = result.response.text();

    // Check for JSON block
    const jsonMatch =
      responseText.match(/```json\n([\s\S]*?)\n```/) ||
      responseText.match(/{[\s\S]*"stories"[\s\S]*}/);

    let stories = null;
    let messageContent = responseText;

    if (jsonMatch) {
      try {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        if (parsed.stories) {
          stories = parsed.stories;
          // Strip the JSON from the message to show a clean response
          messageContent = responseText
            .replace(/```json[\s\S]*?```/g, "")
            .trim();
          if (!messageContent) {
            messageContent =
              "I've generated the user stories based on our conversation. You can review them below.";
          }
        }
      } catch (e) {
        console.error("Failed to parse JSON from AI response", e);
      }
    }

    return NextResponse.json({
      message: messageContent,
      stories: stories,
    });
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 },
    );
  }
}
