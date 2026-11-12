import Link from "next/link";
import { TrackedLink } from "../components/tracked-link";
import { BRAND } from "../lib/product";
import { getRecommendedScenarioSlug } from "../lib/scenarios";
import styles from "./home.module.css";

const otherPractice = [
  {
    label: "Data Modelling",
    description: "Backdated territory changes",
    href: "/labs/data-modelling"
  },
  {
    label: "Project Sandbox",
    description: "Safe order-feed replay",
    href: "/projects/ecommerce-pipeline"
  },
  { label: "Python practice", href: "/labs/python" },
  { label: "PySpark practice", href: "/labs/pyspark" }
];

export default function HomePage() {
  const firstFreeScenarioHref = `/scenarios/${getRecommendedScenarioSlug()}`;

  return (
    <main className={styles.home}>
      <div className={styles.content}>
        <section aria-labelledby="home-title" className={styles.hero}>
          <div className={styles.intro}>
            <h1 id="home-title" className={styles.title}>
              Practise data engineering. <span>Fix what breaks.</span>
            </h1>
            <p className={styles.lead}>
              Debug broken reports, recover pipelines, and check your decisions through practical exercises.
            </p>
            <div className={styles.actions}>
              <TrackedLink
                id="homepage-primary-start"
                href={firstFreeScenarioHref}
                event="homepage_start_clicked"
                eventPayload={{ destination: "first_free_scenario" }}
                aria-describedby="free-sql-account"
                className={styles.primary}
              >
                Try the free SQL scenario
                <span aria-hidden="true">→</span>
              </TrackedLink>
              <TrackedLink
                id="homepage-catalogue-link"
                href="/labs"
                event="homepage_start_clicked"
                eventPayload={{ choice: "explore_labs" }}
                className={styles.catalogue}
              >
                Browse all practice
              </TrackedLink>
            </div>
            <p id="free-sql-account" className={styles.account}>
              No sign-in for the sample. A free account is required to submit for evaluation.
            </p>

            <nav aria-label="Practice tracks" className={styles.practice}>
              <ul className={styles.routes}>
                {otherPractice.map(({ label, description, href }) => (
                  <li key={href}>
                    <Link href={href} className={styles.route}>
                      <span>
                        <span className={styles.routeLabel}>{label}</span>
                        {description && <span className={styles.routeDescription}>{description}</span>}
                      </span>
                      <span className={styles.routeArrow} aria-hidden="true">↗</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <figure className={styles.incident} aria-labelledby="home-incident-title">
            <figcaption>
              <p className={styles.incidentLabel}>Exercise example</p>
              <h2 id="home-incident-title">Revenue report mismatch</h2>
            </figcaption>
            <dl className={styles.incidentFacts}>
              <div>
                <dt>Symptom</dt>
                <dd>A customer revenue report is higher than expected.</dd>
              </div>
              <div>
                <dt>Inputs</dt>
                <dd className={styles.inputs}><code>orders</code> <code>customers</code></dd>
              </div>
              <div>
                <dt>Expected output</dt>
                <dd>One row per customer with completed-order revenue.</dd>
              </div>
            </dl>
            <table className={styles.sample}>
              <caption>Supplied example rows</caption>
              <thead>
                <tr>
                  <th scope="col">Customer ID</th>
                  <th scope="col">Name</th>
                  <th scope="col">Completed revenue</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>101</td><td>Asha</td><td>150</td></tr>
                <tr><td>102</td><td>Ben</td><td>50</td></tr>
              </tbody>
            </table>
          </figure>
        </section>

        <section className={styles.premium} aria-labelledby="premium-title">
          <div>
            <h2 id="premium-title" className={styles.sectionTitle}>Premium guided practice</h2>
            <p className={styles.premiumLead}>Work through more scenarios with hints, model explanations and follow-up questions.</p>
            <Link href="/scenarios/revenue-drop-new-successful-status" className={styles.example}>
              Revenue Dropped 30% After New SUCCESSFUL Status
            </Link>
            <p className={styles.qualification}>
              Guided practice uses the supplied example for SQL checks and gives advisory explanation feedback.
              Independent skill assessment is outside its scope.
            </p>
          </div>
          <div className={styles.plans}>
            <dl id="premium-duration" className={styles.terms}>
              <div>
                <dt>₹199/month</dt>
                <dd>One month from activation.</dd>
              </div>
              <div>
                <dt>₹999/year</dt>
                <dd>12 months from activation.</dd>
              </div>
            </dl>
            <TrackedLink
              id="homepage-premium-link"
              href="/pricing#unlock-premium"
              event="premium_unlock_clicked"
              eventPayload={{ source: "homepage_hero" }}
              aria-describedby="premium-duration"
              className={styles.textLink}
            >
              View Premium plans
            </TrackedLink>
          </div>
        </section>
        <p className={styles.credit}>{BRAND.trustLine}</p>
      </div>
    </main>
  );
}
