# Wind Forecast Decision Support: Engineering Plan

Status: original planning baseline, now implemented. See `docs/DELIVERY.md` and `docs/VERIFICATION.md` for verified outcomes and remaining external delivery steps.

Sources: `requirements.pdf`, all three pages, and the API documentation/examples supplied by the user. Endpoint names, documented filters, and sample schemas are now recorded below. Live API access, actual response schemas, historical data availability, and deployment credentials have not been validated.

## 1. Product objective and boundaries

Build a web application for a UK utility's day-ahead purchasing team to:

1. Inspect the latest national wind generation forecast available at a selected purchase decision time.
2. Quantify how those decision-time forecasts compared with actual wind generation.
3. Understand forecast error, data completeness, and the limitations of the analysis.

The brief limits data to Elexon national wind forecasts and actuals. These data cannot determine the utility's purchase volume: customer demand, its renewable portfolio, contracted positions, and prices are absent. The product provides forecast decision support, not a trading recommendation or an automated procurement system.

### Required constraints

- React frontend and Python backend.
- Docker-based local execution.
- Sample application deployed on Vercel or Heroku.
- Data relevant to purchase decisions made in January 2026.
- At most 16 hours of assignment work; no submission deadline specified.
- Public GitHub repository with an anonymous name.
- README: repository structure, startup instructions, deployed URL, and explicit AI assistance disclosure.
- Unlisted YouTube demonstration, no longer than 10 minutes: client presentation and technical walkthrough, each at most 5 minutes.
- Submit the required links using the supplied form and verify their accessibility in an incognito session.

### Scope priorities

| Priority | Capability | Acceptance evidence |
| --- | --- | --- |
| Must | Replay a January purchase decision and show the next delivery day's eligible forecasts | Every selected forecast has publication time at or before the cutoff |
| Must | Compare forecast and actual national wind generation | Aligned timestamps, confirmed units, and missing intervals visible |
| Must | Quantify accuracy for a selected day and January decision cohort | MAE, RMSE, bias, sample count, coverage, and sign convention displayed |
| Must | Explain provenance and methodology | Source, publication timestamp, extraction time, cutoff, and exclusions available |
| Must | Handle loading, empty data, missing forecasts, and upstream failures | Explicit UI states; no fabricated or zero-filled generation |
| Must | Reproducible startup and public demo | Docker smoke test, deployed smoke test, README, and demo links |
| Should | Error time series and daily accuracy breakdown | Traders can identify periods with larger errors |
| Could | CSV export and descriptive error percentiles | Added only after required functionality and delivery checks pass |
| Deferred | New forecast models, live trading, demand or price integration, accounts, alerts, enterprise operations | Outside the first-version scope |

## 2. Discovery and requirements baseline

### Resolve before finalizing the data implementation

1. API URLs and documentation have been received and match the datasets named in the PDF. Confirm authentication requirements, if any, through a live request.
2. Validate the documented parameters and response shape against real samples; establish boundary inclusivity, range limits, rate limits, pagination or streaming behavior, forecast units, null behavior, and duplicate/revision rules.
3. Verify that historical forecast publications are available, not merely the latest forecast for each target interval.
4. Confirm the procurement decision cutoff. Do not infer an exchange gate closure or present an arbitrary cutoff as a market rule.
5. Confirm date interpretation. Proposed default: **purchase decision dates** January 1-31, 2026, mapping to **delivery dates** January 2-February 1, 2026. If the intended cohort is January delivery dates, adjust the bounds and document the change.
6. Check that forecast and actual datasets cover comparable national wind populations and measurement definitions. Document any unresolved differences before interpreting errors.
7. Confirm deployment account access and available hosting budget before committing to a host.

### Discovery artifacts and exit condition

- A requirement-to-test checklist, recorded API samples, and a data dictionary.
- Short architecture decisions covering time semantics, revision selection, storage, and deployment.
- A complete hand-checked day and a January coverage report.
- Exit condition: one historical forecast publication can be matched to its actual interval with confirmed meaning and units, or the data limitation is explicitly recorded as a blocker to that analysis.

### Supplied upstream API contracts

The following is established from the user's documentation, not from live API verification. Both adapters should request `Accept: application/json` and validate the returned JSON array.

#### Forecasts: WINDFOR

`GET https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream`

