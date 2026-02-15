# AI Agent Demo – Orchestrator + Specialists

A multi-agent demo using [@openai/agents](https://github.com/openai/openai-agents). An **orchestrator (observer)** agent receives the user’s request, plans, and delegates to specialist agents via **handoffs**.

## Architecture

```
                    ┌─────────────────┐
                    │   User input    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Orchestrator   │  ← Observer: plans and chooses specialist
                    │  (no tools)     │
                    └────────┬────────┘
                             │ handoffs
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌─────────────┐ ┌─────────────┐
     │ History     │ │ Weather     │
     │ Agent       │ │ Agent       │
     │ (history    │ │ (weather    │
     │  tool)      │ │  tool)      │
     └─────────────┘ └─────────────┘
```

- **Orchestrator** – Single entry point. Has no tools; only **handoffs** to specialist agents. It decides whether the request is about history or weather and delegates.
- **History Agent** – Handles history questions and fun facts (uses `history_fun_fact` tool).
- **Weather Agent** – Handles weather questions (uses Weatherapi via `weather` tool).

The run is streamed so you see each step: which agent is active, tool calls, handoffs, and final output.

## Requirements

- Node.js 18+
- `OPENAI_API_KEY` in `.env` (or environment)
- Optional: `WEATHER_API_KEY` in `.env` (default uses a demo key)

## Setup

```bash
npm install
```

Create a `.env` file:

```env
OPENAI_API_KEY=sk-...
# optional
WEATHER_API_KEY=your_weatherapi_key
```

## Usage

**Interactive (prompt when no args):**

```bash
node index.js
# Prompt: what's the weather in mumbai
# or: tell me a fun history fact
```

**With prompt from CLI:**

```bash
node index.js "what weather today in mumbai"
node index.js -p "give me a fun history fact"
```

Output includes:

- **Run started** – Your prompt
- **Turn / Agent** – Which agent is running (Orchestrator → History or Weather)
- **Steps** – Tool calls, handoffs (`delegate to → …`), and message output
- **Final output** – Answer to the user
- **Token usage** – Input/output/total tokens and request count

## How handoffs work

1. User asks something (e.g. “weather in Mumbai” or “fun history fact”).
2. **Orchestrator** sees the request and chooses a specialist via a handoff (e.g. `transfer_to_Weather_Agent`).
3. The **specialist** runs with the same conversation context, uses its tools, and returns the answer.
4. That answer becomes the final output; the user sees one coherent reply.

## Project structure

- `index.js` – Entry point: CLI prompt, tool definitions, History/Weather agents, Orchestrator agent, `run()` with streaming and step logging.
- `.env` – API keys (not committed).

## License

ISC
