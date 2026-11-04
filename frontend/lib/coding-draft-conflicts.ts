type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface CodingDraftConflict {
  localCode: string;
  savedCode?: string;
  recoverySaved: boolean;
}

/** Per-tab edit state. Shared storage is a saved version, never an editor buffer. */
export class CodingDraftSession {
  private baseline: Record<string, string> = {};
  private edits: Record<string, string> = {};
  private pending: Record<string, CodingDraftConflict> = {};
  private readonly recoveryKey: string;

  constructor(readonly scope: string, private readonly storage?: RecoveryStorage) {
    this.recoveryKey = `data-foundry-coding-draft-conflicts-v1:${scope}`;
    try {
      const recovery: unknown = JSON.parse(storage?.getItem(this.recoveryKey) ?? "{}");
      if (!recovery || typeof recovery !== "object") return;
      for (const [slug, value] of Object.entries(recovery)) {
        if (!value || typeof value !== "object") continue;
        const item = value as Partial<CodingDraftConflict>;
        if (typeof item.localCode !== "string") continue;
        if (item.savedCode !== undefined && typeof item.savedCode !== "string") continue;
        this.edits[slug] = item.localCode;
        this.pending[slug] = { localCode: item.localCode, savedCode: item.savedCode, recoverySaved: true };
      }
    } catch {
      // An unavailable recovery store must not prevent editing or hydration.
    }
  }

  get conflicts(): Record<string, CodingDraftConflict> {
    return { ...this.pending };
  }

  edit(slug: string, code: string): void {
    if (code === this.baseline[slug] && !this.pending[slug]) delete this.edits[slug];
    else this.edits[slug] = code;
    if (this.pending[slug]) {
      this.pending[slug] = { ...this.pending[slug], localCode: code };
      this.persistRecovery();
    }
  }

  reconcile(saved: Record<string, string>): Record<string, string> {
    const next = { ...saved };
    let recoveryChanged = false;
    for (const [slug, code] of Object.entries(this.edits)) {
      const incoming = saved[slug];
      if (incoming === code) {
        delete this.edits[slug];
        delete this.pending[slug];
        recoveryChanged = true;
      } else {
        next[slug] = code;
        if (this.pending[slug] || incoming !== this.baseline[slug]) {
          const previous = this.pending[slug];
          if (!previous || previous.localCode !== code || previous.savedCode !== incoming) {
            this.pending[slug] = { localCode: code, savedCode: incoming, recoverySaved: false };
            recoveryChanged = true;
          }
        }
      }
    }
    this.baseline = { ...saved };
    if (recoveryChanged) this.persistRecovery();
    return next;
  }

  canAutosave(slug: string, code: string): boolean {
    return this.edits[slug] === code && !this.pending[slug];
  }

  saved(slug: string, code: string): void {
    this.baseline[slug] = code;
    // A late acknowledgement must not mark a newer edit as saved.
    if (this.edits[slug] === code) {
      delete this.edits[slug];
      delete this.pending[slug];
      this.persistRecovery();
    }
  }

  useSaved(slug: string, expectedSavedCode?: string): { code: string | undefined } | null {
    const conflict = this.pending[slug];
    if (!conflict || conflict.savedCode !== expectedSavedCode) return null;
    const code = conflict.savedCode;
    delete this.edits[slug];
    delete this.pending[slug];
    this.persistRecovery();
    return { code };
  }

  private persistRecovery(): void {
    let recoverySaved = false;
    try {
      if (this.storage) {
        if (Object.keys(this.pending).length) this.storage.setItem(this.recoveryKey, JSON.stringify(this.pending));
        else this.storage.removeItem(this.recoveryKey);
        recoverySaved = true;
      }
    } catch {
      // Keep both versions in memory and disclose that reload recovery is unavailable.
    }
    for (const slug of Object.keys(this.pending)) this.pending[slug] = { ...this.pending[slug], recoverySaved };
  }
}

/** Refresh may clear a pending choice when saved/editor versions converge. */
export function chooseSavedCodingDraft(
  slug: string,
  previous: CodingDraftConflict | undefined,
  refresh: () => CodingDraftSession
): { code: string | undefined } | null {
  if (!previous) return null;
  return refresh().useSaved(slug, previous.savedCode);
}

export function sameCodingAnswers(left: Record<string, string>, right: Record<string, string>): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((slug) => left[slug] === right[slug]);
}
