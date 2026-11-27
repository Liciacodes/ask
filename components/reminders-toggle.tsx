"use client";

import { useEffect, useState } from "react";
import { BellIcon } from "@/components/command-bar/icons";

// "Turn on reminders": a notification at each reminder's time, even with no Ask tab open. Nothing is asked on page
// load; only the button asks the browser for permission, registers the service worker (public/sw.js), subscribes
// with Ask's VAPID key and saves the subscription. "Turn off reminders" undoes it.

type State = "checking" | "unsupported" | "install" | "blocked" | "off" | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

const button =
  "flex min-h-11.5 items-center gap-2 rounded-2xl bg-surface px-4 text-[15px] font-semibold text-ink shadow-button outline-offset-2 transition-transform duration-160 ease-out focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97] disabled:opacity-70 motion-reduce:transition-none motion-reduce:active:scale-100";
const note = "max-w-72 text-[13px] font-medium text-muted";

// The key as the Push API wants it: bytes, from the base64url text it's kept in.
function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

// An iPhone or iPad shows notifications only for a web app added to its Home Screen.
function onAppleOutsideHomeScreen() {
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return apple && !standalone;
}

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Boolean(VAPID_PUBLIC_KEY);

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export function RemindersToggle() {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Only looks: what the browser already allows and has. Nothing here asks the person anything.
  useEffect(() => {
    let live = true;
    const settle = (next: State) => {
      if (live) setState(next);
    };
    (async () => {
      if (onAppleOutsideHomeScreen()) return settle("install");
      if (!supported()) return settle("unsupported");
      if (Notification.permission === "denied") return settle("blocked");
      settle((await currentSubscription()) ? "on" : "off");
    })().catch(() => settle("off"));
    return () => {
      live = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setProblem(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") return setState("blocked");
      if (permission !== "granted") return setProblem("Reminders stay off until you allow notifications.");
      await navigator.serviceWorker.register("/sw.js");
      const { pushManager } = await navigator.serviceWorker.ready;
      const subscription =
        (await pushManager.getSubscription()) ??
        (await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY!) }));
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        await subscription.unsubscribe().catch(() => undefined);
        return setProblem("Ask couldn't turn on reminders. Try again.");
      }
      setState("on");
    } catch {
      setProblem("Ask couldn't turn on reminders. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setProblem(null);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await fetch("/api/push/subscriptions", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        // Even if Ask didn't hear, the push service now answers "gone", and Ask forgets it at the next reminder.
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setProblem("Ask couldn't turn off reminders. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") return <div className="min-h-11.5" />;
  if (state === "unsupported") return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {state === "install" && (
        <p role="status" className={note}>
          To get reminders on this device, add Ask to your Home Screen: tap Share, then Add to Home Screen.
        </p>
      )}
      {state === "blocked" && (
        <p role="status" className={note}>
          Notifications are blocked for Ask. Allow them in your browser&apos;s settings to get reminders.
        </p>
      )}
      {(state === "off" || state === "on") && (
        <button type="button" onClick={state === "off" ? turnOn : turnOff} disabled={busy} className={button}>
          <BellIcon className="size-4 shrink-0" />
          {state === "off" ? "Turn on reminders" : "Turn off reminders"}
        </button>
      )}
      {problem && (
        <p role="status" className="text-[14px] font-semibold text-error">
          {problem}
        </p>
      )}
    </div>
  );
}
