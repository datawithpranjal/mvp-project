import { hubMetadata } from "../../lib/discovery";

import { SystemDesignStudio } from "../../components/system-design/SystemDesignStudio";

export const metadata = hubMetadata("/system-design");

export default function SystemDesignPage() {
  return <SystemDesignStudio />;
}