- Supported documented filters: `publishDateTimeFrom` and `publishDateTimeTo`, both date-time strings.
- Without publication filters, the endpoint returns the latest published forecast. An unfiltered request is therefore unsuitable for January historical replay.
- Documented row fields: `dataset`, `publishTime`, `startTime`, and `generation`.
- Fetch publication windows explicitly, retain all returned revisions, then filter by target `startTime` and decision cutoff locally. Publication windows are not delivery windows.
- Request enough history before the earliest decision cutoff to establish eligible coverage. Determine the needed lookback from real data; document the extraction bounds and any remaining gaps.
- Use bounded chunks and deduplicate overlaps by series identity, target time, and publication time. Determine whether repeated keys with different generation values represent conflicts or documented revisions.

Example request shape, with placeholder values:

```text
GET /bmrs/api/v1/datasets/WINDFOR/stream
    ?publishDateTimeFrom=<UTC-publication-window-start>
    &publishDateTimeTo=<UTC-publication-window-end>
Accept: application/json
```

#### Actuals: FUELHH

`GET https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream`

- The documentation describes Great Britain generation outturn as average MW over 30-minute intervals, aggregated by fuel type.
- Prefer `settlementDateFrom` and `settlementDateTo` with `fuelType=WIND` to retrieve the intended delivery cohort. Settlement dates use exactly `yyyy-MM-dd`.
- Do not combine settlement-date filters with `publishDateTimeFrom` or `publishDateTimeTo`. The user's supplied response confirms this combination produces HTTP 400.
- The example also includes repeatable `settlementPeriod` parameters; omit them when requesting a full day.
- Documented row fields: `dataset`, `publishTime`, `startTime`, `settlementDate`, `settlementPeriod`, `fuelType`, and `generation`.
- The supplied schema example says `dataset: FUELINST` despite documenting FUELHH. Treat this as an example inconsistency to investigate in a real response; do not hardcode that example value into the FUELHH adapter.
- Filter `fuelType=WIND` again after retrieval, validate settlement metadata against `startTime`, and resolve actual revisions before joining to forecasts.

Example request shape for the provisional delivery cohort:

```text
GET /bmrs/api/v1/datasets/FUELHH/stream
    ?settlementDateFrom=2026-01-02
    &settlementDateTo=2026-02-01
    &fuelType=WIND
Accept: application/json
```

Verify whether the API's date bounds are inclusive and whether this range is permitted. Adjust request windows as needed, then enforce the agreed half-open delivery bounds locally. The example is a contract illustration, not a validated download command.

#### Adapter validation and error handling

- Validate required timestamps, numeric generation, finite values, actual fuel type, and any series identifiers found in real responses. Preserve extra source fields where useful for provenance.
- Confirm WINDFOR generation is in compatible MW and whether the wind coverage matches FUELHH before interpreting error metrics.
- Parse `application/problem+json` failures into actionable ingestion errors. Do not retry a validation HTTP 400 without correcting the request.
- Apply bounded retries to transient failures and rate limits, respecting `Retry-After` when provided.
- Add contract tests for publication-filter construction, settlement-only actual requests, JSON-array parsing, the supplied validation-error format, and unexpected dataset identifiers.

## 3. Analytical specification

### Decision-time forecast selection

For a purchase decision date D and configured local cutoff C:

1. Construct the decision timestamp in `Europe/London`, then convert it to UTC.
2. Define the delivery window as local midnight to local midnight on D+1, using a half-open interval `[start, end)`.
3. For every delivery interval t, select the forecast with the maximum `publishTime` satisfying `publishTime <= C` and matching the required series identity.
4. Exclude publications after C even when those revisions are more accurate.
5. If no eligible forecast exists, retain a missing interval and flag it. Never substitute a future forecast.
6. Expose publication timestamps and lead times. Per-interval selection can combine publications; document this policy and switch to a single coherent release if API semantics require that instead.

Fetch enough publication history to find eligible forecasts before each cutoff; do not restrict ingestion to publications during January or assume a short lookback is sufficient. Bound the final evaluated cohort by the agreed decision-date rule.

### Alignment and data integrity

- Filter actuals to `fuelType = WIND` as required by the brief.
- Preserve `startTime`, `publishTime` where applicable, series identity, source, and extraction timestamp.
- Validate generation units and the meaning of interval timestamps before calculating metrics.
- Use UTC for storage and joins; present timestamps in clearly labeled UK time.
- Match exact interval starts after confirming both endpoints' resolution. The brief specifies 30-minute actual intervals; verify the forecast resolution rather than inventing resampling rules.
- Generate the expected interval grid from timezone-aware delivery boundaries. A complete January UK day is expected to contain 48 half-hour slots; the general implementation must not hardcode this for every date.
- Deduplicate exact duplicates. Resolve conflicting revisions using documented source metadata or surface a conflict; never sum them or silently choose arbitrary rows.
- Preserve missing actuals, missing forecasts, and invalid rows as separate quality counts.
- Keep every forecast publication needed for replay. Do not overwrite older forecasts when ingesting a newer revision.
- Actuals fetched now may include later corrections. Record the extraction time and describe the analysis as decision-time forecasts compared with the retrieved actual series, unless actual publication history supports stronger claims.

