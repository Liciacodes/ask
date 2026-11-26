import Link from "next/link"
import type { ReactNode } from "react"
import { OWNER, SiteFooter } from "./site-footer"

// The privacy and terms pages: plain words on the calm week's white board, with a way back to Ask. Static, with no
// script of their own, so reading them sets no cookie.
const UPDATED = "26 November 2026"

function LegalPage({ title, page, children }: { title: string; page: "privacy" | "terms"; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-190 flex-1 flex-col px-4 py-7">
      <Link
        href="/"
        className="inline-flex min-h-11.5 items-center gap-2 self-start rounded-2xl bg-surface px-4 text-[15px] font-semibold text-ink shadow-button outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span aria-hidden="true">←</span> Back to Ask
      </Link>
      <article className="mt-6 rounded-4xl bg-surface px-6 py-8 shadow-board sm:px-10 sm:py-10">
        <h1 className="text-[30px] leading-tight font-semibold tracking-[-0.015em]">{title}</h1>
        <p className="mt-2 text-[14px] text-muted">Last updated {UPDATED}</p>
        <div className="mt-6 flex flex-col gap-4 text-[16px] leading-relaxed [&_h2]:mt-4 [&_h2]:text-[19px] [&_h2]:font-semibold [&_strong]:font-semibold [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">
          {children}
        </div>
      </article>
      <SiteFooter current={page} className="mt-6" />
    </main>
  )
}

// A link inside the words: underlined in grey, ink on hover, with the keyboard's focus ring.
const inlineLink =
  "font-semibold text-ink underline decoration-muted underline-offset-4 outline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-accent"

// The contact address, as a link that opens an email to it.
function Email() {
  return (
    <a href={`mailto:${OWNER.email}`} className={inlineLink}>
      {OWNER.email}
    </a>
  )
}

export { Email, inlineLink, LegalPage }
