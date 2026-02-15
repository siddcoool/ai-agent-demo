import { createInterface } from "readline";
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import minimist from "minimist";
import dotenv from "dotenv";
dotenv.config({ quiet: true });

const argv = minimist(process.argv.slice(2), {
  string: ["prompt", "p"],
  alias: { prompt: ["p"] },
});

const DEFAULT_PROMPT = "When did sharks first appear?";
const fromCli = argv.prompt ?? argv.p ?? argv._.join(" ").trim();

function readPromptFromStdin() {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("Prompt: ", (answer) => {
      rl.close();
      resolve((answer && answer.trim()) || DEFAULT_PROMPT);
    });
  });
}

const prompt = fromCli ? fromCli : await readPromptFromStdin();

const MODEL = "gpt-5-mini";

const WEATHER_API_KEY = process.env.WEATHER_API_KEY ?? "221c6909b09f475dae1144955261502";

// --- Tools ---
const weatherTool = tool({
  name: "weather",
  description: "Get the weather for a given location",
  parameters: z.object({
    location: z.string().describe("The location to get the weather for"),
  }),
  execute: async ({ location }) => {
    const url = `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(location)}`;
    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Weather API error (${response.status}): ${errText || response.statusText}`);
    }
    return response.json();
  },
});

const historyFunFact = tool({
  name: "history_fun_fact",
  description: "Give a fun fact about a historical event",
  parameters: z.object({}),
  execute: async () => {
    return "Sharks are older than trees.";
  },
});

// --- Specialist agents (used by orchestrator via handoffs) ---
const historyAgent = new Agent({
  name: "History Agent",
  model: MODEL,
  handoffDescription:
    "Hand off here for history questions, fun facts about history, historical events, or when the user asks for a history fact.",
  instructions:
    "You provide assistance with historical queries. Explain important events and context clearly. Use the history_fun_fact tool when the user wants a fun history fact.",
  tools: [historyFunFact],
});

const weatherAgent = new Agent({
  name: "Weather Agent",
  model: MODEL,
  handoffDescription:
    "Hand off here for weather questions: current weather, forecast, or when the user asks about weather in a location.",
  instructions:
    "You help with weather. Use the weather tool to get current conditions for the location the user asks about. Reply with a clear, friendly summary.",
  tools: [weatherTool],
});

// --- Orchestrator (observer) agent: plans and delegates to specialists ---
const orchestratorAgent = new Agent({
  name: "Orchestrator",
  model: MODEL,
  instructions: `You are an observer and planner. You receive the user's request and decide which specialist agent should handle it.

- For history-related requests (fun facts, historical events, "when did X happen", etc.): use the handoff to transfer to History Agent.
- For weather-related requests ("weather in X", "what's the temperature in X", "forecast for X"): use the handoff to transfer to Weather Agent.
- Do not answer the question yourself. Always delegate to the appropriate specialist by calling the handoff. If the request is unclear or mixes topics, pick the most relevant specialist.`,
  handoffs: [historyAgent, weatherAgent],
});

// --- Step logging helpers ---
function formatItemSummary(item) {
  if (!item) return "";
  if (item.type === "tool_call_item" && item.rawItem) {
    const name = item.rawItem.name ?? item.name;
    const args = item.rawItem.arguments ?? "";
    return `tool="${name}" args=${args ? args.slice(0, 60) + (args.length > 60 ? "…" : "") : "{}"}`;
  }
  if (item.type === "tool_call_output_item" && item.rawItem) {
    const name = item.rawItem.name ?? "";
    const out = typeof item.rawItem.output === "string" ? item.rawItem.output : JSON.stringify(item.rawItem.output ?? "");
    return `tool="${name}" output=${out.slice(0, 80)}${out.length > 80 ? "…" : ""}`;
  }
  if (item.type === "message_output_item" && item.rawItem?.content) {
    const text = item.rawItem.content.find((c) => c.type === "output_text")?.text ?? "";
    return `text=${text.slice(0, 80)}${text.length > 80 ? "…" : ""}`;
  }
  if (item.type === "handoff_call_item" && item.rawItem) {
    const name = item.rawItem.name ?? item.name ?? "handoff";
    return `delegate to → ${name}`;
  }
  if (item.type === "handoff_output_item") return "handoff completed";
  return `type=${item.type}`;
}

console.log("\n--- Run started ---");
console.log("Prompt:", prompt);
console.log("");

const result = await run(orchestratorAgent, prompt, { stream: true });

let turnCount = 0;
for await (const event of result) {
  if (event.type === "agent_updated_stream_event") {
    turnCount++;
    console.log(`[Turn ${turnCount}] Agent: ${event.agent?.name ?? "unknown"}`);
  } else if (event.type === "run_item_stream_event") {
    const name = event.name ?? "";
    const summary = formatItemSummary(event.item);
    console.log(`[Turn ${turnCount || 1}] ${name}: ${summary}`);
  }
}

await result.completed;
if (result.error) throw result.error;

console.log("\n--- Final output ---");
console.log(result.finalOutput);

const usage = result.state.usage;
console.log("\n--- Token usage ---");
console.log("Input tokens:", usage.inputTokens);
console.log("Output tokens:", usage.outputTokens);
console.log("Total tokens:", usage.totalTokens);
console.log("Requests:", usage.requests);
