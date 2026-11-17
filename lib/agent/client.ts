import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai"
import type { AgentMessage } from "./agent"

type AgentChatOptions = { timezone: () => string; fetch?: typeof globalThis.fetch }

// How the bar talks to /api/agent, shared with the tests. The route accepts exactly these two fields,
// so the transport's own extras (the chat id, what triggered the request) are left out.
function agentChat({ timezone, fetch }: AgentChatOptions) {
  return {
    transport: new DefaultChatTransport<AgentMessage>({
      api: "/api/agent",
      fetch,
      prepareSendMessagesRequest: ({ messages }) => ({ body: { messages, timezone: timezone() } }),
    }),
    // Once every waiting card has an answer, the conversation goes back to the server, which runs what you approved.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  }
}

export { agentChat }
