"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

// Represents one message in a conversation.
type Message = {
  role: "user" | "assistant";
  content: string;
};

// Represents a complete chat shown in the sidebar.
type Chat = {
  id: string;
  title: string;
  messages: Message[];
};

// Quick actions prefill the message box with common prompt types.
const quickActions = ["Summarize", "Explain", "Plan", "Rewrite", "Compare"];

export default function Home() {
  // Main UI state for the current input, conversations, loading state, and user session.
  const [input, setInput] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Used to automatically scroll to the newest message.
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Find the currently selected chat and expose its messages to the UI.
  const activeChat = chats.find((chat) => chat.id === activeChatId);
  const messages = activeChat?.messages ?? [];

  // Keep the conversation scrolled to the latest message or loading state.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [activeChatId, messages.length, isLoading]);

  // Load the current Supabase user and keep the UI updated when auth state changes.
  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUser(user);
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Signed-in users load their saved chats from the protected API route.
  // Guests skip this step because their chats only live in local React state.
  useEffect(() => {
    if (!user) {
      return;
    }

    const loadChats = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          return;
        }

        const response = await fetch("/api/chats", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to load chats.");
        }

        const data = await response.json();

        const loadedChats: Chat[] = data.chats.map(
          (chat: {
            id: string;
            title: string;
            messages: {
              role: "user" | "assistant";
              content: string;
            }[];
          }) => ({
            id: chat.id,
            title: chat.title,
            messages: chat.messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          }),
        );

        setChats(loadedChats);
      } catch (error) {
        console.error("Failed to load saved chats:", error);
      }
    };

    loadChats();
  }, [user]);

  // Sends a prompt to Askyte and updates the active conversation.
  // Signed-in users persist chats/messages; guests keep them only in memory.
  const handleSend = async () => {
    const trimmedInput = input.trim();

    if (!trimmedInput || isLoading) {
      return;
    }

    const userMessage: Message = {
      role: "user",
      content: trimmedInput,
    };

    let chatId = activeChatId;
    const conversationForApi = [...messages, userMessage];

    setInput("");
    setIsLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // Create a new conversation when no chat is currently active.
      if (!chatId) {
        const title =
          trimmedInput.length > 32
            ? `${trimmedInput.slice(0, 32)}...`
            : trimmedInput;

        let newChatId: string;

        // Persistent chats are created through the authenticated backend route.
        // Guests receive a temporary browser-generated ID instead.
        if (session) {
          const chatResponse = await fetch("/api/chats", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              title,
            }),
          });

          if (!chatResponse.ok) {
            throw new Error("Failed to create chat.");
          }

          const chatData = await chatResponse.json();
          newChatId = chatData.chat.id;
        } else {
          newChatId = crypto.randomUUID();
        }

        chatId = newChatId;

        const newChat: Chat = {
          id: newChatId,
          title,
          messages: [userMessage],
        };

        setChats((currentChats) => [newChat, ...currentChats]);
        setActiveChatId(newChatId);
      } else {
        setChats((currentChats) =>
          currentChats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  messages: [...chat.messages, userMessage],
                }
              : chat,
          ),
        );
      }

      // Save the user message only when an authenticated session exists.
      if (session) {
        const userMessageResponse = await fetch("/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            chatId,
            role: "user",
            content: userMessage.content,
          }),
        });

        if (!userMessageResponse.ok) {
          throw new Error("Failed to save user message.");
        }
      }

      // Send the full current conversation so the LLM can maintain context.
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: conversationForApi,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get a response from Askyte.");
      }

      const data = await response.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data.message,
      };

      // Add the assistant reply to the correct chat in local state.
      setChats((currentChats) =>
        currentChats.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...chat.messages, assistantMessage],
              }
            : chat,
        ),
      );

      // Save the assistant reply for signed-in users.
      if (session) {
        const assistantMessageResponse = await fetch("/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            chatId,
            role: "assistant",
            content: assistantMessage.content,
          }),
        });

        if (!assistantMessageResponse.ok) {
          throw new Error("Failed to save assistant message.");
        }
      }
    } catch (error) {
      console.error(error);

      const errorMessage: Message = {
        role: "assistant",
        content: "Something went wrong. Please try again.",
      };

      if (chatId) {
        setChats((currentChats) =>
          currentChats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  messages: [...chat.messages, errorMessage],
                }
              : chat,
          ),
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Allow Enter to submit the current prompt.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleSend();
    }
  };

  // Start a blank conversation without deleting existing chats.
  const handleNewChat = () => {
    setActiveChatId(null);
    setInput("");
  };

  // Switch the main conversation view to a chat from the sidebar.
  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setInput("");
  };

  // Delete persistent chats through the secured API, or remove guest chats locally.
  const handleDeleteChat = async (chatId: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const response = await fetch("/api/chats", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            chatId,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to delete chat.");
        }
      }

      setChats((currentChats) =>
        currentChats.filter((chat) => chat.id !== chatId),
      );

      if (activeChatId === chatId) {
        setActiveChatId(null);
        setInput("");
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  };

  // Prefill the input with a selected quick-action prompt.
  const handleQuickAction = (action: string) => {
    setInput(`${action}: `);
  };

  // End the Supabase session and return the app to guest mode.
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    // Main application layout: desktop sidebar plus responsive chat area.
    <main className="flex min-h-screen bg-black text-white">
      {/* Desktop sidebar with chat navigation and persistence status. */}
      <aside className="hidden w-64 flex-col border-r border-white/10 bg-white/[0.02] p-4 md:flex">
        {" "}
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Askyte</h1>
          <p className="mt-1 text-xs text-gray-500">LLM Assistant</p>
        </div>
        <button
          onClick={handleNewChat}
          className="w-full rounded-xl border border-white/10 px-4 py-3 text-left text-sm transition hover:bg-white/10"
        >
          + New Chat
        </button>
        <div className="mt-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
            Recent Chats
          </p>

          <div className="flex flex-col gap-1">
            {chats.length === 0 ? (
              <div className="rounded-lg px-3 py-2 text-sm text-gray-500">
                No saved chats yet
              </div>
            ) : (
              chats.map((chat) => (
                <div
                  key={chat.id}
                  className={
                    activeChatId === chat.id
                      ? "flex items-center gap-2 rounded-lg bg-white/10 px-2 py-1"
                      : "flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5"
                  }
                >
                  <button
                    onClick={() => handleSelectChat(chat.id)}
                    className="min-w-0 flex-1 px-1 py-1 text-left text-sm text-gray-300"
                  >
                    <span className="block truncate">{chat.title}</span>
                  </button>

                  <button
                    onClick={() => handleDeleteChat(chat.id)}
                    className="shrink-0 rounded px-2 py-1 text-xs text-gray-500 transition hover:bg-white/10 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="mt-auto border-t border-white/10 pt-4">
          {user ? (
            <div>
              <p className="text-xs text-gray-400">Chats are saved</p>
              <p className="mt-1 text-xs text-gray-600">Powered by Groq</p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-400">Guest chats are temporary</p>
              <p className="mt-1 text-xs text-gray-600">
                Sign in to save conversations
              </p>
              <p className="mt-3 text-xs text-gray-600">Powered by Groq</p>
            </div>
          )}
        </div>
      </aside>

      <section className="flex flex-1 flex-col">
        {/* Top bar shows the current chat and authentication controls. */}
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen((current) => !current)}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 md:hidden"
            >
              Menu
            </button>

            <div>
              <h2 className="font-medium">
                {activeChat ? activeChat.title : "New Conversation"}
              </h2>

              <p className="text-xs text-gray-500">Ask anything</p>
            </div>
          </div>

          {user ? (
            <div className="hidden items-center gap-4 sm:flex">
              <span className="text-sm text-gray-400">{user.email}</span>

              <button
                onClick={handleSignOut}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                window.location.href = "/auth";
              }}
              className="hidden rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10 sm:block"
            >
              Sign In
            </button>
          )}
        </header>

        {/* Mobile-only menu replaces the desktop sidebar on small screens. */}
        {isMobileMenuOpen && (
          <div className="border-b border-white/10 bg-black p-4 md:hidden">
            <button
              onClick={() => {
                handleNewChat();
                setIsMobileMenuOpen(false);
              }}
              className="w-full rounded-xl border border-white/10 px-4 py-3 text-left text-sm transition hover:bg-white/10"
            >
              + New Chat
            </button>

            <div className="mt-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                Recent Chats
              </p>

              <div className="flex flex-col gap-1">
                {chats.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-gray-500">
                    No chats yet
                  </p>
                ) : (
                  chats.map((chat) => (
                    <div
                      key={chat.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5"
                    >
                      <button
                        onClick={() => {
                          handleSelectChat(chat.id);
                          setIsMobileMenuOpen(false);
                        }}
                        className="min-w-0 flex-1 px-1 py-2 text-left text-sm text-gray-300"
                      >
                        <span className="block truncate">{chat.title}</span>
                      </button>

                      <button
                        onClick={() => handleDeleteChat(chat.id)}
                        className="shrink-0 rounded px-2 py-1 text-xs text-gray-500 transition hover:bg-white/10 hover:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              {user ? (
                <div>
                  <p className="mb-3 truncate text-sm text-gray-400">
                    {user.email}
                  </p>

                  <button
                    onClick={handleSignOut}
                    className="w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    window.location.href = "/auth";
                  }}
                  className="w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 transition hover:bg-white/10"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
            {/* Show the welcome screen until the active chat has messages. */}
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <h2 className="text-4xl font-semibold">How can I help?</h2>

                <p className="mt-3 text-gray-400">
                  Ask a question, plan something, rewrite text, or explore an
                  idea.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  {quickActions.map((action) => (
                    <button
                      key={action}
                      onClick={() => handleQuickAction(action)}
                      className="rounded-full border border-white/10 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/10"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={
                      message.role === "user"
                        ? "ml-auto max-w-[80%] rounded-2xl bg-white px-4 py-3 text-black"
                        : "mr-auto max-w-[95%] rounded-2xl bg-white/10 px-4 py-3 text-white"
                    }
                  >
                    {message.role === "assistant" ? (
                      <div className="prose prose-invert max-w-none overflow-x-auto">
                        {/* Render assistant responses with Markdown and GitHub-style tables. */}
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            table: ({ children }) => (
                              <table className="my-4 w-full border-collapse text-left text-sm">
                                {children}
                              </table>
                            ),
                            th: ({ children }) => (
                              <th className="border-b border-white/20 px-3 py-2 font-semibold">
                                {children}
                              </th>
                            ),
                            td: ({ children }) => (
                              <td className="border-b border-white/10 px-3 py-2 align-top">
                                {children}
                              </td>
                            ),
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      message.content
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="mr-auto max-w-[80%] rounded-2xl bg-white/10 px-4 py-3 text-gray-400">
                    Askyte is thinking...
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Message composer stays at the bottom of the chat area. */}
            <div className="mt-6 flex gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 sm:mt-8 sm:gap-3 sm:p-3">
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Askyte..."
                disabled={isLoading}
                className="flex-1 bg-transparent px-3 py-2 outline-none placeholder:text-gray-500 disabled:cursor-not-allowed"
              />

              <button
                onClick={handleSend}
                disabled={isLoading}
                className="rounded-xl bg-white px-5 py-2 font-medium text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
