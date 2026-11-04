import type { CodingLab } from "./coding-labs";

export type PythonCheckPhase = "preparing" | "checking";
export interface PythonIntroError {
  heading: string;
  message: string;
  technicalDetail: string;
}

const INTRO_STARTER = "def reverse_a_string(*args):\n    # Write your solution here\n    raise NotImplementedError";

// This presentation contract is proven only for the existing one-example lab.
export function isPythonIntroLab(lab: CodingLab): boolean {
  return lab.id === "python-coding-001" && lab.slug === "python-coding-01-reverse-a-string" &&
    lab.track === "python" && lab.isFree && !lab.serverValidation &&
    lab.functionName === "reverse_a_string" && lab.testCases?.length === 1 &&
    lab.starterCode === INTRO_STARTER;
}

export function isPythonIntroStarter(lab: CodingLab, answer: string): boolean {
  return isPythonIntroLab(lab) && answer === INTRO_STARTER;
}

export function pythonIntroError(lab: CodingLab, answer: string, phase: PythonCheckPhase | undefined, error: unknown): PythonIntroError | undefined {
  if (!isPythonIntroLab(lab) || !phase) return undefined;
  const technicalDetail = error instanceof Error ? error.message : "";
  if (phase === "preparing") return {
    heading: "Python checking unavailable",
    message: "Your code is still in the editor. Use Save draft and confirm a successful device-save message before reloading this page to try again. If saving fails, copy your code before leaving.",
    technicalDetail
  };
  if (isPythonIntroStarter(lab, answer) && technicalDetail.includes("NotImplementedError")) return {
    heading: "Starter not implemented yet",
    message: "Replace the placeholder with your implementation, then run the sample again.",
    technicalDetail
  };
  const lines = technicalDetail.split("\n").map((line) => line.trim()).filter(Boolean);
  const exception = [...lines].reverse().find((line) => /(?:Error|Exception)(?::|$)/.test(line)) ?? lines.at(-1);
  return {
    heading: "Python needs a correction",
    message: `${exception ? exception.slice(0, 240) : "The Python code could not run."} Edit your code, then use Run sample again.`,
    technicalDetail
  };
}

export function pythonIntroSampleSuccess(authenticated: boolean): string {
  return authenticated
    ? "Your code passed the visible example. Submit your answer to record your progress."
    : "Your code passed the visible example. Sign in to submit your answer and record your progress.";
}
