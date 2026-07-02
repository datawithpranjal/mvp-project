"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { InteractiveLearningFlow } from "../interactive-learning-flow";
import {
  getOperationsLabs,
  type OperationsLab,
  type OperationsLabTrack
} from "../../data/platform-operations-labs";
import { trackEvent } from "../../lib/analytics";
import { getOperationsLearningFlow } from "../../lib/learning-flow";
import { getPremiumAccess, type PremiumAccessRecord } from "../../lib/premium-access";
import { handleTextareaTabKeyDown } from "../../lib/textarea-tab";

interface SavedOperationsAnswer {
  optionId: string;
  explanation: string;
  completed: boolean;
  score: number | null;
  savedAt: string;
}

interface EvaluationResult {
  score: number;
  diagnosisCorrect: boolean;
  selectedFeedback: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  message: string;
}

const STORAGE_KEY = "data-foundry-operations-lab-session-v1";

export function OperationsDecisionLab({ track }: { track: OperationsLabTrack }) {
  const labs = useMemo(() => getOperationsLabs(track), [track]);
  const [selectedSlug, setSelectedSlug] = useState(labs[0]?.slug ?? "");
  const [savedAnswers, setSavedAnswers] = useState<Record<string, SavedOperationsAnswer>>({});
  const [selectedOption, setSelectedOption] = useState("");
  const [explanation, setExplanation] = useState("");
  const [hintCount, setHintCount] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [difficulty, setDifficulty] = useState("All");
  const [section, setSection] = useState("All");
  const [premiumAccess, setPremiumAccess] = useState<PremiumAccessRecord | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const selectedLab = labs.find((lab) => lab.slug === selectedSlug) ?? labs[0];
  const sections = ["All", ...Array.from(new Set(labs.map((lab) => lab.section))).sort()];
  const filteredLabs = labs.filter(
    (lab) =>
      (difficulty === "All" || lab.difficulty === difficulty) &&
      (section === "All" || lab.section === section)
  );
  const queue = filteredLabs.length > 0 ? filteredLabs : labs;
  const queueIndex = queue.findIndex((lab) => lab.slug === selectedLab?.slug);
  const nextLab = queueIndex >= 0 ? queue[queueIndex + 1] ?? null : queue[0] ?? null;
  const isLocked = Boolean(selectedLab && !selectedLab.isFree && !premiumAccess);
  const completedCount = labs.filter((lab) => savedAnswers[lab.slug]?.completed).length;
  const incidentFlow = selectedLab ? getOperationsLearningFlow(selectedLab) : null;

  useEffect(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY) ?? "{}"
      ) as Record<string, SavedOperationsAnswer>;
      setSavedAnswers(stored);
    } catch {
      setSavedAnswers({});
    }

    setPremiumAccess(getPremiumAccess());
    const requested = new URLSearchParams(window.location.search).get("lab");
    if (requested && labs.some((lab) => lab.slug === requested)) {
      setSelectedSlug(requested);
    }
    setIsLoaded(true);
  }, [labs]);

  useEffect(() => {
    if (!isLoaded || !selectedLab) return;
    const saved = savedAnswers[selectedLab.slug];
    setSelectedOption(saved?.optionId ?? "");
    setExplanation(saved?.explanation ?? "");
    setHintCount(0);
    setShowSolution(false);
    setResult(
      saved?.score !== null && saved?.score !== undefined
        ? evaluateAnswer(selectedLab, saved.optionId, saved.explanation)
        : null
    );
  }, [isLoaded, selectedLab]);

  useEffect(() => {
    if (!isLoaded || !selectedLab) return;
    const timer = window.setTimeout(() => {
      setSavedAnswers((current) => {
        const existing = current[selectedLab.slug];
        const nextAnswers = {
          ...current,
          [selectedLab.slug]: {
            optionId: selectedOption,
            explanation,
            completed: existing?.completed ?? false,
            score: existing?.score ?? null,
            savedAt: new Date().toISOString()
          }
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAnswers));
        return nextAnswers;
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [explanation, isLoaded, selectedLab, selectedOption]);

  if (!selectedLab) {
    return (
      <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
        <div className="panel rounded-[2rem] p-8 text-slate-300">No labs are available.</div>
      </main>
    );
  }

  function switchLab(lab: OperationsLab) {
    setSelectedSlug(lab.slug);
    window.history.replaceState(null, "", `/labs/${track}?lab=${encodeURIComponent(lab.slug)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitAnswer() {
    if (!selectedOption) {
      setResult({
        score: 0,
        diagnosisCorrect: false,
        selectedFeedback: "Choose one option so the diagnosis can be evaluated.",
        matchedKeywords: [],
        missingKeywords: selectedLab.expectedKeywords,
        message: "Choose a diagnosis before submitting your production response."
      });
      return;
    }

    const evaluation = evaluateAnswer(selectedLab, selectedOption, explanation);
    setResult(evaluation);
    const completed = evaluation.score >= 70;
    const nextAnswers = {
      ...savedAnswers,
      [selectedLab.slug]: {
        optionId: selectedOption,
        explanation,
        completed,
        score: evaluation.score,
        savedAt: new Date().toISOString()
      }
    };
    setSavedAnswers(nextAnswers);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAnswers));
    trackEvent("first_lab_submitted", {
      lab: selectedLab.slug,
      track,
      passed: completed
    });
    if (completed) {
      trackEvent("lab_completed", { lab: selectedLab.slug, track });
    }
  }

  function showNextHint() {
    setHintCount((current) => Math.min(selectedLab.hints.length, current + 1));
    trackEvent("hint_used", { lab: selectedLab.slug, track });
  }

  function revealSolution() {
    setShowSolution(true);
    trackEvent("model_solution_revealed", { lab: selectedLab.slug, track });
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-8 sm:px-8">
      <section className="panel rounded-[2rem] p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          {track === "airflow" ? "Airflow Incident Lab" : "AWS Data Platform Lab"}
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-50">
              {track === "airflow"
                ? "Operate Airflow, not just DAG syntax."
                : "Choose AWS services with production judgment."}
            </h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">
              {track === "airflow"
                ? "Inspect DAG code, scheduler evidence, and task logs. Diagnose the failure, write the operational fix, and compare your answer with an interview-ready response."
                : "Work through storage, security, compute, streaming, governance, and observability incidents. Every lab asks why a service or design fits, not merely what it is."}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Labs" value={labs.length} />
            <Stat label="Free" value={labs.filter((lab) => lab.isFree).length} />
            <Stat label="Completed" value={completedCount} />
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-[290px_minmax(0,1fr)] 2xl:grid-cols-[310px_minmax(0,1fr)_310px]">
        <aside className="panel h-fit rounded-[2rem] p-5 md:sticky md:top-24 md:max-h-[calc(100vh-7rem)] md:overflow-hidden">
          <div className="flex flex-wrap gap-2">
            {["All", "beginner", "intermediate", "advanced"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setDifficulty(item)}
                className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                  difficulty === item
                    ? "bg-teal-300 text-slate-950"
                    : "border border-slate-700 text-slate-300"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Topic
            <select
              value={section}
              onChange={(event) => setSection(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm normal-case tracking-normal text-slate-100"
            >
              {sections.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <div className="mt-5 max-h-[calc(100vh-18rem)] space-y-3 overflow-y-auto pr-1">
            {filteredLabs.map((lab) => (
              <button
                key={lab.slug}
                type="button"
                onClick={() => switchLab(lab)}
                className={`w-full rounded-3xl border p-4 text-left transition ${
                  lab.slug === selectedLab.slug
                    ? "border-teal-300/60 bg-teal-300/10"
                    : "border-slate-800 bg-slate-950/30 hover:border-teal-300/30"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {lab.section}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">
                    {lab.isFree ? "Free" : "Premium"}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold leading-5 text-slate-100">
                  {lab.title}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {savedAnswers[lab.slug]?.completed ? "Completed" : `${lab.estimatedMinutes} min`}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 space-y-6">
          <article className="panel rounded-[2rem] p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Badge>{selectedLab.difficulty}</Badge>
                <Badge>{selectedLab.section}</Badge>
                <Badge>{selectedLab.estimatedMinutes} min</Badge>
                <Badge>{selectedLab.isFree ? "Free" : "Premium"}</Badge>
              </div>
              <button
                type="button"
                disabled={!nextLab}
                onClick={() => nextLab && switchLab(nextLab)}
                className="rounded-full border border-teal-300/30 px-5 py-2 text-sm font-semibold text-teal-100 transition hover:bg-teal-300/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                Next question
              </button>
            </div>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-50">
              {selectedLab.title}
            </h2>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">
              Business context
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              {selectedLab.businessContext}
            </p>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
              Production problem
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-200">
              {selectedLab.problemStatement}
            </p>
          </article>

          {incidentFlow ? (
            <InteractiveLearningFlow
              title={`${selectedLab.title} production path`}
              stages={incidentFlow.stages}
              caption={
                result
                  ? "The highlighted stage is the likely failure boundary. Select each node to understand the surrounding production contract."
                  : incidentFlow.caption
              }
              focusStageId={result ? incidentFlow.focusStageId : undefined}
            />
          ) : null}

          <article className="panel rounded-[2rem] p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              {selectedLab.evidenceLabel}
            </p>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-3xl border border-slate-800 bg-slate-950/70 p-5 font-mono text-sm leading-7 text-teal-100">
              {selectedLab.evidence}
            </pre>
          </article>

          {isLocked ? (
            <article className="panel rounded-[2rem] border border-amber-300/25 p-7 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
                Premium practice
              </p>
              <h3 className="mt-3 text-2xl font-semibold text-slate-50">
                Unlock the complete diagnosis workspace.
              </h3>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                You can inspect the incident and skills above. Premium access unlocks the
                decision options, written evaluation, hints, and production-grade model answer.
              </p>
              <Link
                href="/pricing#unlock-premium"
                onClick={() =>
                  trackEvent("premium_unlock_clicked", {
                    source: `${track}_lab`,
                    lab: selectedLab.slug
                  })
                }
                className="mt-6 inline-flex rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-slate-950"
              >
                Unlock Premium
              </Link>
            </article>
          ) : (
            <>
              <article className="panel rounded-[2rem] p-6 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
                  Your task
                </p>
                <h3 className="mt-3 text-xl font-semibold text-slate-50">
                  Diagnose first, then write the production response.
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  {selectedLab.studentTask}
                </p>

                <fieldset className="mt-6 space-y-3">
                  <legend className="text-sm font-semibold text-slate-100">
                    Most likely diagnosis or next action
                  </legend>
                  {selectedLab.options.map((option) => (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer gap-3 rounded-3xl border p-4 transition ${
                        selectedOption === option.id
                          ? "border-teal-300/50 bg-teal-300/10"
                          : "border-slate-800 bg-slate-950/35 hover:border-teal-300/25"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${selectedLab.slug}-diagnosis`}
                        value={option.id}
                        checked={selectedOption === option.id}
                        onChange={() => {
                          setSelectedOption(option.id);
                          setResult(null);
                        }}
                        className="mt-1"
                      />
                      <span className="text-sm leading-6 text-slate-200">{option.text}</span>
                    </label>
                  ))}
                </fieldset>

                <label
                  htmlFor={`${selectedLab.slug}-answer`}
                  className="mt-6 block text-sm font-semibold text-slate-100"
                >
                  Explain your root cause, fix, trade-off, and monitoring plan
                </label>
                <textarea
                  id={`${selectedLab.slug}-answer`}
                  value={explanation}
                  onChange={(event) => {
                    setExplanation(event.target.value);
                    setResult(null);
                  }}
                  onKeyDown={(event) =>
                    handleTextareaTabKeyDown(event, (nextValue) => {
                      setExplanation(nextValue);
                      setResult(null);
                    })
                  }
                  rows={10}
                  placeholder="Write this as if you are explaining the incident in an interview or production review..."
                  className="mt-3 w-full resize-y rounded-3xl border border-slate-700 bg-slate-950/60 p-5 text-sm leading-7 text-slate-100 outline-none focus:border-teal-300/50"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Your draft is saved automatically.
                </p>

                {hintCount > 0 ? (
                  <div className="mt-5 space-y-2">
                    {selectedLab.hints.slice(0, hintCount).map((hint, index) => (
                      <p
                        key={hint}
                        className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-50"
                      >
                        Hint {index + 1}: {hint}
                      </p>
                    ))}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={submitAnswer}
                    className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                  >
                    Submit response
                  </button>
                  <button
                    type="button"
                    onClick={showNextHint}
                    disabled={hintCount >= selectedLab.hints.length}
                    className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 disabled:opacity-40"
                  >
                    {hintCount >= selectedLab.hints.length ? "All hints shown" : "Get hint"}
                  </button>
                  <button
                    type="button"
                    onClick={revealSolution}
                    disabled={!result}
                    className="rounded-full border border-teal-300/30 px-5 py-3 text-sm font-semibold text-teal-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Reveal model answer
                  </button>
                </div>
              </article>

              {result ? <EvaluationPanel result={result} /> : null}
              {showSolution ? <ModelAnswer lab={selectedLab} /> : null}
            </>
          )}
        </section>

        <aside className="panel hidden h-fit rounded-[2rem] p-5 2xl:sticky 2xl:top-24 2xl:block">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Skills tested
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {selectedLab.skills.map((skill) => (
              <span
                key={skill}
                className="rounded-full bg-teal-300/10 px-3 py-2 text-xs text-teal-100"
              >
                {skill}
              </span>
            ))}
          </div>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Strong-answer checklist
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
            <li>State the most likely root cause.</li>
            <li>Use the evidence, not a generic definition.</li>
            <li>Propose a production-safe fix.</li>
            <li>Name one meaningful trade-off.</li>
            <li>Add monitoring or prevention.</li>
          </ul>
        </aside>
      </section>
    </main>
  );
}

function evaluateAnswer(
  lab: OperationsLab,
  optionId: string,
  explanation: string
): EvaluationResult {
  const chosen = lab.options.find((option) => option.id === optionId);
  const normalized = explanation.toLowerCase();
  const matchedKeywords = lab.expectedKeywords.filter((keyword) =>
    normalized.includes(keyword.toLowerCase())
  );
  const missingKeywords = lab.expectedKeywords.filter(
    (keyword) => !matchedKeywords.includes(keyword)
  );
  const diagnosisScore = chosen?.isCorrect ? 40 : 0;
  const keywordScore = Math.round(
    (matchedKeywords.length / Math.max(1, lab.expectedKeywords.length)) * 45
  );
  const clarityScore = explanation.trim().length >= 180 ? 15 : explanation.trim().length >= 80 ? 8 : 0;
  const score = Math.min(100, diagnosisScore + keywordScore + clarityScore);

  return {
    score,
    diagnosisCorrect: Boolean(chosen?.isCorrect),
    selectedFeedback: chosen?.feedback ?? "Use the evidence to test the diagnosis.",
    matchedKeywords,
    missingKeywords,
    message: chosen?.isCorrect
      ? score >= 70
        ? "Strong response. You identified the right direction and covered enough production detail."
        : "The diagnosis is correct. Strengthen the explanation with the missing operational details."
      : chosen?.feedback ?? "Review the evidence and try the diagnosis again."
  };
}

function EvaluationPanel({
  result
}: {
  result: EvaluationResult;
}) {
  return (
    <article
      className={`panel rounded-[2rem] border p-6 sm:p-8 ${
        result.score >= 70 ? "border-teal-300/30" : "border-amber-300/30"
      }`}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Evaluation
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{result.message}</p>
        </div>
        <p className="text-4xl font-semibold text-slate-50">{result.score}/100</p>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <FeedbackList
          title="Covered well"
          items={[
            result.diagnosisCorrect ? "Correct incident direction" : "You submitted a diagnosis",
            ...result.matchedKeywords
          ]}
          tone="teal"
        />
        <FeedbackList
          title="Add to strengthen"
          items={[
            ...(!result.diagnosisCorrect ? ["Revisit the primary diagnosis"] : []),
            ...result.missingKeywords,
            ...(result.missingKeywords.length === 0
              ? ["Make the trade-off and monitoring plan explicit"]
              : [])
          ]}
          tone="amber"
        />
      </div>
      <p className="mt-5 rounded-2xl bg-slate-950/40 p-4 text-sm leading-6 text-slate-300">
        Selected-option feedback: {result.selectedFeedback}
      </p>
    </article>
  );
}

function ModelAnswer({ lab }: { lab: OperationsLab }) {
  return (
    <article className="panel rounded-[2rem] p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">
        Production-grade model answer
      </p>
      <div className="mt-5 grid gap-4">
        <AnswerSection title="Diagnosis" body={lab.modelAnswer.diagnosis} />
        <AnswerSection title="Fix" body={lab.modelAnswer.fix} />
        <AnswerSection title="Trade-offs" body={lab.modelAnswer.tradeoffs} />
        <AnswerSection title="Monitoring and prevention" body={lab.modelAnswer.monitoring} />
      </div>
    </article>
  );
}

function AnswerSection({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-7 text-slate-300">{body}</p>
    </div>
  );
}

function FeedbackList({
  title,
  items,
  tone
}: {
  title: string;
  items: string[];
  tone: "teal" | "amber";
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-5">
      <h3 className={`text-sm font-semibold ${tone === "teal" ? "text-teal-100" : "text-amber-100"}`}>
        {title}
      </h3>
      <ul className="mt-3 space-y-2 text-sm text-slate-300">
        {items.slice(0, 7).map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-700/70 bg-slate-950/30 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-50">{value}</p>
    </div>
  );
}
