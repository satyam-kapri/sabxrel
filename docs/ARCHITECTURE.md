# Architecture decisions

## 001: Modular monolith with immutable historical data

Context: one month of observations, a 16-hour assignment budget, and a public read-only demo.

Decision: one FastAPI application, a React frontend, and a validated JSON snapshot. Keep ingestion explicit and outside HTTP requests. Verify a SHA-256 manifest on first load and cache the indexed dataset per process.

Tradeoff: redeployment/restart is required after a snapshot replacement. This is suitable for a fixed cohort; a live multi-user product would move source history to durable database tables and introduce controlled refresh.

## 002: Preserve forecast vintages

Index forecasts by target hour with sorted publication timestamps. Select the latest publication at or before the decision cutoff, independently for each target. The eligible forecast cannot be replaced by a later, more accurate revision. Both publication time and lead time are returned.

Conflicting rows with the same target/publication fail validation. Exact duplicates are harmless. Retrieved actuals use the latest publication per target; actual revision history is not represented as information available at the forecast decision time.

## 003: Hourly comparison

Live WINDFOR observations are hourly, not half-hourly. Elexon's wind-generation page independently confirms hourly forecasts. Compare each hourly forecast with the mean of both corresponding half-hour actual observations. Require complete actual-hour coverage and do not interpolate forecasts. Expose source and comparison resolutions in the UI.

This convention changes the original plan's tentative half-hour comparison. It follows discovery evidence and is a documented approximation of the comparison basis, not a claim about identical forecast/outturn measurement definitions.

## 004: Decision-date cohort and configurable cutoff

January decisions imply January 2-February 1 deliveries. Construct timezone-aware UK windows, convert to UTC, use half-open intervals, and derive the grid from boundary differences. DST grids are tested even though this release's supported cohort is January.

No market cutoff was provided. Use an editable 10:00 UK default with an assumption label. Do not infer exchange rules. Report full-month metrics as retrospective; no historical risk buffer is computed from future observations.

UI revision: delivery date is now the primary selector, including the accuracy range, daily chart labels, and drill-down. Display the previous day's full date alongside “Forecast available as of” and the editable time. Convert delivery dates to previous-day decision dates only at the API boundary. Backend routes and analytic selection are unchanged. This preserves the original January decision cohort while removing the need for users to mentally add a day.

## 005: Same-origin deployment

The Docker runtime serves the built SPA and `/api` from the same origin. Vercel separates static assets and the Python function at its edge while preserving the same public URL contract. A process health endpoint is separate from dataset readiness. No credentials are required for Elexon.

## 006: Verification and reproducibility

Use independent small fixtures to test selection and metric arithmetic. Use the included real snapshot to check full cohort coverage and a hand-checked source observation. Normal CI makes no upstream data calls. Real extraction writes its source URLs, timestamps, checksums, and row counts for later reproduction.

Runtime dependency input is pinned in `requirements.txt`; the resolved local environment is captured in `requirements.lock.txt`. npm uses `package-lock.json`. Production deployment credentials and temporary deployment claim details never enter tracked source.
