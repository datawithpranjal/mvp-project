import { ComingSoonFeature } from "../../components/coming-soon-feature";

export default function MockInterviewPage() {
  return (
    <ComingSoonFeature
      eyebrow="Mock Interview"
      title="Structured Data Engineering interviews are coming soon."
      description="A focused interview room for answering SQL, PySpark, Airflow, production scenario, and system design questions with timed practice and rubric-based feedback."
      plannedFeatures={[
        "SQL, PySpark, Airflow, and mixed interview modes",
        "Optional interview timer",
        "Root-cause and communication scoring",
        "Strong-answer comparison after each attempt",
        "Personalized lab recommendations"
      ]}
    />
  );
}
