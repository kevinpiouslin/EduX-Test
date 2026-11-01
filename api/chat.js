import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

// Shown if the prompt file cannot be read, so the chat still works.
const FALLBACK_PROMPT =
  "You are the friendly guide on Kevin's personal website. Kevin is studying a " +
  "Masters in Education and has over 5 years in education, most recently as head " +
  "of the math department in Dubai. His idea is gamification: using games to " +
  "engage kids and get them to do better, because students like games and are " +
  "more inclined to do more work when the two are merged. Answer in a warm, " +
  "plain-spoken way for a general audience, keep replies short, and only use the " +
  "facts above. If asked something you don't know about Kevin, say so and suggest " +
  "another question.";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGES = 20;

function loadSystemPrompt() {
  try {
    return readFileSync(new URL("./system-prompt.txt", import.meta.url), "utf8");
  } catch {
    return FALLBACK_PROMPT;
  }
}

// Keeps only well-formed turns, and only the latest ones.
function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
    )
    .map((message) => ({ role: message.role, content: message.content }))
    .slice(-MAX_MESSAGES);
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const messages = cleanMessages(body && body.messages);

    if (messages.length === 0) {
      return Response.json(
        { error: "Please type a message first." },
        { status: 400 }
      );
    }

    const tooLong = messages.some(
      (message) => message.content.length > MAX_MESSAGE_LENGTH
    );

    if (tooLong) {
      return Response.json(
        {
          error:
            "That message is a bit long — please keep it under 2000 characters."
        },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic();

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: loadSystemPrompt(),
      messages: messages
    });

    // The first block may not be text, so gather every text block.
    const reply = (response.content || [])
      .filter((block) => block && block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!reply) {
      return Response.json(
        { error: "I couldn't come up with an answer just then. Please try again." },
        { status: 502 }
      );
    }

    return Response.json({ reply });
  } catch (error) {
    console.error("Chat function failed:", error);

    return Response.json(
      {
        error:
          "Sorry, something went wrong on our side. Please try again in a moment."
      },
      { status: 500 }
    );
  }
}
