'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Send, User, Loader2, Sparkles, Pencil, Trash2, Plus, CheckCircle2, ExternalLink, ChevronDown, ChevronUp, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface UserStory {
  summary: string;
  description: string;
  acceptanceCriteria: string[];
}

interface EditableStory extends UserStory {
  id: string;
}

interface CreatedTicket {
  key: string;
  url: string;
  summary: string;
}

interface RequirementGatheringProps {
  selectedBranch: string;
  selectedRepo: { owner: { login: string }; name: string; full_name?: string };
}

export default function RequirementGathering({ selectedBranch, selectedRepo }: RequirementGatheringProps) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hi! I see you've selected the branch "${selectedBranch}" in repository "${selectedRepo.name}". I'm here to help you create Jira user stories. Please tell me what feature or change you're planning to implement.`
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Review / approval state
  const [reviewStories, setReviewStories] = useState<EditableStory[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [expandedStory, setExpandedStory] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createdTickets, setCreatedTickets] = useState<CreatedTicket[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize the textarea as the user types
  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  // Reset textarea height when input is cleared after send
  useEffect(() => {
    if (input === '' && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Add empty assistant placeholder — will be filled by the stream
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          branch: selectedBranch,
          repo: selectedRepo,
        }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            if (event.type === 'text') {
              fullText += event.content;
              // Strip JSON block from the live display
              const displayText = fullText.replace(/```json[\s\S]*?```/g, '').trim();
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: displayText || fullText };
                return next;
              });
            } else if (event.type === 'stories' && event.stories?.length > 0) {
              const editable: EditableStory[] = event.stories.map((s: UserStory, i: number) => ({
                ...s,
                id: `story-${Date.now()}-${i}`,
              }));
              setReviewStories(editable);
              setExpandedStory(editable[0]?.id ?? null);
              setIsReviewing(true);
              // Finalise the assistant message without the JSON block
              const cleanMsg = fullText.replace(/```json[\s\S]*?```/g, '').trim();
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: 'assistant',
                  content: cleanMsg || "I've generated the user stories based on our conversation. You can review them below.",
                };
                return next;
              });
            } else if (event.type === 'error') {
              throw new Error('Stream error');
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: "I'm sorry, I encountered an error. Please try again." };
        return next;
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Story editing helpers
  const updateStory = (id: string, field: keyof UserStory, value: string | string[]) => {
    setReviewStories((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s));
  };

  const updateAC = (storyId: string, acIdx: number, value: string) => {
    setReviewStories((prev) =>
      prev.map((s) =>
        s.id === storyId
          ? { ...s, acceptanceCriteria: s.acceptanceCriteria.map((ac, i) => i === acIdx ? value : ac) }
          : s
      )
    );
  };

  const addAC = (storyId: string) => {
    setReviewStories((prev) =>
      prev.map((s) => s.id === storyId ? { ...s, acceptanceCriteria: [...s.acceptanceCriteria, ''] } : s)
    );
  };

  const removeAC = (storyId: string, acIdx: number) => {
    setReviewStories((prev) =>
      prev.map((s) =>
        s.id === storyId
          ? { ...s, acceptanceCriteria: s.acceptanceCriteria.filter((_, i) => i !== acIdx) }
          : s
      )
    );
  };

  const removeStory = (id: string) => {
    setReviewStories((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) setIsReviewing(false);
      return next;
    });
  };

  const createAllTickets = async () => {
    setIsCreating(true);
    const created: CreatedTicket[] = [];

    for (const story of reviewStories) {
      try {
        const repoOwner = selectedRepo.owner.login;
        const repoName = selectedRepo.name;
        const repoUrl = `https://github.com/${repoOwner}/${repoName}`;
        const descriptionText = `${story.description}\n\nGitHub Repository: ${repoUrl} (branch: ${selectedBranch})\n\nAcceptance Criteria:\n${story.acceptanceCriteria.map((ac) => `- ${ac}`).join('\n')}`;
        const res = await fetch('/api/create-jira-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: story.summary,
            description: descriptionText,
            issueType: 'Story',
            labels: ['ai-agent', 'ai-generated', selectedBranch],
            repoOwner,
            repoName,
            branch: selectedBranch,
            githubToken: (session as any)?.accessToken,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const key: string = data.data?.key ?? '';
          const jiraBase = process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? 'kuailabs.atlassian.net';
          created.push({ key, summary: story.summary, url: `https://${jiraBase}/browse/${key}` });
        }
      } catch {
        // skip failed ticket; continue with rest
      }
    }

    // Save to localStorage
    const savedTickets = localStorage.getItem('generated_tickets');
    const existingTickets = savedTickets ? JSON.parse(savedTickets) : [];
    const updatedTickets = [...existingTickets, ...created];
    localStorage.setItem('generated_tickets', JSON.stringify(updatedTickets));

    setCreatedTickets(created);
    setIsReviewing(false);
    setIsCreating(false);
  };

  // ── Success view ──────────────────────────────────────────────────────────
  if (createdTickets.length > 0) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-800">
              {createdTickets.length} ticket{createdTickets.length > 1 ? 's' : ''} created successfully
            </p>
            <p className="text-sm text-green-700 mt-0.5">
              The AI agent will pick them up automatically via the Jira webhook.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[#E7DBEF] bg-white shadow-[0_2px_10px_rgba(73,34,91,0.05)]">
          <div className="p-5 space-y-3">
            {createdTickets.map((t) => (
              <a
                key={t.key}
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-lg border border-[#E7DBEF] hover:bg-[#F5EBFA] transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs font-bold text-[#6E3482] bg-[#F5EBFA] px-2 py-1 rounded flex-shrink-0">
                    {t.key}
                  </span>
                  <span className="text-sm text-slate-700 truncate">{t.summary}</span>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-[#6E3482] flex-shrink-0 ml-2 transition-colors" />
              </a>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            setMessages([{
              role: 'assistant',
              content: `Hi! I see you've selected the branch "${selectedBranch}" in repository "${selectedRepo.name}". I'm here to help you create Jira user stories. Please tell me what feature or change you're planning to implement.`
            }]);
            setCreatedTickets([]);
            setReviewStories([]);
          }}
          className="text-sm text-[#6E3482] hover:text-[#49225B] underline underline-offset-4 transition-colors"
        >
          Start a new conversation
        </button>
      </div>
    );
  }

  // ── Review / edit view ────────────────────────────────────────────────────
  if (isReviewing) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            Review &amp; Edit Stories ({reviewStories.length})
          </h3>
          <button
            onClick={() => setIsReviewing(false)}
            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Back to chat
          </button>
        </div>

        <div className="space-y-3">
          {reviewStories.map((story) => {
            const isExpanded = expandedStory === story.id;
            return (
              <div key={story.id} className="rounded-xl border border-[#E7DBEF] bg-white shadow-[0_2px_10px_rgba(73,34,91,0.05)] overflow-hidden">
                {/* Header row */}
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedStory(isExpanded ? null : story.id)}
                >
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F5EBFA] text-[#6E3482] text-xs font-bold flex-shrink-0">
                    {reviewStories.indexOf(story) + 1}
                  </span>
                  <input
                    className="flex-1 text-sm font-semibold text-slate-900 bg-transparent border-none outline-none min-w-0"
                    value={story.summary}
                    onChange={(e) => updateStory(story.id, 'summary', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Story summary..."
                  />
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); removeStory(story.id); }}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-slate-400" />
                      : <ChevronDown className="w-4 h-4 text-slate-400" />
                    }
                  </div>
                </div>

                {/* Expanded edit area */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-[#E7DBEF]">
                    <div className="pt-4">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Description
                      </label>
                      <textarea
                        className="w-full text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#6E3482]/20 focus:border-[#6E3482] resize-none transition-all"
                        rows={4}
                        value={story.description}
                        onChange={(e) => updateStory(story.id, 'description', e.target.value)}
                        placeholder="Story description..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Acceptance Criteria
                      </label>
                      <div className="space-y-2">
                        {story.acceptanceCriteria.map((ac, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#6E3482] flex-shrink-0" />
                            <input
                              className="flex-1 text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#6E3482]/20 focus:border-[#6E3482] transition-all"
                              value={ac}
                              onChange={(e) => updateAC(story.id, idx, e.target.value)}
                              placeholder={`Criterion ${idx + 1}…`}
                            />
                            <button
                              onClick={() => removeAC(story.id, idx)}
                              className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => addAC(story.id)}
                          className="flex items-center gap-1.5 text-xs text-[#6E3482] hover:text-[#49225B] font-medium transition-colors mt-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add criterion
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={createAllTickets}
          disabled={isCreating || reviewStories.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 px-6 text-base font-semibold text-white bg-[#6E3482] hover:bg-[#49225B] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm"
        >
          {isCreating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating tickets…
            </>
          ) : (
            <>
              <Pencil className="w-4 h-4" />
              Create {reviewStories.length} Ticket{reviewStories.length > 1 ? 's' : ''} in Jira
            </>
          )}
        </button>
      </div>
    );
  }

  // ── Chat view ─────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-white rounded-2xl border border-[#E7DBEF] shadow-[0_4px_20px_rgba(73,34,91,0.08)] overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50 min-h-0">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={cn(
              "flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
              msg.role === 'user' ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[82%] rounded-2xl px-4 py-3.5 text-sm shadow-sm",
                msg.role === 'user'
                  ? "bg-[#6E3482] text-white rounded-br-sm"
                  : "bg-white text-slate-800 border border-[#E7DBEF] rounded-bl-sm"
              )}
            >
              <div
                className="flex items-center gap-1.5 mb-1.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: msg.role === 'user' ? 'rgba(255,255,255,0.55)' : '#A56ABD' }}
              >
                {msg.role === 'user' ? <User className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                <span>{msg.role === 'user' ? 'You' : 'AI Assistant'}</span>
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.content === '' && (
          <div className="flex justify-start w-full animate-in fade-in duration-300">
            <div className="bg-white border border-[#E7DBEF] rounded-2xl rounded-bl-sm px-4 py-3.5 shadow-sm flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-[#6E3482]" />
              <span className="text-sm text-slate-500">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 p-4 bg-white border-t border-[#E7DBEF]">
        <div className="flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            rows={1}
            className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-[#6E3482] focus:ring-2 focus:ring-[#6E3482]/20 transition-all placeholder:text-slate-400 text-sm resize-none leading-relaxed"
            style={{ minHeight: '46px', maxHeight: '160px', overflowY: 'auto' }}
            placeholder="Describe the feature or change… (Enter to send, Shift+Enter for new line)"
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim()}
            className="p-3 bg-[#6E3482] text-white rounded-xl hover:bg-[#49225B] transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg active:scale-95 duration-200 flex-shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
