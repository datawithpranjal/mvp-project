import assert from "node:assert/strict";
import { CodingDraftSession, chooseSavedCodingDraft, sameCodingAnswers } from "../lib/coding-draft-conflicts";

class MemoryStorage {
  items = new Map<string, string>();
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { this.items.set(key, value); }
  removeItem(key: string) { this.items.delete(key); }
}

const storage = new MemoryStorage();
const baseline = "SELECT 'saved baseline' AS marker";
const mine = "SELECT 'tab A unsaved' AS marker";
const theirs = "SELECT 'tab B saved' AS marker";
const tabA = new CodingDraftSession("guest", storage);
const cleanTab = new CodingDraftSession("guest", new MemoryStorage());
tabA.reconcile({ salary: baseline });
cleanTab.reconcile({ salary: baseline });
tabA.edit("salary", mine);
assert.equal(tabA.canAutosave("salary", mine), true);
assert.deepEqual(tabA.reconcile({ salary: theirs }), { salary: mine });
assert.equal(tabA.canAutosave("salary", mine), false, "a queued autosave cannot overwrite the external save");
assert.deepEqual(tabA.conflicts.salary, { localCode: mine, savedCode: theirs, recoverySaved: true });
assert.deepEqual(cleanTab.reconcile({ salary: theirs }), { salary: theirs }, "a clean tab still follows the saved draft");
assert.equal(cleanTab.canAutosave("salary", theirs), false, "hydration must not echo writes between tabs");

const reloaded = new CodingDraftSession("guest", storage);
assert.deepEqual(reloaded.reconcile({ salary: theirs }), { salary: mine }, "reload restores the pending editor version");
reloaded.edit("salary", `${mine}\n-- continued after conflict`);
const secondReload = new CodingDraftSession("guest", storage);
assert.equal(secondReload.reconcile({ salary: theirs }).salary, `${mine}\n-- continued after conflict`);
assert.deepEqual(secondReload.useSaved("salary", theirs), { code: theirs });
assert.deepEqual(secondReload.conflicts, {});
assert.deepEqual(new CodingDraftSession("guest", storage).reconcile({ salary: theirs }), { salary: theirs });

const keep = new CodingDraftSession("guest", storage);
keep.reconcile({ salary: baseline });
keep.edit("salary", mine);
keep.reconcile({ salary: theirs });
keep.saved("salary", mine); // Only called after the local write succeeds.
assert.deepEqual(keep.conflicts, {});
assert.equal(keep.canAutosave("salary", mine), false);
assert.deepEqual(new CodingDraftSession("guest", storage).reconcile({ salary: mine }), { salary: mine });

const ordinary = new CodingDraftSession("guest", storage);
ordinary.reconcile({ salary: baseline });
ordinary.edit("salary", mine);
assert.equal(ordinary.reconcile({ salary: baseline, other: "SELECT 1" }).salary, mine);
assert.deepEqual(ordinary.conflicts, {}, "unrelated lab/selection/timestamp changes do not conflict");
assert.equal(ordinary.canAutosave("salary", mine), true);
ordinary.edit("salary", "newer edit");
ordinary.saved("salary", mine);
assert.equal(ordinary.canAutosave("salary", "newer edit"), true, "stale acknowledgement cannot clear newer work");
assert.equal(ordinary.reconcile({ salary: mine }).salary, "newer edit");
assert.deepEqual(ordinary.conflicts, {});
ordinary.saved("salary", "newer edit");
assert.equal(ordinary.canAutosave("salary", "newer edit"), false);
ordinary.edit("salary", "newest edit");
ordinary.edit("salary", "newer edit");
assert.equal(ordinary.canAutosave("salary", "newer edit"), false, "returning to the saved version clears dirty state");

const deletion = new CodingDraftSession("guest", storage);
deletion.reconcile({ salary: baseline });
deletion.edit("salary", mine);
assert.equal(deletion.reconcile({}).salary, mine);
assert.equal(deletion.conflicts.salary.savedCode, undefined);
assert.deepEqual(chooseSavedCodingDraft("salary", deletion.conflicts.salary, () => deletion), { code: undefined }, "an actual missing-saved conflict can intentionally restore the starter");
assert.equal(deletion.useSaved("salary"), null, "no current conflict is distinct from an actual deletion choice");

