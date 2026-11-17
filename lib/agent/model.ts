import { groq } from "@ai-sdk/groq"

// The one line to change to swap providers. Groq's production model with reliable tool calling;
// the provider reads GROQ_API_KEY from the environment, on the server only.
const agentModel = () => groq("openai/gpt-oss-120b")

export { agentModel }
