# Ventus · wind intelligence

A React and Python dashboard for replaying Great Britain day-ahead wind forecast decisions in January 2026. Inspect the forecast that was available at a chosen cutoff, compare it with actual generation, and evaluate historical accuracy.

## Run with Docker

```sh
docker compose up --build
```

Open [localhost:8000](http://localhost:8000). The validated historical snapshot is included, so startup requires no Elexon credentials or ingestion. Docker Desktop must be running. Health and data readiness are separate: `/api/health` checks the process; `/api/metadata` verifies and loads the dataset.

## Run without Docker

Use Python 3.12+ and Node.js 22.12+.

```sh
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.lock.txt
npm ci
npm run build
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

For frontend development, run `npm run dev` in another terminal. Vite proxies `/api` to the Python server on port 8000. For a single-server production preview, use the built app at port 8000. Restart the Python server after changing the snapshot or rebuilding assets if their directory did not exist when it started.

## What is implemented

- Purchase-date navigation for January 1-31 and an editable UK decision cutoff.
- Day-ahead forecast and historical actual overlay, with visibility controls and publication/lead-time tooltips.
- Hourly signed-error chart, MAE, RMSE, bias, and matched-data coverage.
- Retrospective cohort analysis with a date range, daily breakdown, and drill-down.
- Accessible interval table and CSV export containing cutoff and publication provenance.
- Source request manifest, checksum verification, and in-app methodology.
- Missing-data, loading, error, retry, and boundary states.
- Docker image, Compose health check, CI, and Vercel/Heroku deployment configuration.

## Data and temporal correctness

The snapshot contains **17,864 forecast rows** and **1,488 half-hour WIND actual rows** from the supplied Elexon APIs. The extraction timestamps, request URLs, row counts, and SHA-256 checksum are recorded in `data/manifest.json` and exposed at `/api/metadata`. Data is real, not synthetic. Tests use clearly separate artificial fixtures.

**Date convention:** the brief specifies purchase decisions made in January. A decision on January 1 concerns January 2 delivery; January 31 concerns February 1. This interpretation is explicit throughout the UI and tests.

**Cutoff assumption:** no procurement cutoff was supplied. The default is **10:00 Europe/London**, editable to the minute. It is not presented as an exchange gate closure. UTC is used for all storage and joins; UK time is used in the UI. January is GMT.

**Forecast selection:** for each delivery hour, select the WINDFOR row with maximum `publishTime <= decision cutoff`. All historical publications are retained. Later revisions never enter the selected forecast. Different target hours can select different publications if needed; all selected publication times are exposed.

**Resolution:** live responses and Elexon's [wind methodology](https://bmrs.elexon.co.uk/wind-generation) confirm hourly WINDFOR values. FUELHH contains average MW over each half-hour. We compare each hourly forecast with the arithmetic mean of the two corresponding actual half-hours. Both must be present. This is an explicit comparison convention; forecast and outturn measurement definitions are not claimed to be identical. We neither interpolate the forecast nor count it as two independent observations.

**Metrics:** error = forecast − actual; positive bias means overforecast wind. MAE = mean absolute error; RMSE = square root of mean squared error; bias = mean signed error. All use matched pairs only, in MW. Coverage uses the complete expected hourly grid as its denominator. Cohort RMSE is computed across all matched hours, not averaged from daily RMSEs. No MAPE or unsupported probabilistic confidence interval is used.

At the default cutoff, all **744 of 744** delivery hours are matched. January-cohort MAE is approximately **2,013 MW**, RMSE **2,506 MW**, and bias **+1,730 MW**. These describe the included metered-wind series under the specified comparison convention. They do not establish accuracy for every renewable asset or quantify a utility's purchase requirement.

Actuals are the retrieved source series and may include revisions. Full-month accuracy is retrospective and is not displayed as risk information that was available at an earlier decision. Demand, prices, portfolio exposure, and contracted positions are outside scope.

## Reproduce ingestion

```sh
python scripts/ingest.py
# Force fresh upstream responses:
python scripts/ingest.py --refresh
```

No API key is required. Three concurrent workers request one-day windows with finite timeouts and bounded transient-error retries. Raw responses and their extraction metadata are cached in ignored `data/raw/`. Normal dashboard requests never fetch upstream data.

- WINDFOR: explicit publication windows December 29 through the end of January; targets are subsequently filtered to the delivery cohort. Earlier publications cover the observed forecast horizon. Coverage is checked rather than filling gaps.
- FUELHH: settlement-date requests for January 2 through February 1 with `fuelType=WIND`. Settlement and publication filters are never mixed.
- Exact duplicates are removed; conflicting values with the same target and publication fail validation. Actual revisions select the latest retrieved publication. Required fields, nonnegative finite numbers, timestamps, resolution, settlement date/period, and dataset identities are validated.
- The snapshot and manifest are written only after the complete extraction and validation succeeds. Restart the backend after replacing them; it caches one validated dataset per process.

The supplied FUELHH example used the label `FUELINST`; real responses correctly identify `FUELHH`. The adapter validates the actual dataset identity.

## Tests and checks

```sh
python -m pip install -r requirements-dev.txt
python -m pytest backend/tests -q
npm test
npm run build
```

The backend suite covers exact cutoff eligibility, future-publication exclusion, missing half-hours, zero generation, duplicate/conflicting records, revisions, month and DST boundaries, pooled metric arithmetic, API validation, snapshot corruption, ingestion query construction, and real-snapshot coverage. One independent live sample verifies the first delivery hour: forecast 18,699 MW; actual mean `(15,228 + 15,505) / 2 = 15,366.5 MW`; signed error 3,332.5 MW.

Frontend workflow tests cover cutoff/date requests, unavailable data and retry, and cohort drill-down. Browser QA additionally checks the actual charts, date navigation, cutoff updates, daily drill-down, data provenance, methodology, and mobile layout. See `docs/VERIFICATION.md` for the measured results and remaining environment limitations.

GitHub Actions runs both suites, a production build, Docker build, and container smoke tests. It uses the committed snapshot and does not depend on live Elexon availability.

## Architecture and files

```text
frontend/src/          React TypeScript UI, charts, abortable API hook, workflow tests
backend/app/domain.py  Pure forecast selection, time alignment, and metric functions
backend/app/main.py    FastAPI endpoints, snapshot integrity, and SPA serving
backend/tests/        Domain, ingestion-contract, real-snapshot, and API tests
scripts/ingest.py      Explicit source extraction, validation, caching, and manifest
data/                 Validated snapshot and full extraction provenance
api/index.py          Vercel Python entrypoint exporting the same FastAPI app
public/               Favicon and static assets
docs/                 Architecture decisions, verification, licence, demo, and delivery notes
Dockerfile            Multi-stage React build and non-root Python runtime
compose.yaml          Local execution and dataset-aware health check
vercel.json           Vite assets and Python function routing
vercel.temporary.json  Explicit prebuilt-asset configuration for local temporary deploys
heroku.yml / Procfile  Heroku container configuration and Python process definition
.github/workflows/    CI build and test gates
PROJECT_PLAN.md       Original engineering baseline and assumptions
```

A single modular backend serves a fixed-month read-only snapshot. This avoids database provisioning, background workers, and unpredictable upstream latency for this pilot. Domain functions have no web or network dependency. See `docs/ARCHITECTURE.md` for the tradeoffs.

## Deployment

Deployment status and live links are maintained in `docs/DELIVERY.md`. A temporary preview, if present, expires unless claimed and is not a durable submission URL.

### Vercel

Import the repository into an authenticated Vercel account or run `npx vercel --prod` from a logged-in environment. The default configuration builds Vite assets, detects `api/index.py` as a Python function, bundles the source snapshot, and routes `/api/*` to FastAPI. Verify `/api/metadata`, a decision-day response, and the chart after deployment. The source snapshot is about 2.3 MB; no filesystem writes are required at runtime.

The logged-out CLI also supports a temporary deployment. On Windows, the combined automatic build can fail to spawn its static-build shell. The explicit fallback uses a prebuilt `dist` directory:

```sh
npm run build
# uv must be on PATH for the local Python builder:
python -m pip install uv
npx vercel deploy --temporary --yes --local-config vercel.temporary.json
```

The CLI's private claim URL grants control of the temporary deployment. Keep it private, outside commits and public screenshots. Use an account-owned production deployment for final submission.

### Heroku

Use an authenticated account with a compatible container deployment workflow. For Cedar-generation apps, the documented Container Registry path is:

```sh
heroku container:login
heroku create <anonymous-app-name> --stack container
heroku container:push web --app <anonymous-app-name>
heroku container:release web --app <anonymous-app-name>
```

The runtime binds to `$PORT`, uses the same image as local execution, and keeps no mutable application state. Platform charges depend on the account's selected service; no paid resources are required by local execution. See [Heroku's container documentation](https://devcenter.heroku.com/articles/container-registry-and-runtime) for account-generation compatibility.

## Handover and AI disclosure

AI assistance (OpenAI Codex) was used for requirements analysis, architecture, source implementation, styling, test authoring, documentation, and verification. Real API responses were inspected, the analytic comparison was explicitly documented, and tests validate the critical temporal and arithmetic rules. AI assistance does not replace the recorded tests or establish market-domain guarantees.

The required two-part demonstration is scripted in `docs/DEMO_SCRIPT.md`. The final unlisted YouTube video must be at most ten minutes, with at most five minutes for each part. Delivery notes distinguish generated local artifacts from published, publicly verified links.

Contains BMRS data © Elexon Limited copyright and database right 2026. [BMRS data licence](https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/). This independent application is not endorsed by Elexon.
