"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, MessageSquare, Mic, MicOff, Send, Zap } from "lucide-react";
import { motion } from "framer-motion";
import ChatSpeakButton from "@/components/chat/ChatSpeakButton";
import ProvinceEconomicPanel from "@/components/chat/ProvinceEconomicPanel";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { type ProvinceProfile } from "@/lib/sa-context/provinces";
import { StreamingTypography } from "@/lib/streaming/OptimisticTransactionUI";

interface Opportunity {
  title: string;
  province: string;
  cost: number;
  incomePotential: string;
  link: string;
  category: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const DEFAULT_PROMPT =
  "Find me 3 top digital income opportunities in South Africa under R2000 to start right now";

function OpportunitiesPageInner() {
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt")?.trim() ?? "";

  const [aiMessage, setAiMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [selectedProvince, setSelectedProvince] =
    useState<ProvinceProfile | null>(null);
  const [showProvincePanel, setShowProvincePanel] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lastAutoPromptRef = useRef<string | null>(null);

  const voiceInput = useVoiceInput((transcript) => {
    setAiMessage(transcript);
  });

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, agentLoading]);

  const sendToAIAssistant = useCallback(
    async (promptOverride?: string) => {
      const outgoingMessage = (promptOverride ?? aiMessage).trim();
      if (!outgoingMessage || agentLoading) return;

      const userMsg: ChatMessage = { role: "user", content: outgoingMessage };
      const newHistory = [...chatHistory, userMsg];

      setChatHistory(newHistory);
      setAiMessage("");
      setAgentLoading(true);

      const setAssistantContent = (content: string) => {
        setChatHistory((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];

          if (!last || last.role !== "assistant") {
            next.push({ role: "assistant", content });
            return next;
          }

          next[next.length - 1] = { ...last, content };
          return next;
        });
      };

      const agentMessages = newHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      if (selectedProvince && agentMessages.length > 0) {
        const lastIdx = agentMessages.length - 1;
        const last = agentMessages[lastIdx];
        if (last?.role === "user") {
          agentMessages[lastIdx] = {
            ...last,
            content: `[User province: ${selectedProvince.name} — unemployment ${selectedProvince.unemploymentPercent}%, digital access ${selectedProvince.digitalAccessPercent}%]\n${last.content}`,
          };
        }
      }

      try {
        const res = await fetch("/api/ai-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: agentMessages }),
        });

        if (!res.ok) {
          let message = "Something went wrong. Please try again.";
          try {
            const data = (await res.json()) as { message?: string };
            if (typeof data?.message === "string" && data.message.trim()) {
              message = data.message;
            }
          } catch {
            // ignore parse failures
          }
          setAssistantContent(message);
          return;
        }

        if (!res.body) {
          setAssistantContent("AI engine returned no stream.");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantReply = "";

        const processLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;

          let parsed: unknown;
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            return;
          }

          if (!parsed || typeof parsed !== "object") return;
          const event = parsed as Record<string, unknown>;
          const type = typeof event.type === "string" ? event.type : undefined;
          const data = event.data;

          if (type === "opportunities") {
            if (Array.isArray(data) && data.length > 0) {
              setOpportunities(data as Opportunity[]);
            }
            return;
          }

          if (type === "chunk" && typeof data === "string") {
            assistantReply += data;
            setAssistantContent(assistantReply);
            return;
          }

          if (type === "error" && typeof data === "string" && data.trim()) {
            assistantReply = data;
            setAssistantContent(data);
            return;
          }

          if (type === "done") return;

          if (
            Array.isArray(event.opportunities) &&
            event.opportunities.length > 0
          ) {
            setOpportunities(event.opportunities as Opportunity[]);
            return;
          }

          if (typeof event.message === "string" && event.message.trim()) {
            assistantReply = event.message;
            setAssistantContent(event.message);
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            processLine(line);
          }
        }

        const finalLine = buffer.trim();
        if (finalLine) processLine(finalLine);

