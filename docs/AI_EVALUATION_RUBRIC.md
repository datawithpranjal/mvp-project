# AI Evaluation Rubric

The AI evaluator is intentionally provider-agnostic. A deterministic rubric fallback in `frontend/services/ai/evaluateScenarioAnswer.ts` keeps evaluation available when the AI provider cannot be reached.

## Input

- Scenario id
- Scenario title
- Problem statement
- Rubric or expected answer signals
- User answer
- Access status for the scenario

## Output

- Total score out of 100
- Dimension scores
- Strengths
- Missing points
- Improved answer suggestion
- Follow-up questions

## Dimensions

- Problem understanding
- Root-cause thinking
- Solution design
- Trade-offs
- Monitoring/testing
- Interview clarity

## Premium Safety

AI feedback should guide the learner without exposing locked model answers. If a learner does not have access to a premium scenario, feedback can mention structure and missing concepts, but should not reveal the complete solution.

## Future Provider Integration

Add a backend API endpoint for provider-based evaluation so secrets stay server-side. Keep the current TypeScript interface stable and swap the implementation behind it.
