import { groq } from "@ai-sdk/groq"

// The one line to change to swap providers. Groq's production model with reliable tool calling;
// the provider reads GROQ_API_KEY from the environment, on the server only.
const groqModel = () => groq("openai/gpt-oss-120b")

// Groq is paid for, so nothing reaches it by accident. Inside Vitest the real model needs ALLOW_REAL_GROQ=1, which
// only `npm run test:live` passes on, so a fake model that silently fails to apply can't fall through to Groq.
// Every other test run empties GROQ_API_KEY, and an empty key stops here: the provider would still send the request.
function agentModel() {
  if (process.env.VITEST && process.env.ALLOW_REAL_GROQ !== "1") {
    throw new Error("A test reached the real model. Tests use a fake one; only `npm run test:live` with ALLOW_REAL_GROQ=1 calls Groq.")
  }
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is empty, so Ask can't reach Groq.")
  return groqModel()
}

export { agentModel }
