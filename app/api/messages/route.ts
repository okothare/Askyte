import { NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase-server";

// Verifies the access token sent with the request.
async function getAuthenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.replace("Bearer ", "");

  const {
    data: { user },
    error,
  } = await supabaseServer.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { chatId, role, content } = body;

    if (!chatId || !role || !content) {
      return NextResponse.json(
        { error: "chatId, role, and content are required." },
        { status: 400 }
      );
    }

    // Make sure the user owns the chat before saving a message to it.
    const { data: chat, error: chatError } = await supabaseServer
      .from("chats")
      .select("id, user_id")
      .eq("id", chatId)
      .single();

    if (chatError || !chat) {
      return NextResponse.json(
        { error: "Chat not found." },
        { status: 404 }
      );
    }

    if (chat.user_id !== user.id) {
      return NextResponse.json(
        { error: "Forbidden." },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseServer
      .from("messages")
      .insert({
        chat_id: chatId,
        role,
        content,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      message: data,
    });
  } catch (error) {
    console.error("Failed to save message:", error);

    return NextResponse.json(
      { error: "Failed to save message." },
      { status: 500 }
    );
  }
}