### Accuracy metrics

Let F be forecast generation and A actual generation, both in the confirmed power unit. Define error `e = F - A`.

| Metric | Definition | Interpretation |
| --- | --- | --- |
| MAE | `mean(abs(e))` | Typical absolute error magnitude |
| RMSE | `sqrt(mean(e^2))` | Gives greater weight to large errors |
| Bias | `mean(e)` | Positive means wind was overforecast; negative means underforecast |
| Coverage | Valid matched pairs / expected delivery intervals | How much of the selected cohort supports the metrics |
| Matched count | Number of valid forecast/actual pairs | Makes the sample size explicit |

Compute metrics only from valid matched pairs; preserve all expected slots for coverage. For a cohort, compute metrics across all matched intervals rather than averaging daily RMSE values. Empty cohorts return unavailable metrics, not zero error.

Do not use MAPE as a primary metric because actual generation can be zero or near zero. Do not express MW as MWh. An optional energy-error calculation must multiply interval-average power error by the confirmed interval duration.

January-wide accuracy is retrospective and may use the full observed cohort. Any risk context shown for a specific historical decision must use only errors observable before that decision. If actual publication availability cannot be established, omit that historical risk feature. Descriptive error percentiles are optional and must not be labeled calibrated prediction intervals or a recommended purchase buffer.

## 4. User experience and acceptance scenarios

Use a focused dashboard with a day selector, decision cutoff, UK timezone label, and visible delivery date.

### Decision view

- Primary chart: decision-time wind forecast for the selected delivery day; actual generation can be overlaid as a labeled historical comparison.
- Summary: forecast average and peak, selected cutoff, forecast publication range, and data coverage.
- Clear gaps for absent data; chart tooltips show target time, publication time, and generation units.
- Label this as a January 2026 historical replay so a retrospective actual overlay cannot be mistaken for information available before delivery.

### Accuracy view

- MAE, RMSE, bias, matched sample count, and coverage.
- Forecast-versus-actual chart plus an error chart with the sign convention visible.
- Day and January-cohort filters; daily breakdown if time permits.
- Methodology and quality details: eligible forecast rule, actual revision limitation, missing intervals, data snapshot age, and source links.

### Key scenarios

1. Select a January decision date: the next delivery day is clear and every forecast was published by the selected cutoff.
2. Move the cutoff earlier: later publications disappear and affected chart values and metrics are recalculated.
3. Encounter a missing actual: its chart slot is missing and coverage decreases; it is not interpreted as zero wind.
4. Encounter an upstream failure: show an explicit failure or a clearly labeled previously validated snapshot.
5. Inspect an empty cohort: show unavailable metrics and a useful explanation.

## 5. Architecture and technology decisions

Proposed stack, subject to a short setup and compatibility check:

- React with TypeScript and Vite for the UI.
- A React-compatible time-series chart library selected during setup.
- Python with FastAPI, Pydantic, an HTTP client, and a small tabular transformation layer.
- Pytest for analytics and API tests; frontend component tests and one focused browser workflow.
- A modular monolith in one repository. No additional workers, queue, or distributed services are needed for a fixed-month pilot.

```text
Elexon actuals API --------+
                          +--> ingestion + schema validation
Elexon forecast API ------+          |
                                    v
                         immutable source snapshot + manifest
                                    |
                                    v
                         normalization + forecast selection
                                    |
                                    v
                         analytics service --> FastAPI --> React
```

### Data persistence and repeatability

For this fixed historical dataset, prefer an explicit ingestion command that generates a validated, read-only normalized snapshot and manifest. Keep upstream fetching out of normal dashboard requests. This makes the public demo repeatable and avoids repeatedly downloading the same month.

The manifest records request windows, extraction time, schema version, row counts, validation results, and a checksum. Preserve raw payloads locally for investigation. Confirm redistribution terms and artifact size before bundling source-derived data in a public deployment or repository. If bundling is unsuitable, ingest into durable storage and serve a cached read-only dataset. Do not rely on a hosting instance's temporary filesystem for durable data.

Future incremental refresh can be added after the pilot; a scheduler is not required for a January-only analysis.

### Proposed application API

These are internal endpoints to implement, not assertions about the upstream APIs.

