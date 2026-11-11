import fixtures from "../data/gcp-pubsub/fixtures.json";
import policies from "../data/gcp-pubsub/policies.json";
import cases from "../data/gcp-pubsub/cases.json";
import expected from "../data/gcp-pubsub/manual-expected.json";
import sourceReview from "../data/gcp-pubsub/source-review.json";

export const GCP_PUBSUB_MANIFEST = "5d9eb95f844c3d7301e68e0be8a6517e1b6f156c75d62ada0154637a50720aa9";
export const pubsubContent = { fixtures, policies, cases, expected, sourceReview };
