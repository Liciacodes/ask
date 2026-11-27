// web-push 4 ships no types, and @types/web-push describes version 3. These are the parts Ask uses.
declare module "web-push" {
  type PushSubscriptionKeys = { endpoint: string; keys: { p256dh: string; auth: string } }

  type RequestOptions = {
    vapidDetails: { subject: string; publicKey: string; privateKey: string }
    // Seconds a push service keeps the message for a device that's offline.
    TTL?: number
    urgency?: "very-low" | "low" | "normal" | "high"
    contentEncoding?: "aesgcm" | "aes128gcm"
  }

  // The encrypted request to send, with its VAPID, TTL and Urgency headers: Ask sends it itself.
  type RequestDetails = { method: string; endpoint: string; headers: Record<string, string>; body: Buffer | null }

  export function generateRequestDetails(subscription: PushSubscriptionKeys, payload: string, options: RequestOptions): RequestDetails
  export function generateVAPIDKeys(): { publicKey: string; privateKey: string }
}
