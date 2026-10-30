import type { ReactNode } from "react";
import { hubMetadata } from "../../lib/discovery";

export const metadata = hubMetadata("/roadmap");

export default function RoadmapMetadataLayout({ children }: { children: ReactNode }) {
  return children;
}
