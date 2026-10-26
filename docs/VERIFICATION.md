# Verification record

## Dataset

- Both supplied APIs were called successfully with historical filters.
- Real FUELHH rows identify `dataset=FUELHH`, `fuelType=WIND`, with 48 observations per January delivery day.
- Forecast observations are hourly; Elexon's wind-generation methodology confirms hourly forecasts in MW.
- Snapshot: 17,864 forecast rows; 1,488 half-hour actual rows; 31 delivery days.
- At 10:00 UK, coverage is 744/744 hourly pairs with no future forecast publications selected.
- Independent first-hour sample: forecast 18,699; actual halves 15,228 and 15,505; hourly actual 15,366.5; error +3,332.5 MW.

## Automated checks

- Backend: 36 tests passed, including temporal eligibility, metrics, missing data, month/DST boundaries, source contracts, API errors, and integrity validation.
- Frontend: 3 workflow tests passed, including date/cutoff changes, unavailable data with retry, and accuracy drill-down.
- Production TypeScript/Vite build passed. Vendor chart code is split into a separate bundle.
- Runtime frontend dependency audit: zero known vulnerabilities at the recorded check.
- Server health, metadata, decision-day, and cohort routes exercised with the validated snapshot.

## Browser checks

- Desktop layout checked at 1440px width with actual charts rendered.
- Cutoff changed from 10:00 to 08:00: latest selected publication changed from 09:30 to 07:30 for the selected day; displayed metrics recalculated.
- January accuracy view and daily drill-down checked.
- January 31 decision mapped to February 1 delivery; next-day navigation was disabled at the boundary.
- Native time field initially did not commit edits through the browser automation's input event; added explicit input handling and verified the corrected behavior.
- Additional mobile, table, export, provenance, and final deployment checks are recorded in the delivery log as completed.

## Environment limits

Docker Desktop is installed but its Linux engine did not become available after the standard startup attempts. Local container execution is not claimed as passed. GitHub Actions includes an independent Ubuntu Docker build and runtime smoke test; its observed status is recorded separately in `DELIVERY.md`.

No authenticated Vercel or Heroku session was present. The Windows Vercel local builder hit a missing-shell/path issue. A Build Output API workaround prepares Linux Python wheels and a minimal function package; temporary hosting must be smoke-tested before any successful-deployment claim.

The test client emits an upstream Starlette warning recommending a different HTTP client; the exercised response contracts and all backend tests pass.
