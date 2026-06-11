import { ComingSoonFeature } from "../../components/coming-soon-feature";

export default function ProjectsPage() {
  return (
    <ComingSoonFeature
      eyebrow="Project Sandbox"
      title="End-to-end pipeline simulation is coming soon."
      description="A guided workspace for making architecture decisions, debugging incidents, and seeing the production consequences across an e-commerce data pipeline."
      plannedFeatures={[
        "Source-to-warehouse pipeline missions",
        "Architecture and partitioning decisions",
        "Production incidents with consequences",
        "Related SQL and PySpark practice",
        "Persistent mission progress"
      ]}
    />
  );
}
