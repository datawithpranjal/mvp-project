import { ALL_OPERATIONS_LABS } from "../data/platform-operations-labs";
import { ALL_CODING_LABS } from "./coding-labs";
import { ALL_SCENARIOS } from "./scenarios";
import { ALL_SYSTEM_DESIGN_CASES } from "./system-design";
import type { ContentAuditItem } from "./types";

export function getContentAuditCatalog(): ContentAuditItem[] {
  return [
    ...ALL_CODING_LABS.map((lab): ContentAuditItem => ({
      content_id: `coding--${lab.track}--${lab.slug}`,
      content_type: `${lab.track}_coding_lab`,
      title: lab.title,
      slug: lab.slug,
      topic: lab.section || lab.track,
      difficulty: lab.difficulty,
      tags: lab.topicTags,
      problem_statement: lab.problemStatement,
      expected_output:
        lab.expectedOutcome ||
        lab.expectedSql ||
        lab.testCases?.map((testCase) => `${testCase.name}: ${JSON.stringify(testCase.expected)}`).join("\n") ||
        null,
      solution: lab.solutionCode,
      explanation: lab.explanation,
      body: [
        lab.businessContext,
        lab.problemStatement,
        lab.studentTask,
        lab.starterCode,
        lab.expectedOutcome,
        lab.explanation
      ]
        .filter(Boolean)
        .join("\n\n"),
      internal_links: [],
      prerequisites: [],
      estimated_minutes: lab.estimatedMinutes,
      metadata: {
        launch_ready: Boolean(lab.launchReady),
        is_free: lab.isFree,
        source: "frontend_coding_labs"
      }
    })),
    ...ALL_OPERATIONS_LABS.map((lab): ContentAuditItem => ({
      content_id: `operations--${lab.track}--${lab.slug}`,
      content_type: `${lab.track}_operations_lab`,
      title: lab.title,
      slug: lab.slug,
      topic: lab.track,
      difficulty: lab.difficulty,
      tags: lab.skills,
      problem_statement: lab.problemStatement,
      expected_output: Object.values(lab.modelAnswer).join("\n\n"),
      solution: Object.values(lab.modelAnswer).join("\n\n"),
      explanation: lab.modelAnswer.diagnosis,
      body: [
        lab.businessContext,
        lab.problemStatement,
        lab.evidence,
        lab.studentTask,
        Object.values(lab.modelAnswer).join("\n\n")
      ].join("\n\n"),
      internal_links: [],
      prerequisites: [],
      estimated_minutes: lab.estimatedMinutes,
      metadata: {
        launch_ready: Boolean(lab.launchReady),
        is_free: lab.isFree,
        source: "frontend_operations_labs"
      }
    })),
    ...ALL_SCENARIOS.map((scenario): ContentAuditItem => ({
      content_id: `scenario--${scenario.slug}`,
      content_type: `${scenario.domain}_${scenario.scenarioType}_scenario`,
      title: scenario.title,
      slug: scenario.slug,
      topic: scenario.domain,
      difficulty: scenario.difficulty,
      tags: scenario.tags,
      problem_statement: scenario.problemStatement,
      expected_output: scenario.expectedOutput || scenario.expectedSql || null,
      solution: scenario.modelSolution,
      explanation: scenario.productionExplanation,
      body: [
        scenario.businessContext,
        scenario.problemStatement,
        scenario.requirement,
        scenario.brokenCode,
        scenario.logs,
        scenario.productionExplanation
      ]
        .flat()
        .filter(Boolean)
        .join("\n\n"),
      internal_links: scenario.relatedProjectMissionId
        ? [`/projects/ecommerce-pipeline#${scenario.relatedProjectMissionId}`]
        : [],
      prerequisites: [],
      estimated_minutes: scenario.estimatedMinutes,
      metadata: {
        launch_ready: Boolean(scenario.launchReady),
        is_free: scenario.isFree,
        source: "frontend_scenarios"
      }
    })),
    ...ALL_SYSTEM_DESIGN_CASES.map((item): ContentAuditItem => ({
      content_id: `system-design--${item.slug}`,
      content_type: "system_design_case",
      title: item.title,
      slug: item.slug,
      topic: item.domain,
      difficulty: item.difficulty,
      tags: item.tags,
      problem_statement: `${item.businessContext}\n\n${item.learnerTask}`,
      expected_output: item.architectureStages.join("\n"),
      solution: Object.values(item.modelAnswer).join("\n\n"),
      explanation: item.modelAnswer.interviewFraming,
      body: [
        item.shortDescription,
        item.businessContext,
        item.functionalRequirements.join("\n"),
        item.nonFunctionalRequirements.join("\n"),
        item.badArchitecture,
        item.learnerTask,
        Object.values(item.modelAnswer).join("\n\n")
      ].join("\n\n"),
      internal_links: [],
      prerequisites: [],
      estimated_minutes: item.estimatedMinutes,
      metadata: {
        launch_ready: Boolean(item.launchReady),
        is_free: item.isFree,
        source: "frontend_system_design"
      }
    }))
  ];
}

export function getContentAuditCatalogItem(contentId: string): ContentAuditItem | undefined {
  return getContentAuditCatalog().find((item) => item.content_id === contentId);
}