| Endpoint | Responsibility |
| --- | --- |
| `GET /api/health` | Process health |
| `GET /api/metadata` | Available decision dates, cutoff policy, units, timezone, snapshot provenance, data readiness |
| `GET /api/decision-day?date=...&cutoff=...` | Delivery interval grid, eligible forecasts, publication times, actual overlay, daily metrics, quality counts |
| `GET /api/accuracy?from=...&to=...&cutoff=...` | Cohort metrics and daily breakdown using the same selection policy |

Use one shared analytics implementation for charts and metrics. Validate dates against the supported decision cohort and cutoff values against a documented format. Return deterministic structured errors and JSON-safe unavailable values. Keep upstream URLs fixed in configuration rather than accepting arbitrary fetch targets.

### Suggested repository layout

```text
frontend/src/           dashboard, charts, API client, UI states
backend/app/api/        request validation and endpoints
backend/app/domain/     selection, alignment, metrics
backend/app/data/       Elexon adapters and snapshot loading
backend/tests/          contract, analytics, integration tests
scripts/                ingestion and data validation commands
data/                   manifest and approved demo snapshot
docs/                   methodology, architecture decisions, demo outline
Dockerfile              multi-stage frontend build and Python runtime
compose.yaml            reproducible local startup
.env.example            non-secret configuration reference
.github/workflows/      checks and container build
README.md               startup, design, disclosure, limitations, delivery links
```

### Deployment choice

Proposed default: one Heroku application serving the built React assets and FastAPI on one origin. Confirm account capabilities and choose the supported deployment workflow during setup. Heroku's documented Container Registry workflow supports Docker images but is specifically scoped to Cedar-generation applications; do not assume it applies to every account or app generation.

Docker remains the local reproducibility requirement regardless of hosting workflow. If Vercel is chosen instead, verify Python runtime constraints, artifact size, and route configuration early and explicitly account for them in the design. Finalize the host during the first hour so deployment does not become a last-minute redesign.

Reference: https://devcenter.heroku.com/articles/container-registry-and-runtime

## 6. Engineering process and quality gates

1. **Requirements:** baseline scope, assumptions, API contracts, acceptance criteria, and out-of-scope items.
2. **Design:** record the selection algorithm, data model, UI outline, deployment choice, and tradeoffs in short decision notes.
3. **Implementation:** build a vertical slice from ingestion through one correct chart; then expand to the full cohort and accuracy view.
4. **Verification:** prioritize leakage prevention, temporal boundaries, data quality, arithmetic, and the end-user workflow.
5. **Release:** run CI and Docker checks, deploy, verify the public URL, and retain a known-working release for rollback.
6. **Handover:** finalize README, methodology, demo, and submission checklist.

Use small descriptive commits and maintain a brief requirement checklist. Review changes against the acceptance criteria and inspect the final diff before release. Keep a time log against the 16-hour cap. New optional features replace other optional work rather than silently increasing scope.

### Verification plan

| Layer | Essential checks |
| --- | --- |
| Forecast policy | Latest eligible revision; exact-cutoff publication; future publication excluded; no eligible forecast |
| Time and cohort | Decision-to-delivery mapping; Jan 31 maps to Feb 1 under the default; UTC/UK conversion; half-open windows |
| Data | WIND filter; units and schema; duplicate conflicts; missing values; target alignment; preserved publication history |
| Metrics | Hand-calculated MAE/RMSE/bias; sign; zero actual; no matched pairs; aggregate RMSE; correct coverage denominator |
| API | Valid response contracts; unsupported dates; invalid cutoff; dataset unavailable; sanitized error responses |
| Frontend | Date/cutoff updates; chart and metric consistency; timezone/units; loading/error/empty states; keyboard operation |
| End to end | Open app, select a date, change cutoff, verify returned series and metrics against a fixed fixture |
| Delivery | Fresh Docker startup; deployed health/data/chart smoke test; public links open without developer credentials |

Use deterministic small fixtures for automated tests; do not make ordinary CI depend on the upstream service. Perform a separate live contract check during ingestion and report the extraction timestamp. Compare one complete day independently against raw source values. Test a hand-crafted late forecast to prove look-ahead leakage is prevented.

### Operational and security baseline

- Fixed upstream allowlist, finite timeouts, bounded retries for transient failures, and request-window validation.
- Secrets supplied through environment variables and excluded from repository, image layers, and logs.
- Dependency locks, secret check, build checks, and dependency audit review in CI.
- Same-origin serving when practical; restrict CORS if services are separated.
- Structured logs for ingestion duration, invalid row counts, snapshot version, and request failures.
- Check data readiness separately from process health; the frontend must explain when the dataset is unavailable.
- Smoke-test normal dashboard responses against the local snapshot and record latency. Proposed usability target: day and cohort views render within two seconds on the reference environment after startup; measure before claiming this.

