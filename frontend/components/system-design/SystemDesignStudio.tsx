"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { evaluateScenarioWithAi } from "../../lib/api";
import { getAuthToken } from "../../lib/auth";
import { InteractiveLearningFlow } from "../interactive-learning-flow";
import { buildArchitectureFlow } from "../../lib/learning-flow";
import { getPremiumAccess, type PremiumAccessRecord } from "../../lib/premium-access";
import {
  SYSTEM_DESIGN_CASES,
  SYSTEM_DESIGN_DIFFICULTIES,
  SYSTEM_DESIGN_DOMAINS,
  evaluateSystemDesignAnswer,
  formatSystemDesignDomain,
  type SystemDesignCase,
  type SystemDesignDifficulty,
  type SystemDesignDomain,
  type SystemDesignEvaluation,
  type SystemDesignProgress
} from "../../lib/system-design";
import { AuthDialog } from "../auth-dialog";

const STORAGE_KEY = "the-data-foundry-system-design-progress-v1";

type DomainFilter = "All" | SystemDesignDomain;
type DifficultyFilter = "All" | SystemDesignDifficulty;

function readProgress(): Record<string, SystemDesignProgress> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SystemDesignProgress>) : {};
  } catch {
    return {};
  }
}

function writeProgress(progress: Record<string, SystemDesignProgress>) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }
}

function verdictLabel(score: number) {
  if (score >= 85) return "Strong architecture answer";
  if (score >= 70) return "Good, interview-ready base";
  if (score >= 45) return "Partial, needs more depth";
  return "Weak, add structure";
}

