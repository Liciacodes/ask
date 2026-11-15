"use client";

import { useState } from "react";
import { CommandBar, CommandBarShortcut, keycap } from "@/components/command-bar/command-bar";
import type { Command } from "@/components/command-bar/commands";

export default function Home() {
  const [chosen, setChosen] = useState<Command | null>(null);

  return (
    <main className="flex flex-1 flex-col px-4 py-6">
      <h1 className="text-[15px] font-semibold">Ask</h1>
      <CommandBar
        onChoose={setChosen}
        className="flex flex-1 flex-col items-center justify-center gap-6 pb-[10vh] text-center"
      >
        <p className="text-[17px] text-hint">
          Press <CommandBarShortcut className={`${keycap} min-w-12 text-[13px]`} /> to open Ask
        </p>
        <p aria-live="polite" className="text-[15px]">
          {chosen ? (
            <>
              You chose <span className="-mx-1 rounded-[2px] px-1 highlighter">{chosen.label}</span>
            </>
          ) : (
            <span className="text-hint">Nothing chosen yet</span>
          )}
        </p>
      </CommandBar>
    </main>
  );
}
