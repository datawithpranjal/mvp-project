"use client";

import type { ScenarioDetail, ValidationResponse, ValidationType } from "../lib/types";
import { DataTable } from "./data-table";

interface ResultPanelProps {
  scenario: ScenarioDetail;
  result: ValidationResponse | null;
}

export function ResultPanel({ scenario, result }: ResultPanelProps) {
  const isSqlScenario = scenario.validation_type === "SQL_OUTPUT_MATCH";

  if (!result) {
    return (
      <div className="panel min-w-0 rounded-3xl p-5">
        <h3 className="text-lg font-semibold text-slate-50">Result</h3>
        <p className="mt-2 text-sm text-slate-400">
          {isSqlScenario
            ? "Run your SQL to see pass/fail feedback, the output your query produced, and the canonical solution."
            : "Submit your answer to reveal the model answer, explanation, and rubric checklist for this scenario."}
        </p>
      </div>
    );
  }

  const status = getStatus(result.validation_type, result.passed);
  const solutionHeading = isSqlScenario ? "Canonical Query" : "Model Answer";
  const solutionDescription = isSqlScenario
    ? "Reference query used by the validator to produce the expected result."
    : "Reference answer you can compare against your debugging or design response.";

  return (
    <div className="space-y-4">
      <div className={`panel rounded-3xl p-5 ${status.containerClassName}`}>
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-50">{status.title}</h3>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${status.badgeClassName}`}>
            {status.badgeLabel}
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-200">{result.message}</p>
        <p className="mt-4 text-sm leading-6 text-slate-300">{result.explanation}</p>
      </div>

      <div className="panel rounded-3xl p-5">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-50">{solutionHeading}</h3>
          <p className="mt-1 text-sm text-slate-400">{solutionDescription}</p>
        </div>
        <div className="panel-strong max-w-full overflow-hidden rounded-2xl">
          <pre className="m-0 overflow-x-auto p-4 text-sm leading-7 text-amber-100">
            {result.solution_answer}
          </pre>
        </div>
      </div>

      {result.rubric.length > 0 ? (
        <div className="panel rounded-3xl p-5">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-50">Rubric Checklist</h3>
            <p className="mt-1 text-sm text-slate-400">
              Use this checklist to compare your answer against the key interview signals.
            </p>
          </div>
          <div className="space-y-3">
            {result.rubric.map((item) => (
              <div
                key={`${item.point}-${item.weight}`}
                className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm leading-6 text-slate-200">{item.point}</p>
                  <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                    {item.weight} pts
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="panel rounded-3xl p-5">
        <h3 className="text-lg font-semibold text-slate-50">Common Mistakes</h3>
        <div className="mt-4 space-y-3">
          {scenario.common_mistakes.map((mistake) => (
            <div
              key={mistake}
              className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm leading-6 text-slate-300"
            >
              {mistake}
            </div>
          ))}
        </div>
      </div>

      {result.actual_output ? (
        <DataTable
          title="Your Query Output"
          subtitle="Rows returned by your submission after deterministic result sorting."
          columns={result.actual_output.columns}
          rows={result.actual_output.rows}
        />
      ) : null}
    </div>
  );
}

function getStatus(validationType: ValidationType, passed: boolean | null): {
  title: string;
  badgeLabel: string;
  badgeClassName: string;
  containerClassName: string;
} {
  if (validationType === "SQL_OUTPUT_MATCH") {
    if (passed) {
      return {
        title: "Pass",
        badgeLabel: "Matched expected output",
        badgeClassName: "badge",
        containerClassName: "status-pass"
      };
    }

    return {
      title: "Not Yet",
      badgeLabel: "Needs debugging",
      badgeClassName: "border border-rose-400/30 bg-rose-400/10 text-rose-200",
      containerClassName: "status-fail"
    };
  }

  return {
    title: "Submission Recorded",
    badgeLabel: "Review mode",
    badgeClassName: "border border-sky-400/30 bg-sky-400/10 text-sky-100",
    containerClassName: "border border-sky-400/20 bg-sky-400/5"
  };
}
