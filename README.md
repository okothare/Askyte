# Askyte

https://askyte.vercel.app/

Askyte is a full-stack LLM-powered AI assistant built with Next.js, TypeScript, Tailwind CSS, Groq, and Supabase.

It supports multi-turn conversations, quick actions, user authentication, persistent chat history, guest mode, Markdown rendering, and responsive layouts.

## Features

- AI-powered text conversations
- Multi-turn conversation context
- Quick actions for:
  - Summarize
  - Explain
  - Plan
  - Rewrite
  - Compare
- Markdown and table rendering
- Multiple chat conversations
- Guest mode with temporary chats
- Email/password authentication
- Persistent chat history for signed-in users
- Secure per-user chat ownership
- Delete chat functionality
- Responsive desktop and mobile UI

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Groq API
- Supabase
- PostgreSQL
- Vercel

## How It Works

The frontend sends user prompts to a Next.js API route, which forwards the conversation to a Groq-hosted language model.

Signed-in users have their chats and messages stored in Supabase. Guest users can use the assistant without creating an account, but their chat history is cleared when the page is refreshed.

Protected API routes verify Supabase access tokens before reading or modifying saved conversations.
