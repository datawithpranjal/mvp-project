import codingLabData from "../data/coding-labs.generated.json";
import { pysparkLabData } from "../data/pyspark-labs.generated";
import publicSqlPracticeData from "../data/public-sql-practice.generated.json";
import {
  filterLaunchReady,
  isLaunchReadyCodingLab,
  type LaunchReadyFilterOptions
} from "./launch-ready-content";

export type CodingLabTrack = "sql" | "python" | "pyspark";
export type CodingLabDifficulty = "beginner" | "intermediate" | "advanced";

export interface CodingLabTable {
  name: string;
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
}

export interface PythonTestCase {
  name: string;
  args: unknown[];
  expected: unknown;
}

export interface SqlTestCase {
  name: string;
  description: string;
  tables: CodingLabTable[];
  expectedSql?: string;
}

export interface CodingLab {
  id: string;
  slug: string;
  track: CodingLabTrack;
  title: string;
  difficulty: CodingLabDifficulty;
  section: string;
  topicTags: string[];
  isFree: boolean;
  estimatedMinutes: number;
  businessContext: string;
  problemStatement: string;
  expectedOutcome?: string;
  studentTask: string;
  starterCode: string;
  solutionCode: string;
  explanation: string;
  hints: string[];
  tables: CodingLabTable[];
  expectedSql?: string;
  sqlTestCases?: SqlTestCase[];
  functionName?: string;
  testCases?: PythonTestCase[];
  validationKeywords?: string[];
  commonMistakes?: string[];
  launchReady?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").filter(Boolean)
    : [];
}

function tableArray(value: unknown): CodingLabTable[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((table) => ({
    name: stringValue(table.name),
    columns: stringArray(table.columns),
    rows: Array.isArray(table.rows)
      ? table.rows.filter(Array.isArray) as CodingLabTable["rows"]
      : []
  })).filter((table) => table.name && table.columns.length > 0);
}

function testCaseArray(value: unknown): PythonTestCase[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((testCase) => ({
    name: stringValue(testCase.name, "Sample case"),
    args: Array.isArray(testCase.args) ? testCase.args : [],
    expected: testCase.expected
  }));
}

function sqlTestCaseArray(value: unknown): SqlTestCase[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((testCase) => ({
    name: stringValue(testCase.name, "Edge case"),
    description: stringValue(testCase.description),
    tables: tableArray(testCase.tables),
    expectedSql: stringValue(testCase.expectedSql) || undefined
  })).filter((testCase) => testCase.tables.length > 0);
}

function normalizeTrack(value: unknown): CodingLabTrack {
  if (value === "python" || value === "pyspark") return value;
  return "sql";
}

function normalizeDifficulty(value: unknown): CodingLabDifficulty {
  if (value === "advanced" || value === "intermediate" || value === "beginner") {
    return value;
  }
  return "intermediate";
}

function normalizeLab(value: unknown): CodingLab | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const slug = stringValue(value.slug);
  const title = stringValue(value.title);

  if (!id || !slug || !title) return null;

  return {
    id,
    slug,
    title,
    track: normalizeTrack(value.track),
    difficulty: normalizeDifficulty(value.difficulty),
    section: stringValue(value.section, "Coding Lab"),
    topicTags: stringArray(value.topicTags),
    isFree: Boolean(value.isFree),
    estimatedMinutes: typeof value.estimatedMinutes === "number" ? value.estimatedMinutes : 15,
    businessContext: stringValue(value.businessContext),
    problemStatement: stringValue(value.problemStatement),
    expectedOutcome: stringValue(value.expectedOutcome) || undefined,
    studentTask: stringValue(value.studentTask),
    starterCode: stringValue(value.starterCode),
    solutionCode: stringValue(value.solutionCode),
    explanation: stringValue(value.explanation),
    hints: stringArray(value.hints),
    tables: tableArray(value.tables),
    expectedSql: stringValue(value.expectedSql) || undefined,
    sqlTestCases: sqlTestCaseArray(value.sqlTestCases),
    functionName: stringValue(value.functionName) || undefined,
    testCases: testCaseArray(value.testCases),
    validationKeywords: stringArray(value.validationKeywords),
    commonMistakes: stringArray(value.commonMistakes),
    launchReady: isLaunchReadyCodingLab(slug)
  };
}

export const ALL_CODING_LABS = [
  ...(codingLabData as unknown[]),
  ...(pysparkLabData as unknown[]),
  ...(publicSqlPracticeData as unknown[])
]
  .map(normalizeLab)
  .filter((lab): lab is CodingLab => Boolean(lab));

export const CODING_LABS = filterLaunchReady(ALL_CODING_LABS);

export function getCodingLabs(
  track?: CodingLabTrack,
  options: LaunchReadyFilterOptions = {}
): CodingLab[] {
  const labs = filterLaunchReady(ALL_CODING_LABS, options);
  return track ? labs.filter((lab) => lab.track === track) : labs;
}

export function getCodingLabBySlug(
  slug: string,
  options: LaunchReadyFilterOptions = {}
): CodingLab | undefined {
  return filterLaunchReady(ALL_CODING_LABS, options).find((lab) => lab.slug === slug);
}

export function getCodingLabStats(track: CodingLabTrack) {
  const labs = getCodingLabs(track);
  return {
    total: labs.length,
    free: labs.filter((lab) => lab.isFree).length,
    premium: labs.filter((lab) => !lab.isFree).length
  };
}

export function formatTrackLabel(track: CodingLabTrack): string {
  if (track === "sql") return "SQL";
  if (track === "pyspark") return "PySpark";
  return "Python";
}
