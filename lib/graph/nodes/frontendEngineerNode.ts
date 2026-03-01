import { createEngineerNode } from "./engineerNode";
import {
  getFrontendEngineerSystemPrompt,
  getFrontendEngineerUserPrompt,
  getPatchPrompt,
} from "../prompts/frontendEngineerPrompts";

export const frontendEngineerNode = createEngineerNode({
  engineerType: "frontend",
  getSystemPrompt: getFrontendEngineerSystemPrompt,
  getUserPrompt: getFrontendEngineerUserPrompt,
  getPatchPrompt,
});
