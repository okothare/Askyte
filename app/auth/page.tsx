"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Use the URL to decide whether the page opens in sign-in or sign-up mode.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectedMode = params.get("mode");

    if (selectedMode === "signup") {
      setMode("signup");
    } else {
      setMode("signin");
    }
  }, []);

  const handleSubmit = async () => {
    if (!email || !password) {
      setMessage("Please enter an email and password.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        setMessage("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        // Return to the main app after a successful sign-in.
        window.location.href = "/";
      }
    } catch (error) {
      if (error instanceof Error) {
        setMessage(error.message);
      } else {
        setMessage("Something went wrong.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Reload the page in the selected auth mode.
  const handleModeChange = () => {
    if (mode === "signin") {
      window.location.href = "/auth?mode=signup";
    } else {
      window.location.href = "/auth?mode=signin";
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="text-3xl font-semibold">Askyte</h1>

        <p className="mt-2 text-sm text-gray-400">
          {mode === "signin"
            ? "Sign in to access your saved chats."
            : "Create an account to save your conversations."}
        </p>

        <div className="mt-8 flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none placeholder:text-gray-500"
          />

          <div className="flex items-center rounded-xl border border-white/10 bg-white/5">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              className="flex-1 bg-transparent px-4 py-3 outline-none placeholder:text-gray-500"
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="px-4 text-sm text-gray-400 transition hover:text-white"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="rounded-xl bg-white px-4 py-3 font-medium text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading
              ? "Please wait..."
              : mode === "signin"
                ? "Sign In"
                : "Create Account"}
          </button>
        </div>

        {message && <p className="mt-4 text-sm text-gray-300">{message}</p>}

        <button
          onClick={handleModeChange}
          className="mt-6 text-sm text-gray-400 transition hover:text-white"
        >
          {mode === "signin"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