## 7. Timeboxed execution: maximum 16 hours

| Phase | Budget | Deliverable / exit gate |
| --- | --- | --- |
| Requirements and API discovery | 1.0 h | Real samples, cutoff/date assumptions recorded, hosting feasibility checked |
| Design and project setup | 1.0 h | Data contract, architecture notes, UI outline, executable skeleton |
| Ingestion and normalization | 2.0 h | Validated January decision cohort and reproducible snapshot |
| Selection and analytics | 2.0 h | Correct decision-time forecasts and tested metric functions |
| Backend endpoints | 1.0 h | Validated responses, quality metadata, failure states |
| React dashboard | 3.0 h | Decision and accuracy views with required states |
| Integrated verification and fixes | 1.5 h | Critical tests and independent source comparison pass |
| Docker, CI, deployment | 1.5 h | Reproducible local app and accessible hosted sample |
| README and handover | 1.0 h | Complete usage, methodology, limitations, and AI disclosure |
| Demo recording and link checks | 1.0 h | Two-part video within 10 minutes; submission links checked |
| Contingency | 1.0 h | API, data, or deployment defects; otherwise final polish |
| **Total** | **16.0 h** | Required product and submission package |

The estimate assumes accessible historical APIs and deployment accounts. If discovery reveals missing publication history or incompatible data definitions, document the issue immediately and re-scope transparently. At hour 10, freeze optional scope. Protect time for data correctness, deployment, and the mandatory video by dropping CSV export, percentiles, animation, or secondary breakdowns first.

## 8. Risks and responses

| Risk | Response |
| --- | --- |
| Forecast endpoint exposes only current revisions | Verify first; historical decision-time accuracy is unsupported without archived publications |
| Historical forecast/actual coverage differs | Report exclusions and coverage, and limit interpretation to matched intervals |
| Forecast and actual series have different underlying scope | Investigate definitions; disclose or block misleading accuracy claims |
| WINDFOR filters apply to publication date rather than delivery date | Fetch explicit publication windows, preserve revisions, and filter delivery targets locally |
| FUELHH request combines settlement and publication filters | Use settlement-date filters only for the actuals extraction; test adapter query construction |
| Supplied FUELHH example uses a FUELINST dataset label | Inspect live row metadata and document the discrepancy before enforcing dataset-label validation |
| Rate limits or slow requests | Chunk historical requests, use bounded retry, and build a reproducible snapshot |
| Ambiguous January boundary or purchase cutoff | Keep policies explicit and configurable; confirm with the user |
| Later revisions leak into historical replay | Enforce the cutoff in one domain function and cover it with targeted tests |
| Full-month error is presented as knowledge available earlier | Separate retrospective evaluation from any historical decision-time risk context |
| Hosting workflow or storage incompatible with the design | Prove a minimal deployment early and use durable or bundled validated data |
| Assignment time is exhausted by presentation polish | Freeze optional scope and reserve handover/demo time |

## 9. Definition of done and handover

- [ ] All required scope is traceable to acceptance evidence.
- [ ] API samples and schemas are validated; no endpoint behavior is assumed without checking.
- [ ] Decision dates, delivery dates, cutoff, units, timezone, and forecast-selection policy are visible and documented.
- [ ] The evaluated forecast was available by the historical cutoff for every matched row.
- [ ] MAE, RMSE, bias, matched count, and missing-data coverage agree with independent fixtures.
- [ ] No synthetic data is presented as real Elexon data; test fixtures remain clearly identified.
- [ ] Docker startup works from a clean checkout using documented commands.
- [ ] CI checks pass and deployed application serves actual validated data.
- [ ] Anonymous public repository contains required startup and structure documentation, deployment URL, AI disclosure, limitations, and reproducibility instructions.
- [ ] Client demo explains the purchasing context, forecast view, historical error, and product limitations within five minutes.
- [ ] Technical demo explains architecture, API ingestion, forecast vintages, metrics, tests, and deployment within five minutes.
- [ ] Combined video is at most ten minutes and available as an unlisted YouTube link.
- [ ] Repository, deployment, and video links are verified in incognito mode before submission.
- [ ] Submission form details are prepared; publication, account actions, video upload, and final submission are execution tasks to handle with the user when implementation is requested.

Next step: validate small historical responses from the supplied endpoints during discovery, then confirm coverage and the cutoff/date assumptions. No cutoff has been specified; keep it configurable and label any chosen value as an assumption. Implementation, deployment, publication, and submission have not started.
