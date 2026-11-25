"use client";

import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { Account } from "@/components/account";
import { CommandBar, CommandBarShortcut, CommandBarTrigger, keycap, type CommandBarHandle } from "@/components/command-bar/command-bar";
import { CalendarIcon, SparkleIcon } from "@/components/command-bar/icons";
import type { Command } from "@/components/command-bar/commands";
import type { Done, Proposal } from "@/components/command-bar/use-agent";
import { cardRects, playArrival, playFadeIn } from "@/components/week/arrival";
import { localWhen, weekDays, whenOf, type Day } from "@/components/week/days";
import { useWeek } from "@/components/week/use-week";
import { Week, WeekNote, type Dashed } from "@/components/week/week";
import type { ReminderJson } from "@/lib/reminders";
import { localDateTime } from "@/lib/time";

type Outcome =
  | { chosen: Command }
  | { saved: ReminderJson }
  | { agent: Done }
  | { moved: ReminderJson }
  | { notMoved: { title: string; reason: string } }
  | { deleted: ReminderJson }
  | null;

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

const marked = "-mx-1 rounded-[2px] px-1 highlighter";

function AgentOutcome({ done, reminder }: Done) {
  const title = <span className={marked}>{reminder.title}</span>;
  if (done === "create") return <>Saved {title} for {whenOf(reminder)}</>;
  if (done === "change") return <>Changed {title}, now {whenOf(reminder)}</>;
  if (done === "cancel") return <>Cancelled {title}</>;
  return <>Brought back {title} for {whenOf(reminder)}</>;
}

// Where the week shows a card the bar is waiting on: a new reminder or a change, on a day of this week. Cancel and
// restore show nothing.
function dashedFor(proposal: Proposal | null, days: Day[] | undefined): Dashed | null {
  if (!proposal || !days) return null;
  const { preview } = proposal;
  if (preview.action !== "create" && preview.action !== "change") return null;
  const card = preview.action === "create" ? preview.reminder : preview.after;
  if (!days.some((day) => day.key === card.date)) return null;
  return { id: proposal.id, title: card.title, category: card.category, day: card.date, time: card.time, replaces: proposal.replaces };
}

