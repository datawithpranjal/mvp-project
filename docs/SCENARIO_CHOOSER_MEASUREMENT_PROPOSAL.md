# Scenario chooser measurement proposal

Status: proposed only. No chooser event is emitted, no analytics union/transport is changed, and no new storage is added. Analytics/Dev acceptance is required before instrumentation. Coverage is unavailable for this local candidate; no observed learner/conversion effect.

The existing `trackEvent` transport (`frontend/lib/analytics.ts`) pushes finite action records to `window.dataLayer` and dispatches `data-foundry-analytics`. Its current `AnalyticsEvent` union does not accept the three proposed names. Do not overload signup, recommendation or completion events. Existing usage transport/session linkage is a separate contract and is not changed here.

| Proposed finite action | Trigger after acceptance | Allowed metadata |
|---|---|---|
| `chooser_opened` | Successful modal opening, once per opening | current_slug, domain, access_tier, surface |
| `chooser_item_selected` | Current or other row selection | current_slug, target_slug, domain, access_tier, surface |
| `chooser_no_results` | First zero-result state for each changed normalized query within one opening | current_slug, surface |

`surface` has the single value `scenario_workspace`. `access_tier` is the public catalog tier `free` or `premium`, never inferred user entitlement. Slugs/domains must be validated against the launch-ready public catalog; no free-form values. Deduplicate no-results transitions in memory only, using the current normalized query solely for comparison; never emit/store the query, query hash, learner answer, identity, account, email or token. Do not create persistent chooser/session identifiers. Closing/opening may reset in-memory deduplication after the accepted contract defines its desired counting unit.

Report sessions selecting after opening / sessions opening only if the existing session linkage is verified and approved; this transport alone does not establish it. Report zero-result sessions and sample sizes. Pair selected targets with later practice starts only under verified linkage; selection is not learning, entitlement or purchase. Any seven-day production comparison follows separately approved exposure and comparable cohorts; no causal conversion claim from clicks.
