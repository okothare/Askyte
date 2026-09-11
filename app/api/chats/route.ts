import { NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase-server";

// Reads and verifies the Supabase access token sent by the frontend.
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

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    // Only return chats that belong to the signed-in user.
    const { data, error } = await supabaseServer
      .from("chats")
      .select(`
        id,
        title,
        created_at,
        messages (
          id,
          role,
          content,
          created_at
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Keep messages in normal conversation order.
    const chats =
      data?.map((chat) => ({
        ...chat,
        messages: [...chat.messages].sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        ),
      })) ?? [];

    return NextResponse.json({
      chats,
    });
  } catch (error) {
    console.error("Failed to load chats:", error);

    return NextResponse.json(
      { error: "Failed to load chats." },
      { status: 500 }
    );
  }
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
    const title = body.title;

    if (!title) {
      return NextResponse.json(
        { error: "Title is required." },
        { status: 400 }
      );
    }

    // Save the chat with the authenticated user as its owner.
    const { data, error } = await supabaseServer
      .from("chats")
      .insert({
        title,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      chat: data,
    });
  } catch (error) {
    console.error("Failed to create chat:", error);

    return NextResponse.json(
      { error: "Failed to create chat." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const chatId = body.chatId;

    if (!chatId) {
      return NextResponse.json(
        { error: "chatId is required." },
        { status: 400 }
      );
    }

    // Check ownership before allowing the delete.
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

    const { error } = await supabaseServer
      .from("chats")
      .delete()
      .eq("id", chatId);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Failed to delete chat:", error);

    return NextResponse.json(
      { error: "Failed to delete chat." },
      { status: 500 }
    );
  }
}