const convergedDeletion = new CodingDraftSession("guest", new MemoryStorage());
convergedDeletion.reconcile({ salary: baseline });
convergedDeletion.edit("salary", mine);
convergedDeletion.reconcile({});
let handlerAnswers = { salary: mine };
let handlerStatus = "Draft choice needed";
const choice = chooseSavedCodingDraft("salary", convergedDeletion.conflicts.salary, () => {
  handlerAnswers = convergedDeletion.reconcile({ salary: mine }) as { salary: string };
  return convergedDeletion;
});
if (choice) {
  if (choice.code === undefined) delete (handlerAnswers as Partial<typeof handlerAnswers>).salary;
  else handlerAnswers.salary = choice.code;
  handlerStatus = "Saved draft loaded on this device";
}
assert.equal(choice, null, "the actual choice helper must stop when refresh clears the deletion conflict");
assert.deepEqual(handlerAnswers, { salary: mine }, "preserve the reconciled editor instead of falling back to starter");
assert.equal(handlerStatus, "Draft choice needed", "a cleared choice must not claim a load success");
assert.equal(chooseSavedCodingDraft("salary", undefined, () => { throw new Error("must not refresh"); }), null);

const changedChoice = new CodingDraftSession("guest", new MemoryStorage());
changedChoice.reconcile({ salary: baseline });
changedChoice.edit("salary", mine);
changedChoice.reconcile({ salary: theirs });
assert.equal(chooseSavedCodingDraft("salary", changedChoice.conflicts.salary, () => {
  changedChoice.reconcile({ salary: "new external version" });
  return changedChoice;
}), null, "a newly changed saved version needs a fresh choice");

const simultaneous = new CodingDraftSession("guest", storage);
simultaneous.reconcile({ salary: baseline });
simultaneous.edit("salary", mine);
simultaneous.reconcile({ salary: theirs });
assert.deepEqual(simultaneous.reconcile({ salary: mine }), { salary: mine });
assert.deepEqual(simultaneous.conflicts, {}, "identical saved/editor versions need no choice");

const guest = new CodingDraftSession("guest", storage);
guest.reconcile({ salary: baseline });
guest.edit("salary", mine);
guest.reconcile({ salary: theirs });
assert.deepEqual(new CodingDraftSession("user-test-a", storage).reconcile({ salary: "account A" }), { salary: "account A" });
assert.deepEqual(new CodingDraftSession("user-test-b", storage).reconcile({}), {}, "guest/account recovery namespaces remain separate");
assert.equal(new CodingDraftSession("guest", storage).reconcile({ salary: theirs }).salary, mine);

const unavailable = new CodingDraftSession("guest", {
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("quota"); },
  removeItem() { throw new Error("blocked"); }
});
unavailable.reconcile({ salary: baseline });
unavailable.edit("salary", mine);
assert.equal(unavailable.reconcile({ salary: theirs }).salary, mine);
assert.equal(unavailable.conflicts.salary.recoverySaved, false, "never promise reload recovery after a storage failure");
unavailable.edit("salary", "still editable");
assert.equal(unavailable.conflicts.salary.localCode, "still editable");

const corrupt = new MemoryStorage();
corrupt.setItem("data-foundry-coding-draft-conflicts-v1:guest", '{"salary":{"localCode":3},"other":{"localCode":"valid","savedCode":4}}');
assert.deepEqual(new CodingDraftSession("guest", corrupt).reconcile({ salary: baseline }), { salary: baseline });
assert.equal(sameCodingAnswers({ a: "1", b: "2" }, { b: "2", a: "1" }), true);
assert.equal(sameCodingAnswers({ a: "1" }, { a: "2" }), false);
console.log("PASS: draft conflict race, clean sync/no echo, both choices, reload/edit recovery, unrelated writes, stale acknowledgement, deletion, matching versions, scope isolation and storage failure.");
