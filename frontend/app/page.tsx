import Link from "next/link";
import { TrackedLink } from "../components/tracked-link";
import { BRAND } from "../lib/product";
import { getRecommendedScenarioSlug } from "../lib/scenarios";
import styles from "./home.module.css";

const otherPractice = [
  {
    label: "Data Modelling",
    title: "Handle a backdated territory change",
    description: "Write sale-time and effective-as-of reports from territory history.",
    href: "/labs/data-modelling"
  },
  {
    label: "Project Sandbox",
    title: "Replay an order feed safely",
    description: "Build linked SQL stages and test replay and late cancellations in your browser.",
    href: "/projects/ecommerce-pipeline"
  }
];

export default function HomePage() {
  const firstFreeScenarioHref = `/scenarios/${getRecommendedScenarioSlug()}`;

  return (
    <main className={styles.home}>
      <div className={styles.content}>
        <section aria-labelledby="home-title" className={styles.hero}>
          <div className={styles.intro}>
            <h1 id="home-title" className={styles.title}>
              Practice data engineering on real problems
            </h1>
            <p className={styles.lead}>Inspect data, make a decision, and check the result.</p>
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
            <p id="free-sql-account" className={styles.account}>
              No sign-in for the sample. A free account is required to submit for evaluation.
            </p>
          </div>

          <figure className={styles.preview} aria-labelledby="home-preview-title">
            <figcaption>
              <p className={styles.previewLabel}>Exercise preview</p>
              <h2 id="home-preview-title">Fix a revenue report</h2>
            </figcaption>
            <p className={styles.previewTask}>
              Use <code>orders</code> and <code>customers</code> to return one row per customer from completed orders.
            </p>
            <table className={styles.sample}>
              <caption>Supplied example result</caption>
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

        <section className={styles.practice} aria-labelledby="practice-starts-title">
          <h2 id="practice-starts-title" className={styles.sectionTitle}>More ways to practise</h2>
          <ul className={styles.routes}>
            {otherPractice.map(({ label, title, description, href }) => (
              <li key={href}>
                <Link href={href} className={styles.route}>
                  <span className={styles.routeLabel}>{label}</span>
                  <span className={styles.routeText}>
                    <span className={styles.routeTitle}>{title}</span>
                    <span className={styles.routeDescription}>{description}</span>
                  </span>
                  <span className={styles.routeArrow} aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
          <TrackedLink
            id="homepage-catalogue-link"
            href="/labs"
            event="homepage_start_clicked"
            eventPayload={{ choice: "explore_labs" }}
            className={styles.textLink}
          >
            Browse all practice
          </TrackedLink>
        </section>

        <section className={styles.premium} aria-labelledby="premium-title">
          <div>
            <h2 id="premium-title" className={styles.sectionTitle}>Premium guided practice</h2>
            <p className={styles.premiumLead}>Work through more scenarios with hints, model explanations and follow-up questions.</p>
            <Link href="/scenarios/revenue-drop-new-successful-status" className={styles.example}>
              Revenue Dropped 30% After New SUCCESSFUL Status
            </Link>
            <p className={styles.qualification}>
              Guided practice only. SQL checks cover the supplied example, and explanation feedback is advisory.
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