        if (!assistantReply.trim()) {
          setAssistantContent("AI engine returned an empty response.");
        }
      } catch {
        setAssistantContent("Connection error. Please try again.");
      } finally {
        setAgentLoading(false);
      }
    },
    [aiMessage, agentLoading, chatHistory, selectedProvince],
  );

  useEffect(() => {
    const promptToRun = initialPrompt || DEFAULT_PROMPT;
    if (lastAutoPromptRef.current === promptToRun) return;

    lastAutoPromptRef.current = promptToRun;
    const timer = setTimeout(() => {
      void sendToAIAssistant(promptToRun);
    }, 300);

    return () => clearTimeout(timer);
  }, [initialPrompt, sendToAIAssistant]);

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans">
      <div className="max-w-7xl mx-auto px-8 pt-10 pb-20">
        <Link
          href="/"
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition text-sm mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Apex
        </Link>

        <div className="mb-8">
          <h1 className="text-5xl font-semibold flex items-center gap-3">
            <Zap className="w-10 h-10 text-yellow-400" /> Opportunities
          </h1>
          <p className="text-zinc-400 mt-2 max-w-3xl">
            Scout Agent surfaces South African digital income opportunities
            under R2000 and streams tailored guidance through the live AI
            assistant.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-8 items-start">
          <section className="space-y-4">
            <div className="glass rounded-2xl p-5 border border-white/10">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-zinc-400">Live opportunity feed</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Real-time suggestions from Scout Agent and the AI router
                  </p>
                </div>
                <button
                  onClick={() => void sendToAIAssistant(DEFAULT_PROMPT)}
                  disabled={agentLoading}
                  className="glass px-4 py-2 rounded-xl text-sm hover:bg-white/15 transition disabled:opacity-50"
                >
                  Refresh feed
                </button>
              </div>
            </div>

            {opportunities.length === 0 ? (
              <div className="glass rounded-2xl p-8 text-center text-zinc-500">
                <Zap className="w-8 h-8 mx-auto mb-3 text-yellow-400/60" />
                <p>Scout Agent is loading opportunities.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {opportunities.map((opp) => (
                  <motion.a
                    key={opp.link || opp.title}
                    href={opp.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass rounded-2xl p-5 border border-transparent hover:border-white/15 transition"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className="text-xs glass px-3 py-1 rounded-full text-zinc-400">
                        {opp.category}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {opp.province}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold mb-2 leading-tight">
                      {opp.title}
                    </h2>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-emerald-400 font-medium">
                        R{opp.cost} to start
                      </span>
                      <span className="text-zinc-300">
                        {opp.incomePotential}
                      </span>
                    </div>
                  </motion.a>
                ))}
              </div>
            )}
          </section>

          <section className="glass rounded-3xl overflow-hidden border border-white/10 xl:sticky xl:top-8">
            <div className="p-4 border-b border-white/10 flex items-center gap-3">
              <MessageSquare className="w-5 h-5" />
              <span className="font-medium">Scout Assistant</span>
              <span className="text-xs text-emerald-400 animate-pulse ml-auto">
                ● Online
              </span>
              <button
                onClick={() => setShowProvincePanel((prev) => !prev)}
                className={`text-xs px-2 py-1 rounded-lg transition ${selectedProvince ? "bg-blue-500/20 text-blue-300" : "bg-white/10 text-zinc-400 hover:text-white"}`}
                title="Select province"
              >
                {selectedProvince ? selectedProvince.code : "🌍 SA"}
              </button>
            </div>

            {showProvincePanel && (
              <div className="border-b border-white/10">
                <ProvinceEconomicPanel
                  selectedCode={selectedProvince?.code ?? null}
                  onSelect={(province) => {
                    setSelectedProvince(province);
                    setShowProvincePanel(false);
                  }}
                  compact
                />
              </div>
            )}

            <div
              ref={chatScrollRef}
              className="h-[32rem] p-5 overflow-y-auto space-y-4 text-sm"
            >
              {chatHistory.length === 0 && (
                <div className="text-zinc-500 text-center py-8">
                  <p>Ask about digital income opportunities in South Africa.</p>
                  <p className="text-xs mt-2 text-zinc-600">
                    Powered by Scout Agent + multi-model routing
                  </p>
                </div>
              )}

              {chatHistory.map((msg, index) => (
                <div
                  key={`${msg.role}-${index}`}
                  className={msg.role === "user" ? "text-right" : "text-left"}
                >
                  <div
                    className={`inline-block px-4 py-2 rounded-2xl max-w-[88%] ${msg.role === "user" ? "bg-white/10" : "bg-white/5"}`}
                  >
                    {msg.role === "assistant" ? (
                      <StreamingTypography
                        text={msg.content}
                        speed={0.02}
                        variant="default"
                      />
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                  {msg.role === "assistant" && msg.content && !agentLoading && (
                    <div className="mt-1">
                      <ChatSpeakButton text={msg.content} />
                    </div>
                  )}
                </div>
              ))}

              {agentLoading && (
                <div className="text-left">
                  <div className="inline-block px-4 py-2 rounded-2xl bg-white/5 text-zinc-500">
                    <StreamingTypography
                      text="Thinking..."
                      speed={0.05}
                      variant="thinking"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/10 flex gap-3 items-center">
              {voiceInput.isSupported && (
                <button
                  onClick={
                    voiceInput.isListening
                      ? voiceInput.stopListening
                      : voiceInput.startListening
                  }
                  aria-label={
                    voiceInput.isListening
                      ? "Stop voice input"
                      : "Start voice input"
                  }
                  aria-pressed={voiceInput.isListening}
                  className={`p-2 rounded-full transition ${voiceInput.isListening ? "bg-red-500/30 text-red-400 animate-pulse" : "hover:bg-white/10 text-zinc-500 hover:text-white"}`}
                >
                  {voiceInput.isListening ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>
              )}

              <input
                type="text"
                value={
                  voiceInput.isListening && voiceInput.interimText
                    ? voiceInput.interimText
                    : aiMessage
                }
                onChange={(e) => {
                  if (!voiceInput.isListening) setAiMessage(e.target.value);
                }}
                readOnly={voiceInput.isListening}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendToAIAssistant();
                  }
                }}
                placeholder={
                  selectedProvince
                    ? `Ask about ${selectedProvince.name}...`
                    : "Ask about opportunities..."
                }
                className="flex-1 bg-transparent focus:outline-none"
                disabled={agentLoading}
              />

              <button
                onClick={() => {
                  void sendToAIAssistant();
                }}
                disabled={agentLoading || !aiMessage.trim()}
                className="px-4 py-2 glass rounded-2xl hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send className="w-4 h-4" /> Send
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={null}>
      <OpportunitiesPageInner />
    </Suspense>
  );
}
