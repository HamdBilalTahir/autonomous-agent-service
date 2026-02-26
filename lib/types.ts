export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  assignee?: string;
  priority?: string;
}

export interface AgentAction {
  type: "comment" | "code_change" | "pr_create" | "ticket_update";
  payload: any;
}

export interface AgentResponse {
  success: boolean;
  actions: AgentAction[];
  message: string;
}

export interface WebhookPayload {
  action: string;
  issue?: {
    number: number;
    title: string;
    body: string;
  };
  repository?: {
    full_name: string;
  };
  sender?: {
    login: string;
  };
}