export function SystemDesignStudio() {
  const [domain, setDomain] = useState<DomainFilter>("All");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("All");
  const [selectedSlug, setSelectedSlug] = useState(SYSTEM_DESIGN_CASES[0]?.slug ?? "");
  const [progressMap, setProgressMap] = useState<Record<string, SystemDesignProgress>>({});
  const [premiumAccess, setPremiumAccess] = useState<PremiumAccessRecord | null>(null);
  const [answer, setAnswer] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [hintCount, setHintCount] = useState(0);
  const [showModelAnswer, setShowModelAnswer] = useState(false);
  const [evaluation, setEvaluation] = useState<SystemDesignEvaluation | null>(null);
  const [evaluationNotice, setEvaluationNotice] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  useEffect(() => {
    const savedProgress = readProgress();
    const initialSlug = SYSTEM_DESIGN_CASES[0]?.slug ?? "";
    const savedSelectedProgress = savedProgress[initialSlug];

    setProgressMap(savedProgress);
    setPremiumAccess(getPremiumAccess());
    setAnswer(savedSelectedProgress?.draft ?? "");
    setSelectedOptions(savedSelectedProgress?.selectedOptions ?? {});
  }, []);

  const filteredCases = useMemo(() => {
    return SYSTEM_DESIGN_CASES.filter((item) => {
      const domainMatches = domain === "All" || item.domain === domain;
      const difficultyMatches = difficulty === "All" || item.difficulty === difficulty;
      return domainMatches && difficultyMatches;
    });
  }, [domain, difficulty]);

  const selectedCase =
    SYSTEM_DESIGN_CASES.find((item) => item.slug === selectedSlug) ?? SYSTEM_DESIGN_CASES[0];
  const currentProgress = progressMap[selectedCase.slug] ?? {};
  const hasAccess = selectedCase.isFree || Boolean(premiumAccess);
  const completedCount = SYSTEM_DESIGN_CASES.filter(
    (item) => progressMap[item.slug]?.completed
  ).length;
  const activeQueue = filteredCases.length > 0 ? filteredCases : SYSTEM_DESIGN_CASES;
  const currentIndex = activeQueue.findIndex((item) => item.slug === selectedCase.slug);
  const nextCase = currentIndex >= 0 ? activeQueue[(currentIndex + 1) % activeQueue.length] : null;

  useEffect(() => {
    const saved = progressMap[selectedCase.slug];
    setAnswer(saved?.draft ?? "");
    setSelectedOptions(saved?.selectedOptions ?? {});
    setEvaluation(null);
    setHintCount(0);
    setShowModelAnswer(false);
  }, [selectedCase.slug]);

  function saveCaseProgress(item: SystemDesignCase, patch: SystemDesignProgress) {
    const nextProgress = {
      ...progressMap,
      [item.slug]: {
        ...progressMap[item.slug],
        ...patch,
        lastPracticedAt: new Date().toISOString()
      }
    };
    setProgressMap(nextProgress);
    writeProgress(nextProgress);
  }

  function handleDecision(decisionId: string, optionId: string) {
    const nextOptions = { ...selectedOptions, [decisionId]: optionId };
    setSelectedOptions(nextOptions);
    saveCaseProgress(selectedCase, {
      draft: answer,
      selectedOptions: nextOptions
    });
  }

  function saveDraft() {
    saveCaseProgress(selectedCase, {
      draft: answer,
      selectedOptions
    });
  }

  async function evaluateAnswer() {
    const submittedAnswer = answer.trim();
    if (!submittedAnswer) {
      setEvaluationNotice("Write your architecture answer first, then request AI feedback.");
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setEvaluationNotice("Sign in with OTP to get AI evaluation on your architecture answer.");
      setIsAuthOpen(true);
      return;
    }

    setIsEvaluating(true);
    setEvaluationNotice(null);

    try {
      const modelAnswer = [
        `Overview: ${selectedCase.modelAnswer.overview}`,
        `Data flow: ${selectedCase.modelAnswer.dataFlow}`,
        `Storage model: ${selectedCase.modelAnswer.storageModel}`,
        `Processing: ${selectedCase.modelAnswer.processing}`,
        `Reliability: ${selectedCase.modelAnswer.reliability}`,
        `Trade-offs: ${selectedCase.modelAnswer.tradeoffs}`,
        `Interview framing: ${selectedCase.modelAnswer.interviewFraming}`
      ].join("\n\n");

      const aiResult = await evaluateScenarioWithAi(token, {
        scenario_slug: selectedCase.slug,
        user_answer: submittedAnswer,
        context: {
          title: selectedCase.title,
          domain: formatSystemDesignDomain(selectedCase.domain),
          scenario_type: "system_design",
          business_context: selectedCase.businessContext,
          problem_statement: selectedCase.badArchitecture,
          requirement: [
            selectedCase.learnerTask,
            "Functional requirements:",
            ...selectedCase.functionalRequirements,
            "Non-functional requirements:",
            ...selectedCase.nonFunctionalRequirements,
            "Decision choices made by the learner:",
            ...selectedCase.decisions.map((decision) => {
              const selected = selectedOptions[decision.id];
              const option = decision.options.find((item) => item.id === selected);
              return `${decision.question} -> ${option?.label ?? "No option selected"}`;
            })
          ].join("\n"),
          broken_code: selectedCase.badArchitecture,
          actual_output: "",
          expected_output: selectedCase.architectureStages.join(" -> "),
          model_solution: modelAnswer,
          production_explanation: selectedCase.modelAnswer.interviewFraming,
          common_mistakes: [
            "Skipping non-functional requirements such as SLA, freshness, reliability, and cost.",
            "Listing tools without explaining trade-offs or failure handling.",
            "Forgetting monitoring, backfills, idempotency, and data quality checks."
          ],
          follow_ups: selectedCase.followUps,
          rubric: {
            root_cause: selectedCase.rubric.requirements,
            correctness: selectedCase.rubric.architecture,
            production_thinking: selectedCase.rubric.reliability,
            tradeoffs: selectedCase.rubric.tradeoffs,
            communication: selectedCase.rubric.communication
          }
        }
      });

      const nextEvaluation: SystemDesignEvaluation = {
        score: aiResult.score,
        verdict: aiResult.verdict,
        strengths: aiResult.strengths,
        gaps: aiResult.gaps,
        improvedAnswer: aiResult.improved_answer,
        followUpQuestions: aiResult.follow_up_questions,
        mode: aiResult.mode,
        model: aiResult.model,
        matchedKeywords: [],
        missingKeywords: [],
        rubricBreakdown: {
          requirements: aiResult.rubric_breakdown.root_cause,
          architecture: aiResult.rubric_breakdown.correctness,
          tradeoffs: aiResult.rubric_breakdown.tradeoffs,
          reliability: aiResult.rubric_breakdown.production_thinking,
          communication: aiResult.rubric_breakdown.communication
        }
      };

      setEvaluation(nextEvaluation);
      saveCaseProgress(selectedCase, {
        draft: submittedAnswer,
        selectedOptions,
        score: nextEvaluation.score
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "AI evaluation could not run right now.";
      console.error("AI system design evaluation failed:", reason);
      const fallbackEvaluation = evaluateSystemDesignAnswer(
        selectedCase,
        submittedAnswer,
        selectedOptions
      );
      setEvaluation({ ...fallbackEvaluation, mode: "local" });
      setEvaluationNotice(
        `AI evaluation could not run: ${reason} Temporary rubric feedback is shown instead.`
      );
      saveCaseProgress(selectedCase, {
        draft: submittedAnswer,
        selectedOptions,
        score: fallbackEvaluation.score
      });
    } finally {
      setIsEvaluating(false);
    }
  }

  function markCompleted() {
    saveCaseProgress(selectedCase, {
      completed: true,
      completedAt: new Date().toISOString(),
      draft: answer,
      selectedOptions,
      score: evaluation?.score ?? currentProgress.score
    });
    if (nextCase) {
      setSelectedSlug(nextCase.slug);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-8 sm:px-8">
      <section className="panel relative overflow-hidden rounded-[2rem] p-8">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.16),transparent_58%)] lg:block" />
        <div className="relative grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-teal-200">
              System Design Studio
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-50 sm:text-6xl">
              Practice data architecture like an interview.
            </h1>
            <p className="mt-5 max-w-4xl text-sm leading-7 text-slate-300 sm:text-base">
              Turn system design theory into architecture reps: choose trade-offs, review a
              broken design, write your answer, get a rubric score, and reveal a production-grade
              model answer.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#studio"
                className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Start designing
              </a>
              <Link
                href="/pricing"
                className="rounded-full border border-slate-700 bg-slate-950/30 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-amber-300/50"
              >
                Unlock premium cases
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Cases" value={SYSTEM_DESIGN_CASES.length} />
            <Stat
              label="Free"
              value={SYSTEM_DESIGN_CASES.filter((item) => item.isFree).length}
            />
            <Stat label="Completed" value={completedCount} />
          </div>
        </div>
      </section>

      <section id="studio" className="mt-6 grid gap-6 lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="panel h-fit rounded-[2rem] p-5 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-hidden">
          <div className="flex flex-wrap gap-2">
            {SYSTEM_DESIGN_DIFFICULTIES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setDifficulty(item)}
                className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                  difficulty === item
                    ? "bg-teal-300 text-slate-950"
                    : "border border-slate-700 bg-slate-950/40 text-slate-300"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <select
            value={domain}
            onChange={(event) => setDomain(event.target.value as DomainFilter)}
            className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100"
          >
            {SYSTEM_DESIGN_DOMAINS.map((item) => (
              <option key={item} value={item}>
                {item === "All" ? "All domains" : formatSystemDesignDomain(item)}
              </option>
            ))}
          </select>

          <div className="mt-5 max-h-[calc(100vh-18rem)] space-y-3 overflow-y-auto pr-1">
            {filteredCases.map((item) => {
              const locked = !item.isFree && !premiumAccess;
              const progress = progressMap[item.slug];

              return (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => setSelectedSlug(item.slug)}
                  className={`w-full rounded-3xl border p-4 text-left transition ${
                    item.slug === selectedCase.slug
                      ? "border-teal-300/60 bg-teal-300/10"
                      : "border-slate-800 bg-slate-950/30 hover:border-teal-300/30"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {formatSystemDesignDomain(item.domain)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                        locked
                          ? "bg-amber-300/10 text-amber-100"
                          : "bg-teal-300/10 text-teal-100"
                      }`}
                    >
                      {locked ? "locked" : item.isFree ? "free" : "premium"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-5 text-slate-100">
                    {item.title}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {item.shortDescription}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-slate-500">
                    <span>{item.estimatedMinutes} min</span>
                    <span>{progress?.completed ? "completed" : progress?.score ? `${progress.score}/100` : item.difficulty}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0 space-y-6">
          {!hasAccess ? (
            <LockedCase item={selectedCase} />
          ) : (
            <>
              <CaseBrief item={selectedCase} />
              <DecisionLab
                item={selectedCase}
                selectedOptions={selectedOptions}
                onSelect={handleDecision}
              />
              <AnswerWorkspace
                item={selectedCase}
                answer={answer}
                setAnswer={setAnswer}
                hintCount={hintCount}
                setHintCount={setHintCount}
                onSave={saveDraft}
                onEvaluate={evaluateAnswer}
                onComplete={markCompleted}
                onNext={() => nextCase && setSelectedSlug(nextCase.slug)}
                canGoNext={Boolean(nextCase)}
                evaluation={evaluation}
                evaluationNotice={evaluationNotice}
                isEvaluating={isEvaluating}
              />
              {showModelAnswer ? <ModelAnswer item={selectedCase} /> : null}
              <div className="panel rounded-[2rem] p-6">
                <button
                  type="button"
                  onClick={() => setShowModelAnswer((value) => !value)}
                  className="rounded-full bg-teal-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-teal-200"
                >
                  {showModelAnswer ? "Hide model answer" : "Reveal model answer"}
                </button>
              </div>
            </>
          )}
        </section>
      </section>
      <AuthDialog isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-slate-700/70 bg-slate-950/30 p-5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-50">{value}</p>
    </div>
  );
}

function CaseBrief({ item }: { item: SystemDesignCase }) {
  return (
    <>
      <article className="panel rounded-[2rem] p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]">
            {item.difficulty}
          </span>
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300"
            >
              {tag}
            </span>
          ))}
        </div>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">
          {item.title}
        </h2>
        <p className="mt-4 text-sm leading-7 text-slate-300">{item.businessContext}</p>
      </article>

      <section className="grid gap-6 xl:grid-cols-2">
        <InfoList title="Functional requirements" items={item.functionalRequirements} />
        <InfoList title="Non-functional requirements" items={item.nonFunctionalRequirements} />
      </section>

      <InteractiveLearningFlow
        title="Explore the proposed architecture"
        stages={buildArchitectureFlow(item.architectureStages)}
        caption="Select any stage to inspect its responsibility. Animated edges show the direction of data movement through the platform."
      />

      <section className="panel rounded-[2rem] border border-rose-300/20 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-200">
          Broken architecture review
        </p>
        <p className="mt-3 text-sm leading-7 text-slate-300">{item.badArchitecture}</p>
        <p className="mt-4 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm font-semibold leading-6 text-amber-50">
          Task: {item.learnerTask}
        </p>
      </section>
    </>
  );
}

function DecisionLab({
  item,
  selectedOptions,
  onSelect
}: {
  item: SystemDesignCase;
  selectedOptions: Record<string, string>;
  onSelect: (decisionId: string, optionId: string) => void;
}) {
  return (
    <section className="panel rounded-[2rem] p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
        Decision questions
      </p>
      <div className="mt-5 space-y-5">
        {item.decisions.map((decision) => {
          const selected = selectedOptions[decision.id];
          const selectedOption = decision.options.find((option) => option.id === selected);

          return (
            <div key={decision.id} className="rounded-3xl border border-slate-800 bg-slate-950/30 p-5">
              <p className="text-sm font-semibold text-slate-100">{decision.question}</p>
              <div className="mt-4 grid gap-3 xl:grid-cols-3">
                {decision.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSelect(decision.id, option.id)}
                    className={`rounded-2xl border p-4 text-left text-sm leading-6 transition ${
                      selected === option.id
                        ? option.isBest
                          ? "border-teal-300/50 bg-teal-300/10 text-teal-100"
                          : "border-rose-300/50 bg-rose-300/10 text-rose-100"
                        : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-teal-300/30"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {selectedOption ? (
                <p className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm leading-6 text-slate-300">
                  {selectedOption.feedback}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AnswerWorkspace({
  item,
  answer,
  setAnswer,
  hintCount,
  setHintCount,
  onSave,
  onEvaluate,
  onComplete,
  onNext,
  canGoNext,
  evaluation,
  evaluationNotice,
  isEvaluating
}: {
  item: SystemDesignCase;
  answer: string;
  setAnswer: (value: string) => void;
  hintCount: number;
  setHintCount: (value: number | ((value: number) => number)) => void;
  onSave: () => void;
  onEvaluate: () => void;
  onComplete: () => void;
  onNext: () => void;
  canGoNext: boolean;
  evaluation: SystemDesignEvaluation | null;
  evaluationNotice: string | null;
  isEvaluating: boolean;
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="panel rounded-[2rem] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
              Your architecture answer
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Write like an interview: requirements, architecture, trade-offs, failure handling,
              monitoring, and why your choices fit the SLA.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSave}
              className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={onEvaluate}
              disabled={isEvaluating}
              className="rounded-full bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-amber-100"
            >
              {isEvaluating ? "Evaluating with AI..." : "Evaluate answer"}
            </button>
          </div>
        </div>
        {evaluationNotice ? (
          <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
            {evaluationNotice}
          </div>
        ) : null}
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Example structure: I would start by clarifying SLA and data sources. Then I would design..."
          className="mt-5 min-h-[360px] w-full resize-y rounded-3xl border border-slate-700 bg-slate-950/80 p-5 text-sm leading-7 text-slate-100 outline-none transition focus:border-teal-300/70"
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onComplete}
            className="rounded-full bg-teal-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-teal-200"
          >
            Mark completed
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canGoNext}
            className="rounded-full border border-teal-300/30 px-5 py-3 text-sm font-bold text-teal-100 transition hover:bg-teal-300/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
          >
            Next case
          </button>
        </div>
      </div>

      <aside className="space-y-6">
        <div className="panel rounded-[2rem] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Hints
            </p>
            <button
              type="button"
              onClick={() => setHintCount((count) => Math.min(count + 1, item.hints.length))}
              className="rounded-full border border-teal-300/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-teal-100"
            >
              Get hint
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {item.hints.slice(0, hintCount).map((hint, index) => (
              <div key={hint} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">
                  Hint {index + 1}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{hint}</p>
              </div>
            ))}
            {hintCount === 0 ? (
              <p className="text-sm leading-6 text-slate-400">
                Try your own design first. Then use hints like an interviewer nudging you.
              </p>
            ) : null}
          </div>
        </div>

        {evaluation ? (
          <EvaluationPanel evaluation={evaluation} item={item} />
        ) : (
          <RubricCard item={item} />
        )}
      </aside>
    </section>
  );
}

function EvaluationPanel({
  evaluation,
  item
}: {
  evaluation: SystemDesignEvaluation;
  item: SystemDesignCase;
}) {
  return (
    <div className="panel rounded-[2rem] border border-teal-300/20 p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
        {evaluation.mode === "local" ? "Temporary rubric feedback" : "AI evaluation"}
      </p>
      {evaluation.mode && evaluation.mode !== "local" ? (
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Powered by {evaluation.mode}
        </p>
      ) : null}
      <p className="mt-3 text-5xl font-semibold text-slate-50">{evaluation.score}/100</p>
      <p className="mt-2 text-sm font-semibold text-teal-100">{verdictLabel(evaluation.score)}</p>
      <div className="mt-5 space-y-3">
        {Object.entries(evaluation.rubricBreakdown).map(([key, value]) => (
          <div key={key}>
            <div className="flex justify-between text-xs uppercase tracking-[0.16em] text-slate-400">
              <span>{key}</span>
              <span>{value}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-teal-300"
                style={{
                  width: `${Math.min(
                    100,
                    (value / Math.max(1, item.rubric[key as keyof SystemDesignCase["rubric"]])) *
                      100
                  )}%`
                }}
              />
            </div>
          </div>
        ))}
      </div>
      {evaluation.strengths.length > 0 ? (
        <div className="mt-5 rounded-3xl border border-teal-300/20 bg-teal-300/10 p-4">
          <p className="text-sm font-semibold text-teal-50">What worked</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-teal-100">
            {evaluation.strengths.map((strength) => (
              <li key={strength}>{strength}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/50 p-4">
        <p className="text-sm font-semibold text-slate-100">What to improve</p>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
          {(evaluation.gaps.length ? evaluation.gaps : ["Good coverage. Now tighten the interview framing."]).map(
            (gap) => (
              <li key={gap}>{gap}</li>
            )
          )}
        </ul>
      </div>
      {evaluation.improvedAnswer ? (
        <div className="mt-5 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm font-semibold text-amber-50">AI suggested stronger framing</p>
          <p className="mt-3 text-sm leading-6 text-amber-100">{evaluation.improvedAnswer}</p>
        </div>
      ) : null}
      {evaluation.followUpQuestions?.length ? (
        <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-sm font-semibold text-slate-100">Follow-up questions</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
            {evaluation.followUpQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function RubricCard({ item }: { item: SystemDesignCase }) {
  return (
    <div className="panel rounded-[2rem] p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
        Rubric
      </p>
      <div className="mt-4 space-y-3">
        {Object.entries(item.rubric).map(([key, value]) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm"
          >
            <span className="capitalize text-slate-300">{key}</span>
            <span className="font-semibold text-slate-100">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelAnswer({ item }: { item: SystemDesignCase }) {
  const sections = [
    ["Overview", item.modelAnswer.overview],
    ["Data flow", item.modelAnswer.dataFlow],
    ["Storage model", item.modelAnswer.storageModel],
    ["Processing", item.modelAnswer.processing],
    ["Reliability", item.modelAnswer.reliability],
    ["Trade-offs", item.modelAnswer.tradeoffs],
    ["Interview framing", item.modelAnswer.interviewFraming]
  ];

  return (
    <section className="panel rounded-[2rem] p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
        Model answer
      </p>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {sections.map(([title, body]) => (
          <div key={title} className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
            <p className="text-sm font-semibold text-slate-50">{title}</p>
            <p className="mt-3 text-sm leading-7 text-slate-300">{body}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
          Follow-up questions
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-50">
          {item.followUps.map((followUp) => (
            <li key={followUp}>{followUp}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="panel rounded-[2rem] p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
        {title}
      </p>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div
            key={item}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm leading-6 text-slate-300"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function LockedCase({ item }: { item: SystemDesignCase }) {
  return (
    <section className="panel rounded-[2rem] border border-amber-300/20 p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
        Premium system design case
      </p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">{item.title}</h2>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">{item.shortDescription}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {item.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300"
          >
            {tag}
          </span>
        ))}
      </div>
      <p className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/50 p-5 text-sm leading-7 text-slate-300">
        This locked preview still shows the skill you will practice. Premium unlocks the full
        requirements, decision questions, model answer, rubric evaluation, and follow-ups.
      </p>
      <Link
        href="/pricing"
        className="mt-6 inline-flex rounded-full bg-amber-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-200"
      >
        Unlock premium
      </Link>
    </section>
  );
}
