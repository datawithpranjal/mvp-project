"use client";

import { useEffect, useRef, useState } from "react";
import { byteLength, GCP_EDITOR_BYTES, type PubsubAction } from "./gcp-pubsub";
import { GCP_SAVE_KEY, initialPubsubSession, readPubsubSave, writePubsubSave,
  type PubsubDraft, type PubsubSession } from "./gcp-pubsub-session";
import { startPubsubRun } from "./gcp-pubsub-runner";

const statusMessages = {
  ResetConfirmed: "Baseline reset. Start with the pending publications.",
  Ignored: "Confirmed state retained.",
  NoMessages: "No messages. The pending queue is empty.",
  ExpiredForRetry: "Deadline expired. Retry the current message.",
  SinkFailed: "Simulated sink failure before write.",
  CrashedAfterCommit: "Simulated crash after the sink decision.",
  Succeeded: "Delivery processed."
};

export function useGcpPubsub() {
  const [session, setSession] = useState(initialPubsubSession);
  const current = useRef(session);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef<{ cancel: () => void } | null>(null);
  const requestId = useRef(0);
  const [notice, setNotice] = useState({ text: "Edit the policy or process the first pending delivery.", error: false });
  const [restored, setRestored] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [deviceMessage, setDeviceMessage] = useState("Reading this device’s saved copy…");
  const [deviceError, setDeviceError] = useState(false);
  const [invalidSave, setInvalidSave] = useState(false);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [conflict, setConflict] = useState<{ raw: string | null } | null>(null);
  const knownRaw = useRef<string | null>(null);
  const storageEpoch = useRef(0);

  function replace(next: PubsubSession, edited: boolean) {
    current.current = next;
    setSession(next);
    dirtyRef.current = edited;
    setDirty(edited);
  }
  function invalidateWorker() {
    requestId.current++;
    active.current?.cancel();
    active.current = null;
  }
  function stop() {
    invalidateWorker();
    setBusy(false);
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GCP_SAVE_KEY);
      knownRaw.current = raw;
      if (raw === null) {
        setDeviceMessage("Save explicitly to keep this run on this device.");
      } else {
        try {
          replace(readPubsubSave(raw), false);
          setRestored(true);
          setDeviceMessage("Restored this device’s saved drafts and confirmed state. The saved trace is historical.");
        } catch (error) {
          setInvalidSave(true);
          setRecoveryRequired(true);
          setDeviceError(true);
          setDeviceMessage(`${(error as Error).message} Review the saved-copy error before starting a clean baseline.`);
        }
      }
    } catch {
      setDeviceError(true);
      setDeviceMessage("Device storage is unavailable. You can practise in this tab.");
    }
    setReady(true);
    function storageChanged(event: StorageEvent) {
      if (event.key !== GCP_SAVE_KEY && event.key !== null) return;
      storageEpoch.current++;
      const raw = event.key === null ? null : event.newValue;
      setConflict(raw === knownRaw.current ? null : { raw });
    }
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("storage", storageChanged);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      invalidateWorker();
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  function edit(patch: Partial<PubsubDraft>) {
    for (const field of ["sourceText", "policyText"] as const) {
      const text = patch[field];
      if (text !== undefined && byteLength(text) > GCP_EDITOR_BYTES) {
        setNotice({ text: `${field === "sourceText" ? "SOURCE" : "POLICY"}: draft exceeds 60,000 bytes. Previous draft retained.`, error: true });
        return;
      }
    }
    stop();
    replace({ ...current.current, draft: { ...current.current.draft, ...patch } }, true);
    setNotice({ text: "Draft updated. Earlier writes and ACKs remain in the confirmed state.", error: false });
  }

  function run(action: PubsubAction) {
    if (!ready || recoveryRequired || active.current) return;
    if (action === "reset_confirmed" && !window.confirm("Reset the run using the current source and policy drafts? This clears the current ledger, ACKs and trace. The saved copy stays as it is until Save.")) return;
    const id = ++requestId.current;
    const snapshot = current.current;
    const { sourceText, policyText, fault, messageId } = snapshot.draft;
    setBusy(true);
    setNotice({ text: "Starting the simulation worker…", error: false });
    active.current = startPubsubRun({ id, action, sourceText, policyText, fault, messageId, run: snapshot.run }, outcome => {
      if (id !== requestId.current || snapshot !== current.current) return;
      active.current = null;
      setBusy(false);
      if (outcome.kind === "reply") {
        if (outcome.reply.kind === "error") {
          setNotice({ text: outcome.reply.message, error: true });
          return;
        }
        const { run: next, trace } = outcome.reply;
        if (trace.status !== "NoMessages" && trace.status !== "Ignored") {
          replace({ draft: snapshot.draft, run: next }, true);
          setRestored(false);
        }
        setNotice({ text: statusMessages[trace.status], error: false });
        return;
      }
      const text = outcome.kind === "resource" ? outcome.message
        : outcome.kind === "load-timeout" ? "The worker did not load within 5 seconds. Try again."
        : outcome.kind === "execution-timeout" ? "The worker reached its 1-second execution limit."
        : outcome.kind === "cancelled" ? "Simulation cancelled."
        : "Worker unavailable. Try again.";
      setNotice({ text: `${text} Confirmed effects are retained.`, error: outcome.kind !== "cancelled" });
    });
  }
  function cancel() {
    stop();
    setNotice({ text: "Simulation cancelled. Confirmed effects are retained.", error: false });
  }

  function saveAgainst(expected: string | null) {
    if (recoveryRequired || active.current) return;
    try {
      const raw = writePubsubSave(current.current, crypto.randomUUID());
      const latest = localStorage.getItem(GCP_SAVE_KEY);
      if (latest !== expected) {
        setConflict({ raw: latest });
        return;
      }
      localStorage.setItem(GCP_SAVE_KEY, raw);
      knownRaw.current = raw;
      setConflict(null);
      setDeviceError(false);
      setInvalidSave(false);
      dirtyRef.current = false;
      setDirty(false);
      setDeviceMessage("Saved drafts, confirmed effects and trace on this device.");
    } catch (error) {
      setDeviceError(true);
      setDeviceMessage(`Could not save. ${error instanceof Error && error.message.startsWith("RESOURCE:") ? error.message : "Device storage may be full or unavailable."} Current drafts and effects are retained.`);
    }
  }

  // Confirm against the same bytes and current editor state, then yield to queued
  // storage events before acting on the decision.
  async function confirmDevice(expected: string | null, prompt: string, perform: () => void) {
    const before = current.current, epoch = storageEpoch.current, id = requestId.current;
    if (!window.confirm(prompt)) return;
    await new Promise(resolve => window.setTimeout(resolve, 0));
    try {
      const latest = localStorage.getItem(GCP_SAVE_KEY);
      if (latest !== expected || epoch !== storageEpoch.current || before !== current.current || id !== requestId.current) {
        setConflict(latest === knownRaw.current ? null : { raw: latest });
        setDeviceError(true);
        setDeviceMessage("The saved copy or current run changed during confirmation. Review the latest state and choose again.");
        return;
      }
      perform();
    } catch {
      setDeviceError(true);
      setDeviceMessage("Device storage is unavailable. Current drafts and effects are retained.");
    }
  }
  function keepCurrent() {
    if (!conflict || recoveryRequired || busy) return;
    const { raw } = conflict;
    void confirmDevice(raw, "Replace the other saved copy with your current run and drafts?", () => saveAgainst(raw));
  }
  function loadOther() {
    if (!conflict || conflict.raw === null || busy) return;
    const { raw } = conflict;
    let next: PubsubSession;
    try { next = readPubsubSave(raw); }
    catch (error) {
      setInvalidSave(true);
      setDeviceError(true);
      setDeviceMessage(`${(error as Error).message} Current drafts and effects are retained.`);
      return;
    }
    void confirmDevice(raw, "Replace the current run and drafts with the other saved copy?", () => {
      stop();
      replace(next, false);
      knownRaw.current = raw;
      setRestored(true);
      setInvalidSave(false);
      setRecoveryRequired(false);
      setDeviceError(false);
      setConflict(null);
      setNotice({ text: "Saved run restored. Its trace is historical.", error: false });
      setDeviceMessage("Loaded the other saved copy.");
    });
  }
  function recoverBaseline() {
    if (!invalidSave || busy) return;
    const raw = conflict ? conflict.raw : knownRaw.current;
    void confirmDevice(raw, "Start a clean run with the original example and starter policy? This replaces current in-tab drafts and effects. The saved copy stays as it is until Save.", () => {
      stop();
      replace(initialPubsubSession(), true);
      knownRaw.current = raw;
      setConflict(null);
      setInvalidSave(false);
      setRecoveryRequired(false);
      setDeviceError(false);
      setRestored(false);
      setNotice({ text: "Clean baseline ready.", error: false });
      setDeviceMessage("Clean baseline started. Save explicitly to replace the invalid saved copy.");
    });
  }
  return { session, ready, busy, notice, restored, dirty, deviceMessage, deviceError, invalidSave,
    recoveryRequired, conflict, edit, run, cancel, save: () => saveAgainst(knownRaw.current), keepCurrent,
    loadOther, recoverBaseline };
}
