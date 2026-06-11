import { ComingSoonFeature } from "../../../components/coming-soon-feature";

export default function EcommercePipelinePage() {
  return (
    <ComingSoonFeature
      eyebrow="Project Sandbox"
      title="The E-commerce Pipeline Simulator is coming soon."
      description="This sandbox will let learners move from source events to bronze, silver, gold, orchestration, dashboard, and monitoring decisions inside one realistic project."
      plannedFeatures={[
        "Raw order-event investigation",
        "Storage and partition strategy decisions",
        "Deduplication and late-arriving data missions",
        "Gold revenue mart design",
        "Airflow and dashboard incident debugging"
      ]}
    />
  );
}
