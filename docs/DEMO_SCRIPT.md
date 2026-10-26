# Two-part demonstration

The generated local walkthrough uses actual application captures and synthetic Microsoft David narration. It is a review artifact, not a claim of a human-recorded presentation or a published YouTube video. Each part must remain below five minutes; the combined artifact must remain below ten minutes.

## Part 1: Client presentation

### 01 — Day-ahead overview

Welcome to Ventus, a pilot for understanding the wind forecast behind a day-ahead purchasing decision. This is a historical replay using real Elexon data, with synthetic narration for this walkthrough. We select January fifteenth as the delivery date. Forecast available as of shows January fourteenth at ten in the morning, so both dates are explicit. The main chart compares that forecast with actual outturn. The summary shows an average forecast of about eleven thousand six hundred and seventy-eight megawatts, with twenty-four matched hours. Actual generation is shown retrospectively; it was not known when purchasing.

### 02 — Earlier cutoff

Changing the cutoff from ten to eight in the morning reconstructs a different information set. The latest selected publication moves from nine thirty to seven thirty. The forecast and error metrics change together. This matters because evaluating a forecast using a revision published after the purchase decision would make its performance look better than the trader could actually have achieved. The cutoff remains configurable because the brief did not specify the purchasing team's deadline. The application labels it as an assumption rather than claiming it is a market gate closure.

### 03 — Forecast accuracy

The accuracy view uses delivery dates for its range, chart, and daily breakdown. January second through February first covers the original January purchase decisions. At the default ten o'clock time on each previous day, all seven hundred and forty-four delivery hours have a valid comparison. The mean absolute error is about two thousand and thirteen megawatts; the positive bias indicates that wind was overforecast on average. Root mean square error gives extra weight to larger errors. These are retrospective measurements, not a recommended purchase buffer or a probabilistic guarantee.

### 04 — Methodology and limits

The methodology is visible inside the product. Forecasts are hourly, while actuals are half-hour averages. We compare with the mean of both corresponding actual observations and require both to be present. Missing data stays missing, and coverage is always displayed. National metered-wind generation does not represent a utility's customer demand, contracted positions, or prices, so these two APIs alone cannot calculate its required purchase volume. The pilot helps the team inspect available forecasts and understand measured forecast error, with clear source provenance and explicit limits.

## Part 2: Technical review

### 05 — Architecture

The implementation is a modular monolith: a React and TypeScript interface calls a Python FastAPI service. A separate ingestion command requests explicit historical publication windows for forecasts, and settlement dates for WIND actuals. It never mixes the mutually exclusive date filter families. Source responses are cached locally and validated before the normalized snapshot is published. The manifest records request URLs, extraction timestamps, row counts, and a checksum. Normal dashboard requests read that validated snapshot, so the pilot remains reproducible and does not depend on live Elexon availability for every page load.

### 06 — Temporal selection and arithmetic

The domain layer is independent of the web framework. For each target hour, forecast candidates are ordered by publication time and filtered to publications at or before the decision cutoff. The latest eligible one is selected. Both actual half-hours must exist before their mean is computed. Error equals forecast minus actual. Metric functions use matched pairs only, while the complete delivery grid supplies the coverage denominator. Monthly root mean square error is pooled across observations, not averaged from daily values. Conflicting duplicate source records fail validation instead of being chosen arbitrarily.

### 07 — Verification

Thirty-six backend tests cover temporal eligibility, exact cutoff boundaries, future revision exclusion, missing and zero actuals, conflicting records, metric arithmetic, date bounds, daylight saving, API validation, and checksum failures. Five frontend workflow tests cover delivery mapping, forecast timestamps, date boundaries, unavailable data and retry, and cohort drill-down. Browser checks verify the real charts and native input interaction. An independent source sample checks the first hour against two actual readings. Continuous integration verifies tests, the production build, the Docker image, and a container runtime smoke test on Ubuntu.

### 08 — Delivery and handover

The Docker image builds the React assets and serves them with Python under a non-root user. Compose includes a data-readiness health check. The public repository has an anonymous name and includes startup instructions, architecture decisions, the data licence, and an explicit AI assistance disclosure. The local application is verified. A temporary Vercel deployment was created, but public checks received an edge four-oh-three, so it is not presented as a working hosted demo. Durable hosting and an authenticated unlisted YouTube upload remain external delivery steps. The software, reproducible dataset, tests, and this local two-part walkthrough are ready for review.