// The hint line under the bar's card says where the dashed card is.
function dashedHint(dashed: Dashed | null, days: Day[] | undefined) {
  if (!dashed) return undefined;
  if (days?.find((day) => day.key === dashed.day)?.today) return "the dashed card today shows where it will go";
  return `the dashed card on ${localWhen({ date: dashed.day, time: dashed.time }).weekday} shows where it will go`;
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
  const { state, retry, put, move, saving } = useWeek(timezone);
  const [newest, setNewest] = useState<string | null>(null);
  const weekList = useRef<HTMLOListElement>(null);
  const commandBar = useRef<CommandBarHandle>(null);
  const arriving = useRef<{ id: string; from: DOMRect; before: ReturnType<typeof cardRects> } | null>(null);
  const fading = useRef<string | null>(null);
  const stopArrival = useRef<(() => void) | null>(null);

  // The card the bar is waiting on, kept while its id stays the same: the bar reports a new object every render.
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const propose = useCallback((next: Proposal | null) => setProposal((was) => (was?.id === next?.id ? was : next)), []);
  const [barOpen, setBarOpen] = useState(false);
  // The reminder a yes has just saved in a dashed card's place, while that card fills to solid.
  const [landing, setLanding] = useState<string | null>(null);
  const landed = useCallback(() => setLanding(null), []);
  const dashed = dashedFor(proposal, week?.days);

  // Once the new card is in the week, fly it in (or, from a conversation with no dashed card, fade it in) before the
  // browser paints it.
  useLayoutEffect(() => {
    const arrival = arriving.current;
    const fade = fading.current;
    if (!weekList.current) return;
    if (arrival) {
      arriving.current = null;
      stopArrival.current = playArrival({ week: weekList.current, ...arrival });
    } else if (fade) {
      fading.current = null;
      stopArrival.current?.();
      stopArrival.current = playFadeIn({ week: weekList.current, id: fade });
    }
  }, [state]);

  const inThisWeek = (reminder: ReminderJson) =>
    week !== null && reminder.due_at >= week.from.toISOString() && reminder.due_at < week.to.toISOString();

  const shortcut = <CommandBarShortcut className={`${keycap} min-w-11 text-[12px]`} />;

  return (
    <main className="mx-auto flex w-full max-w-[1272px] flex-1 flex-col px-4 py-6">
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
          if (!shows) return;
          setNewest(result.reminder.id);
          // The dashed card becomes the saved one in its place; without one, the card fades in.
          const at = timezone ? localDateTime(new Date(result.reminder.due_at), timezone) : null;
          if (dashed && at?.date === dashed.day && at.time === dashed.time) setLanding(result.reminder.id);
          else fading.current = result.reminder.id;
        }}
        onReminderChanged={(reminder) => {
          // Saved from the form after a click on its card: it changes in place, or moves to its new day.
          const shows = inThisWeek(reminder);
          setOutcome({ agent: { done: "change", reminder } });
          put(reminder, shows);
          if (shows) setNewest(reminder.id);
        }}
        onReminderDeleted={(reminder) => {
          setOutcome({ deleted: reminder });
          put(reminder, false);
        }}
        ref={commandBar}
        onProposal={propose}
        onOpenChange={setBarOpen}
        dashedHint={dashedHint(dashed, week?.days)}
        className="flex flex-1 flex-col"
      >
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-fill text-on-accent">
              <CalendarIcon className="size-5" />
            </span>
            {week && <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.02em]">{week.title}</h1>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <CommandBarTrigger className="flex min-h-11 items-center gap-2.5 rounded-full bg-accent-fill py-1 pr-2 pl-4 text-[14px] font-bold text-on-accent outline-offset-2 transition-transform duration-160 ease-out focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100">
              <SparkleIcon className="size-4" />
              Ask anything
              <CommandBarShortcut className="min-w-11 rounded-full bg-white/10 px-2.5 py-1 text-center font-sans text-[12px] font-bold" />
            </CommandBarTrigger>
            <Account />
          </div>
        </header>
        <section aria-labelledby="week-title" className="mt-5 flex flex-1 flex-col">
          {/* The month title and each day's date say which week it is; this names it for screen readers. */}
          <h2 id="week-title" className="sr-only">
            This week{week && `, ${week.range}`}
          </h2>
          <div className="flex min-h-6 flex-wrap items-center gap-x-5 gap-y-1 text-[14px]">
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
              {outcome && "moved" in outcome && (
                <>
                  Moved <span className={marked}>{outcome.moved.title}</span> to {whenOf(outcome.moved)}
                </>
              )}
              {outcome && "deleted" in outcome && (
                <>
                  Deleted: <span className={marked}>{outcome.deleted.title}</span>
                </>
              )}
              {outcome && "notMoved" in outcome && (
                <>
                  Couldn&apos;t move <span className={marked}>{outcome.notMoved.title}</span>: {sentence(outcome.notMoved.reason)}
                </>
              )}
            </p>
            {week && (
              <WeekNote
                state={state}
                onRetry={retry}
                emptyHint={<>Nothing due this week. Press {shortcut} to create a reminder.</>}
              />
            )}
          </div>
          {week && timezone && (
            <Week
              ref={weekList}
              days={week.days}
              timezone={timezone}
              state={state}
              newest={newest}
              saving={saving}
              dashed={dashed}
              landing={landing}
              onLanded={landed}
              barOpen={barOpen}
              onOpen={(reminder) => commandBar.current?.edit(reminder)}
              onMove={async (reminder, day) => {
                const result = await move(reminder, day);
                setOutcome(result.ok ? { moved: result.reminder } : { notMoved: { title: reminder.title, reason: result.reason } });
              }}
            />
          )}
        </section>
      </CommandBar>
    </main>
  );
}
