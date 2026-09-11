import Groq from "groq-sdk";
import { NextResponse } from "next/server";

// Reuse one Groq client for all chat requests.
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages: ChatMessage[] = body.messages;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required." },
        { status: 400 }
      );
    }

    // Send the full conversation so Askyte can keep context between messages.
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are Askyte, a helpful and concise AI assistant. Give clear and useful answers.",
        },
        ...messages,
      ],
      model: "openai/gpt-oss-20b",
    });

    const reply =
      completion.choices[0]?.message?.content ??
      "I couldn't generate a response.";

    return NextResponse.json({ message: reply });
  } catch (error) {
    console.error("Groq API error:", error);

    return NextResponse.json(
      { error: "Failed to generate a response." },
      { status: 500 }
    );
  }
}