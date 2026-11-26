"use client";

import { useEffect, useState } from "react";

type User = { name: string | null; email: string; picture: string | null };

// White, beside the dark "Ask anything" button.
const pill =
  "flex min-h-11.5 items-center gap-2 rounded-2xl bg-surface px-4 text-[15px] font-semibold text-ink shadow-button outline-offset-2 transition-transform duration-160 ease-out focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100";

// Signing in is optional: a guest sees "Sign in with Google", someone signed in sees who they are and "Sign out".
// The page is static, so it asks /api/auth/me who's here. After a failed sign-in Google's trip ends on
// /?signin=failed, which says so once and tidies the address.
export function Account() {
  // undefined while asking, so nothing flashes before the answer.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : { user: null }))
      .catch(() => ({ user: null }))
      .then(({ user }: { user: User | null }) => {
        if (!live) return;
        setUser(user);
        const url = new URL(window.location.href);
        if (url.searchParams.get("signin") === "failed") {
          setFailed(true);
          url.searchParams.delete("signin");
          window.history.replaceState(window.history.state, "", url);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const signOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => undefined);
    // A fresh page, so nothing of the account's week stays on screen.
    window.location.reload();
  };

  if (user === undefined) return <div className="min-h-11.5" />;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {failed && (
        <p role="status" className="text-[14px] font-semibold text-error">
          Couldn&apos;t sign in with Google. Try again.
        </p>
      )}
      {user ? (
        <>
          <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            {user.picture ? (
              // Google's own picture of them; no referrer, as Google asks.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-8.5 rounded-full" />
            ) : (
              <span aria-hidden="true" className="grid size-8.5 place-items-center rounded-full bg-avatar text-[14px] font-bold text-avatar-ink">
                {(user.name ?? user.email).charAt(0).toUpperCase()}
              </span>
            )}
            <span className="max-sm:sr-only">{user.name ?? user.email}</span>
          </span>
          <button type="button" onClick={signOut} className={pill}>
            Sign out
          </button>
        </>
      ) : (
        <a href="/api/auth/signin/google" className={pill}>
          Sign in with Google
        </a>
      )}
    </div>
  );
}
