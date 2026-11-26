import type { Metadata } from "next"
import Link from "next/link"
import { Email, inlineLink, LegalPage } from "@/components/legal-page"
import { OWNER } from "@/components/site-footer"

export const metadata: Metadata = {
  title: "Terms · Ask",
  description: "The terms for using Ask, a free reminder assistant.",
}

export default function Terms() {
  return (
    <LegalPage title="Terms" page="terms">
      <p>
        These terms are the deal for using Ask, a free reminder assistant run by {OWNER.name}. By using Ask, you agree to them.
        The{" "}
        <Link href="/privacy" className={inlineLink}>
          privacy page
        </Link>{" "}
        says what Ask keeps about you.
      </p>

      <h2>Using Ask</h2>
      <ul>
        <li>Ask is free. You can use it as a guest, or sign in with Google to keep your reminders across devices.</li>
        <li>
          Use it for your own reminders. Don&apos;t use it to break the law or harm anyone, and don&apos;t try to break, overload
          or get around Ask&apos;s limits or security.
        </li>
        <li>The assistant has a daily limit on questions, which can change.</li>
      </ul>

      <h2>Your reminders</h2>
      <p>
        Your reminders are yours. You let Ask store them and work with them to run the service, including sending them to the
        AI provider when the assistant needs them, as the privacy page explains.
      </p>

      <h2>The assistant can be wrong</h2>
      <p>
        The assistant can misread you, or suggest the wrong day or time. Ask never changes anything until you say yes on its
        card, so check each card before you do.
      </p>

      <h2>No guarantees</h2>
      <p>
        Ask is provided as it is, with no promise that it will always work, always be available, or keep every reminder.
        Don&apos;t rely on it alone for anything important, such as medicine, payments or deadlines. As far as the law allows,{" "}
        {OWNER.name} isn&apos;t liable for any loss that comes from using Ask, or from Ask not working.
      </p>

      <h2>Changes, and stopping</h2>
      <p>
        Ask, and these terms, may change, and Ask may stop. If these terms change, the date at the top changes too. You can stop
        using Ask whenever you like, and have your data deleted as the privacy page explains. Anyone who breaks these terms may
        lose access to Ask.
      </p>

      <h2>Age</h2>
      <p>You need to be at least 18 to use Ask.</p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of Nigeria.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms go to <Email />.
      </p>
    </LegalPage>
  )
}
