"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { CommandBar, CommandBarShortcut, keycap } from "@/components/command-bar/command-bar";
import type { Command } from "@/components/command-bar/commands";
import type { Done } from "@/components/command-bar/use-agent";
import { cardRects, playArrival, playMark } from "@/components/week/arrival";
import { weekDays, whenOf } from "@/components/week/days";
import { useWeek } from "@/components/week/use-week";
import { Week, WeekNote } from "@/components/week/week";
import type { ReminderJson } from "@/lib/reminders";

type Outcome = { chosen: Command } | { saved: ReminderJson } | { agent: Done } | null;

const marked = "-mx-1 rounded-[2px] px-1 highlighter";

function AgentOutcome({ done, reminder }: Done) {
  const title = <span className={marked}>{reminder.title}</span>;
  if (done === "create") return <>Saved {title} for {whenOf(reminder)}</>;
  if (done === "change") return <>Changed {title}, now {whenOf(reminder)}</>;
  if (done === "cancel") return <>Cancelled {title}</>;
  return <>Brought back {title} for {whenOf(reminder)}</>;
}

// The server can't know the reader's timezone or today's date there, so the week renders once the browser can say.
let browser: { timezone: string; now: Date } | undefined;
const readBrowser = () => (browser ??= { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, now: new Date() });
const nothingOnServer = () => null;
const neverChanges = () => () => {};

export default function Home() {
  const [outcome, setOutcome] = useState<Outcome>(null);
  const here = useSyncExternalStore(neverChanges, readBrowser, nothingOnServer);
  const timezone = here?.timezone ?? null;
  const week = here ? weekDays(here.now, here.timezone) : null;
  const { state, retry, put } = useWeek(timezone);
  const [newest, setNewest] = useState<string | null>(null);
  const weekList = useRef<HTMLOListElement>(null);
  const arriving = useRef<{ id: string; from: DOMRect; before: ReturnType<typeof cardRects> } | null>(null);
  const marking = useRef<string | null>(null);
  const stopArrival = useRef<(() => void) | null>(null);

  // Once the new card is in the week, fly it in (or, from a conversation, mark it) before the browser paints it.
  useLayoutEffect(() => {
    const arrival = arriving.current;
    const mark = marking.current;
    if (!weekList.current) return;
    if (arrival) {
      arriving.current = null;
      stopArrival.current = playArrival({ week: weekList.current, ...arrival });
    } else if (mark) {
      marking.current = null;
      stopArrival.current?.();
      stopArrival.current = playMark({ week: weekList.current, id: mark });
    }
  }, [state]);

  const inThisWeek = (reminder: ReminderJson) =>
    week !== null && reminder.due_at >= week.from.toISOString() && reminder.due_at < week.to.toISOString();

  const shortcut = <CommandBarShortcut className={`${keycap} min-w-11 text-[12px]`} />;

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-4 py-6 md:px-8 md:py-8">
      <CommandBar
        onChoose={(chosen) => setOutcome({ chosen })}
        onReminderSaved={(saved, from) => {
          const flies = inThisWeek(saved);
          if (flies && weekList.current) {
            stopArrival.current?.();
            arriving.current = { id: saved.id, from, before: cardRects(weekList.current) };
          }
          // The save answer arrives outside any key or click, so React would render it a frame or more later.
          // Render now, so the card flies in the same moment the bar starts to fade.
          flushSync(() => {
            setOutcome({ saved });
            if (flies) {
              setNewest(saved.id);
              put(saved, true);
            }
          });
        }}
        onAgentDone={(result) => {
          // A cancelled reminder leaves the week; anything else shows on its day, if that day is this week.
          const shows = result.reminder.status !== "cancelled" && inThisWeek(result.reminder);
          setOutcome({ agent: result });
          put(result.reminder, shows);
          if (shows) {
            setNewest(result.reminder.id);
            marking.current = result.reminder.id;
          }
        }}
        className="flex flex-1 flex-col"
      >
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-[15px] font-semibold">Ask</h1>
          <p className="text-[13px] text-hint">Press {shortcut} to open Ask</p>
        </header>
        <section aria-labelledby="week-title" className="mt-8 flex flex-1 flex-col">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 id="week-title" className="text-[24px] font-semibold tracking-[-0.01em]">
              This week
            </h2>
            {week && <p className="text-[15px] text-hint">{week.range}</p>}
          </div>
          <div className="mt-1 flex min-h-6 flex-wrap items-center gap-x-5 gap-y-1 text-[14px]">
            <p role="status" className="empty:-me-5">
              {outcome && "chosen" in outcome && (
                <>
                  You chose <span className={marked}>{outcome.chosen.label}</span>
                </>
              )}
              {outcome && "saved" in outcome && (
                <>
                  Saved <span className={marked}>{outcome.saved.title}</span> for {whenOf(outcome.saved)}
                </>
              )}
              {outcome && "agent" in outcome && <AgentOutcome {...outcome.agent} />}
            </p>
            {week && (
              <WeekNote
                state={state}
                onRetry={retry}
                emptyHint={<>Nothing due this week. Press {shortcut} to create a reminder.</>}
              />
            )}
          </div>
          {week && timezone && <Week ref={weekList} days={week.days} timezone={timezone} state={state} marked={newest} />}
        </section>
      </CommandBar>
    </main>
  );
}
