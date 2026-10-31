"use client";

import React, { Component, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { formatDifficulty } from "../../lib/scenarios";
import { chooserCatalog, groupChooserItems, scenarioChooserHref, type ScenarioChooserItem } from "../../lib/scenario-chooser";

interface Props {
  current: ScenarioChooserItem;
  catalog?: readonly ScenarioChooserItem[] | null;
  onSelect: (slug: string) => void;
}

export class ScenarioChooserBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p role="status" className="text-sm text-slate-300">Scenario chooser unavailable. You can continue this scenario.</p>
      : this.props.children;
  }
}

export function ScenarioChooser({ current, catalog, onSelect }: Props) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [failed, setFailed] = useState(false);
  const [navigationError, setNavigationError] = useState(false);
  const items = useMemo(() => chooserCatalog(catalog), [catalog]);
  const groups = useMemo(() => groupChooserItems(items, query), [items, query]);
  const count = groups.reduce((total, group) => total + group.items.length, 0);

  useEffect(() => { if (results.current) results.current.scrollTop = 0; }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Native showModal makes the background inert; Tab edges are also
    // contained explicitly so focus cannot move into browser chrome.
    search.current?.focus();
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  function close() { dialog.current?.close(); }
  function show() {
    try {
      setQuery("");
      setNavigationError(false);
      dialog.current?.showModal();
      setOpen(true);
    } catch {
      setFailed(true);
    }
  }

  return <>
    <button ref={trigger} type="button" onClick={show} aria-haspopup="dialog" aria-controls={id}
      aria-expanded={open}
      className="min-h-11 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-left outline-none transition hover:border-teal-300/50 focus-visible:ring-2 focus-visible:ring-teal-300">
      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-teal-200">Change scenario</span>
      <span className="mt-1 block break-words text-sm font-semibold text-slate-100">{current.title}</span>
    </button>
    {failed ? <p role="status" className="text-sm text-slate-300">Scenario chooser unavailable. You can continue this scenario.</p> : null}
    <dialog ref={dialog} id={id} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), a[href]'
        ));
        const edge = event.shiftKey ? controls[0] : controls[controls.length - 1];
        if (document.activeElement === edge || !event.currentTarget.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? controls[controls.length - 1] : controls[0])?.focus();
        }
      }}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }}
      className="fixed inset-0 m-auto h-[calc(100dvh-1rem)] max-h-[48rem] w-[calc(100%-1rem)] max-w-3xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/80 sm:h-[80dvh] sm:rounded-3xl">
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="shrink-0 border-b border-slate-800 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={`${id}-title`} className="text-xl font-semibold">Change scenario</h2>
              <p id={`${id}-description`} className="mt-1 text-sm text-slate-400">Browse by title or domain. Closing keeps your current work.</p>
            </div>
            <button type="button" onClick={close} className="min-h-11 shrink-0 rounded-xl border border-slate-600 px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">Close</button>
          </div>
          <label htmlFor={`${id}-search`} className="mb-2 mt-4 block text-sm font-medium">Search scenarios</label>
          <input ref={search} id={`${id}-search`} type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            autoComplete="off" spellCheck={false} disabled={!items.length}
            className="min-h-11 w-full min-w-0 rounded-xl border border-slate-600 bg-slate-900 px-3 text-base outline-none focus:ring-2 focus:ring-teal-300" />
          <p role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-sm text-slate-400">
            {items.length ? `${count} ${count === 1 ? "scenario" : "scenarios"} found` : "Scenarios unavailable"}
          </p>
          {navigationError ? <p role="alert" className="mt-2 text-sm text-amber-200">Could not switch scenarios. Close to continue your current work.</p> : null}
        </div>
        <div ref={results} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:px-6" aria-label="Scenario results">
          {!items.length ? <div className="py-6">
            <h3 className="font-semibold">Scenarios unavailable</h3>
            <p className="mt-2 text-sm text-slate-400">Continue your current scenario and try again later.</p>
            <button type="button" onClick={close} className="mt-4 min-h-11 rounded-xl border border-slate-600 px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">Back to current scenario</button>
          </div> : count === 0 ? <div className="py-6">
            <h3 className="font-semibold">No matching scenarios</h3>
            <button type="button" onClick={() => { setQuery(""); search.current?.focus(); }} className="mt-3 min-h-11 rounded-xl border border-slate-600 px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">Clear search</button>
          </div> : groups.map((group) => <section key={group.domain} aria-labelledby={`${id}-${group.domain}`} className="mb-5 last:mb-0">
            <h3 id={`${id}-${group.domain}`} className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-teal-200">{group.label}</h3>
            <ul className="space-y-2">
              {group.items.map((item) => <li key={item.slug}>
                <a href={scenarioChooserHref(item.slug)} aria-current={item.slug === current.slug ? "page" : undefined}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    // Leave the chooser open if draft flushing fails; never discard work.
                    try { onSelect(item.slug); close(); } catch { setNavigationError(true); }
                  }}
                  className="flex min-h-11 min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-800 px-3 py-3 transition hover:border-slate-500 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-semibold">{item.title}</span>
                    <span className="mt-1 block text-xs text-slate-400">{group.label} · {formatDifficulty(item.difficulty)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    <span className={item.isFree ? "text-teal-200" : "text-amber-200"}>{item.isFree ? "Free" : "Premium"}</span>
                    {item.slug === current.slug ? <span className="text-slate-300">Current</span> : null}
                  </span>
                </a>
              </li>)}
            </ul>
          </section>)}
        </div>
      </div>
    </dialog>
  </>;
}
