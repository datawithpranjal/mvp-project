import type { Metadata } from "next";

import { GoldCorePath } from "../../components/gold-core-path";

export const metadata: Metadata = {
  title: "Gold Core | The Data Foundry",
  description:
    "A curated 30-exercise Data Engineering practice path across SQL, Python, PySpark, production incidents, AWS, and system design."
};

export default function GoldCorePage() {
  return <GoldCorePath />;
}
