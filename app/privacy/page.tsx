import type { Metadata } from "next"
import Link from "next/link"
import { Email, inlineLink, LegalPage } from "@/components/legal-page"
import { OWNER } from "@/components/site-footer"

export const metadata: Metadata = {
  title: "Privacy · Ask",
  description: "What Ask keeps about you, why, who else handles it, and how to have it deleted.",
}

export default function Privacy() {
  return (
    <LegalPage title="Privacy" page="privacy">
      <p>
        Ask is a reminder assistant run by {OWNER.name}. This page says what Ask keeps about you, why, who else handles it, and how
        to have it deleted. Questions go to <Email />.
      </p>

      <h2>What Ask keeps</h2>
      <ul>
        <li>
          <strong>Your reminders:</strong> each one&apos;s title, note, date and time, time zone, category, and whether it&apos;s
          waiting, sent, failed or cancelled.
        </li>
        <li>
          <strong>A visitor cookie:</strong> a random ID that keeps your reminders yours without an account. It lasts up to 400
          days, the page&apos;s own scripts can&apos;t read it, and it&apos;s only set when Ask&apos;s server is asked for
          something.
        </li>
        <li>
          <strong>If you sign in with Google:</strong> your Google account ID, email address, name and profile picture. Ask asks
          Google for nothing else: not your password, your contacts or your calendar. Signing in moves the reminders you made as
          a guest into your account.
        </li>
        <li>
          <strong>Sign-in cookies:</strong> one keeps you signed in for 30 days, and Ask stores only a scrambled form of it, so
          the database alone can&apos;t sign anyone in. Signing out deletes it. While you sign in, another lasts 10 minutes to
          check that the sign-in really came from you.
        </li>
        <li>
          <strong>Daily counts:</strong> how many questions you&apos;ve asked the assistant each day, so that everyone gets a fair
          share of its daily limit.
        </li>
      </ul>

      <h2>The assistant</h2>
      <p>
        When you ask the assistant something, your message, the earlier messages in that conversation, your time zone, and the
        details of any reminders it looks up are sent to Groq, which runs the AI model that writes the answer. Groq handles them
        under its own privacy policy, and its servers may be outside your country. Nothing changes in your reminders until you
        say yes on the assistant&apos;s card. Making a reminder with the form doesn&apos;t involve the assistant at all.
      </p>

      <h2>Who else handles your data</h2>
      <ul>
        <li>
          <strong>Vercel</strong> hosts Ask. Its servers for Ask run in Frankfurt, Germany.
        </li>
        <li>
          <strong>Neon</strong> stores Ask&apos;s database, also in Frankfurt.
        </li>
        <li>
          <strong>Groq</strong> runs the assistant, as above.
        </li>
        <li>
          <strong>Google</strong> handles sign-in, if you choose it. &ldquo;Add to Google Calendar&rdquo; takes a reminder to
          Google only when you click it, and you save it there yourself.
        </li>
      </ul>
      <p>Ask has no ads and no analytics or tracking, and it doesn&apos;t sell your data or share it with anyone else.</p>

      <h2>How long it&apos;s kept</h2>
      <ul>
        <li>
          Reminders stay until you delete them. Cancelling one keeps it, so it can be brought back; &ldquo;Delete reminder&rdquo;
          removes it for good.
        </li>
        <li>Sign-in sessions end after 30 days, or when you sign out.</li>
        <li>An account stays until you ask for it to be deleted.</li>
        <li>
          If you clear your browser&apos;s cookies as a guest, Ask can no longer tell that your guest reminders are yours, so
          delete any you want gone first.
        </li>
      </ul>

      <h2>Deleting everything</h2>
      <p>
        You can delete any reminder yourself: click it in your week, then &ldquo;Delete reminder&rdquo;. To delete your whole
        account, email <Email /> from the address you sign in with. Your account, its reminders and its sessions will be
        deleted within 30 days, and you&apos;ll get a reply when it&apos;s done. Email the same address with any other question
        about your data.
      </p>

      <h2>Children</h2>
      <p>Ask isn&apos;t meant for anyone under 18, and doesn&apos;t knowingly keep anything about them.</p>

      <h2>Changes</h2>
      <p>
        If this page changes, the date at the top changes too. The{" "}
        <Link href="/terms" className={inlineLink}>
          terms
        </Link>{" "}
        say what you agree to when you use Ask.
      </p>
    </LegalPage>
  )
}
