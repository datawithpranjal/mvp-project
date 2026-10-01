export type PracticeStatus = "new" | "in_progress" | "done";

const STATUS_STYLES: Record<PracticeStatus, string> = {
  new: "border border-slate-700 bg-slate-950/40 text-slate-300",
  in_progress: "border border-amber-300/35 bg-amber-300/10 text-amber-100",
  done: "border border-teal-300/35 bg-teal-300/10 text-teal-100"
};

const STATUS_LABELS: Record<PracticeStatus, string> = {
  new: "New",
  in_progress: "In progress",
  done: "Done"
};

export function getPracticeStatus(completed: boolean, inProgress: boolean): PracticeStatus {
  if (completed) return "done";
  if (inProgress) return "in_progress";
  return "new";
}

export function PracticeStatusBadge({ status }: { status: PracticeStatus }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
