import { hubMetadata } from "../../lib/discovery";

import { PracticeHub } from "../../components/practice-hub";

export const metadata = hubMetadata("/labs");

export default function LabsPage() {
  return <PracticeHub />;
}
