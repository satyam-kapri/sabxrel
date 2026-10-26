import { useEffect, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  Download,
  ExternalLink,
  Gauge,
  Info,
  Layers3,
  Menu,
  RefreshCw,
  ShieldCheck,
  Wind,
  X,
} from "lucide-react";
import { useApi } from "./api";
import type { Accuracy, Day, Interval, Metadata, Metrics } from "./types";

type View = "decision" | "accuracy" | "data" | "methodology";
const FIRST = "2026-01-01",
  LAST = "2026-01-31";
const fmt = (value: number | null | undefined, digits = 0) =>
  value == null
    ? "—"
    : value.toLocaleString("en-GB", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });
const dateLabel = (
  value: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", {
    ...options,
    timeZone: "Europe/London",
  });
const timeLabel = (value: string) =>
  new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
function shiftDay(value: string, by: number) {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly {
    payload?: Interval;
    name?: string;
    value?: number | string | null;
    color?: string;
  }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{label} UK time</strong>
      {payload
        .filter((p) => p.name !== "Forecast area")
        .map((p) => (
          <div key={p.name}>
            <span style={{ color: p.color }}>{p.name}</span>
            <b>{typeof p.value === "number" ? fmt(p.value) : "—"} MW</b>
          </div>
        ))}
      {row?.publishTime && (
        <small>
          Published{" "}
          {dateLabel(row.publishTime.slice(0, 10), {
            day: "numeric",
            month: "short",
          })}
          , {timeLabel(row.publishTime)} · {fmt(row.leadHours, 1)}h lead
        </small>
      )}
    </div>
  );
}

function download(day: Day) {
  const csv = [
    "decision_date,delivery_start_utc,cutoff_utc,forecast_publish_utc,forecast_mw,actual_hourly_mean_mw,error_mw,actual_half_hours",
    ...day.rows.map((r) =>
      [
        day.decisionDate,
        r.startTime,
        day.cutoffAt,
        r.publishTime ?? "",
        r.forecast ?? "",
        r.actual ?? "",
        r.error ?? "",
        r.actualHalfHours,
      ].join(","),
    ),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ventus-${day.decisionDate}-${day.cutoff.replace(":", "")}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function MetricStrip({ metrics, day }: { metrics: Metrics; day?: Day }) {
  const items = day
    ? [
        {
          label: "Average wind forecast",
          value: fmt(day.averageForecast),
          unit: "MW",
          detail: "Across available delivery hours",
          icon: Wind,
        },
        {
          label: "Mean absolute error",
          value: fmt(metrics.mae),
          unit: "MW",
          detail: "Average forecast deviation",
          icon: Activity,
        },
        {
          label: "Forecast bias",
          value:
            metrics.bias == null
              ? "—"
              : `${metrics.bias > 0 ? "+" : ""}${fmt(metrics.bias)}`,
          unit: "MW",
          detail:
            metrics.bias == null
              ? "No matched observations"
              : metrics.bias > 0
                ? "Wind generation overforecast"
                : metrics.bias < 0
                  ? "Wind generation underforecast"
                  : "No average directional error",
          icon:
            metrics.bias != null && metrics.bias < 0
              ? ArrowDownLeft
              : ArrowUpRight,
        },
        {
          label: "Data coverage",
          value: fmt(metrics.coverage * 100, 0),
          unit: "%",
          detail: `${metrics.matched} of ${metrics.expected} hourly pairs matched`,
          icon: ShieldCheck,
        },
      ]
    : [
        {
          label: "Mean absolute error",
          value: fmt(metrics.mae),
          unit: "MW",
          detail: "Typical absolute deviation",
          icon: Activity,
        },
        {
          label: "Root mean square error",
          value: fmt(metrics.rmse),
          unit: "MW",
          detail: "Sensitive to larger errors",
          icon: Gauge,
        },
        {
          label: "Forecast bias",
          value:
            metrics.bias == null
              ? "—"
              : `${metrics.bias > 0 ? "+" : ""}${fmt(metrics.bias)}`,
          unit: "MW",
          detail: "Positive = overforecast",
          icon: ArrowUpRight,
        },
        {
          label: "Data coverage",
          value: fmt(metrics.coverage * 100),
          unit: "%",
          detail: `${metrics.matched} of ${metrics.expected} hours matched`,
          icon: ShieldCheck,
        },
      ];
  return (
    <div className="metric-strip">
      {items.map(({ label, value, unit, detail, icon: Icon }) => (
        <div className="metric" key={label}>
          <div className="metric-label">
            {label}
            <Icon size={16} />
          </div>
          <div className="metric-number">
            {value}
            <span>{unit}</span>
          </div>
          <div className="metric-detail">
            {label === "Data coverage" && metrics.coverage === 1 && (
              <Check size={12} />
            )}
            {detail}
          </div>
        </div>
      ))}
    </div>
  );
}

function Methodology() {
  return (
    <div className="methodology">
      <div className="section-heading">
        <div>
          <span className="eyebrow">TRANSPARENT BY DESIGN</span>
          <h2>How the comparison works</h2>
        </div>
        <BookOpen size={23} />
      </div>
      <div className="method-grid">
        <article>
          <span className="step-number">01</span>
          <h3>Reconstruct the decision</h3>
          <p>
            Choose a January 2026 purchase date and a UK decision cutoff. The
            delivery window is the following calendar day. The default 10:00
            cutoff is an assumption, not an exchange gate closure.
          </p>
        </article>
        <article>
          <span className="step-number">02</span>
          <h3>Select the available forecast</h3>
          <p>
            For each delivery hour, use the latest WINDFOR publication at or
            before the cutoff. Later revisions are excluded. Missing eligible
            forecasts stay missing.
          </p>
        </article>
        <article>
          <span className="step-number">03</span>
          <h3>Align the actual generation</h3>
          <p>
            WINDFOR is hourly. FUELHH contains average MW for each half-hour.
            Compare with the mean of both half-hours; if either is missing, that
            hourly actual is unavailable. This is an explicit comparison
            convention, not a claim that the source measurements are identical.
          </p>
        </article>
        <article>
          <span className="step-number">04</span>
          <h3>Measure the difference</h3>
          <p>
            Error = forecast − actual. Positive bias means overforecast wind.
            MAE measures typical absolute error; RMSE gives more weight to large
            errors. All errors are in MW, not MWh.
          </p>
        </article>
      </div>
      <div className="method-note">
        <Info size={18} />
        <div>
          <strong>Historical evaluation, with clear limits.</strong>
          <p>
            January-wide results are retrospective. Actuals reflect the
            retrieved series and may include corrections. These national
            metered-wind datasets do not include customer demand, prices, or
            contracted positions and cannot determine a utility’s purchase
            volume. No probabilistic confidence interval or purchase buffer is
            inferred.
          </p>
        </div>
      </div>
      <div className="source-links">
        <a
          href="https://bmrs.elexon.co.uk/wind-generation"
          target="_blank"
          rel="noreferrer"
        >
          Elexon wind methodology <ExternalLink size={13} />
        </a>
        <a
          href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream"
          target="_blank"
          rel="noreferrer"
        >
          WINDFOR documentation <ExternalLink size={13} />
        </a>
        <a
          href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream"
          target="_blank"
          rel="noreferrer"
        >
          FUELHH documentation <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}

function DayWorkspace({ day }: { day: Day }) {
  const [forecastVisible, setForecastVisible] = useState(true);
  const [actualVisible, setActualVisible] = useState(true);
  const [showTable, setShowTable] = useState(false);
  const [showActualInTable, setShowActualInTable] = useState(true);
  const lastPublication = day.publications.at(-1);
  return (
    <div className="workspace-enter" key={day.decisionDate + day.cutoff}>
      <MetricStrip metrics={day.metrics} day={day} />
      {day.metrics.coverage < 1 && (
        <div className="warning">
          <Info size={17} />
          Incomplete comparison: {day.metrics.missingForecast} missing forecasts
          and {day.metrics.missingActual} missing hourly actuals. Metrics use
          matched pairs only.
        </div>
      )}
      <section className="chart-section">
        <div className="section-heading">
          <div>
            <h2>Wind generation forecast</h2>
            <p>
              Delivery{" "}
              {dateLabel(day.deliveryDate, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}{" "}
              · hourly comparison
            </p>
          </div>
          <div className="chart-legend">
            <label>
              <input
                type="checkbox"
                checked={forecastVisible}
                onChange={(e) => setForecastVisible(e.target.checked)}
              />
              <span className="legend-line forecast" />
              Forecast
            </label>
            <label>
              <input
                type="checkbox"
                checked={actualVisible}
                onChange={(e) => setActualVisible(e.target.checked)}
              />
              <span className="legend-line actual" />
              Actual
            </label>
          </div>
        </div>
        <div className="chart-unit">GENERATION · GW</div>
        <div
          className="main-chart"
          role="img"
          aria-label="Hourly wind forecast and actual generation chart. Values are available in the interval table below."
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={day.rows}
              margin={{ top: 12, right: 14, left: -16, bottom: 0 }}
              accessibilityLayer
            >
              <defs>
                <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#198877" stopOpacity={0.17} />
                  <stop offset="100%" stopColor="#198877" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="#e8eeeb"
                vertical={false}
                strokeDasharray="3 5"
              />
              <XAxis
                dataKey="hour"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#82908b", fontSize: 11 }}
                interval={3}
                tickMargin={16}
              />
              <YAxis
                tickFormatter={(v) => fmt(v / 1000, 0)}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#82908b", fontSize: 11 }}
                domain={[0, "auto"]}
                tickCount={5}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: "#acbcb5", strokeDasharray: "4 4" }}
              />
              {forecastVisible && (
                <Area
                  dataKey="forecast"
                  name="Forecast area"
                  type="linear"
                  stroke="none"
                  fill="url(#forecastFill)"
                  tooltipType="none"
                  isAnimationActive={false}
                />
              )}
              {actualVisible && (
                <Line
                  dataKey="actual"
                  name="Actual"
                  type="linear"
                  stroke="#8c9d97"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
              {forecastVisible && (
                <Line
                  dataKey="forecast"
                  name="Forecast"
                  type="linear"
                  stroke="#168572"
                  strokeWidth={2.6}
                  dot={false}
                  activeDot={{ r: 5, stroke: "white", strokeWidth: 3 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-footer">
          <span>
            <span className="tiny-dot" />
            Available by {day.cutoff} UK on{" "}
            {dateLabel(day.decisionDate, { day: "numeric", month: "short" })}
          </span>
          <span>
            {lastPublication
              ? `Latest selected publication ${timeLabel(lastPublication)} UK`
              : "No eligible publication"}{" "}
            · MW source values
          </span>
        </div>
      </section>
      <div className="lower-grid">
        <section className="error-section">
          <div className="section-heading">
            <div>
              <h2>Forecast error</h2>
              <p>Forecast − actual · MW</p>
            </div>
            <span className="muted-tag">Hourly</span>
          </div>
          <div
            className="error-chart"
            role="img"
            aria-label="Hourly forecast error. Positive values are overforecasts."
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={day.rows}
                margin={{ top: 10, right: 8, left: -7, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="#edf0ed"
                  vertical={false}
                  strokeDasharray="3 5"
                />
                <XAxis
                  dataKey="hour"
                  interval={5}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#82908b", fontSize: 10 }}
                />
                <YAxis
                  width={54}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#82908b", fontSize: 10 }}
                  tickFormatter={(v) => fmt(v)}
                />
                <ReferenceLine y={0} stroke="#c9d5ce" />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="error"
                  name="Error"
                  maxBarSize={12}
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                >
                  {day.rows.map((row) => (
                    <Cell
                      key={row.startTime}
                      fill={(row.error ?? 0) >= 0 ? "#c49a5e" : "#3a9786"}
                    />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="small-legend">
            <span>
              <i className="square sand" />
              Overforecast
            </span>
            <span>
              <i className="square teal" />
              Underforecast
            </span>
            <span>
              RMSE <b>{fmt(day.metrics.rmse)} MW</b>
            </span>
          </div>
        </section>
        <aside className="decision-context">
          <div className="context-icon">
            <Layers3 size={21} />
          </div>
          <span className="eyebrow">DECISION CONTEXT</span>
          <h3>
            A forecast you could
            <br />
            have acted on.
          </h3>
          <p>
            Only publications available by your selected cutoff are included.
            Later forecast revisions stay out of the comparison.
          </p>
          <dl>
            <div>
              <dt>Decision date</dt>
              <dd>{dateLabel(day.decisionDate)}</dd>
            </div>
            <div>
              <dt>Delivery date</dt>
              <dd>{dateLabel(day.deliveryDate)}</dd>
            </div>
            <div>
              <dt>Decision cutoff</dt>
              <dd>
                {day.cutoff} UK <span className="assumption">Assumed</span>
              </dd>
            </div>
          </dl>
        </aside>
      </div>
      <section className="interval-section">
        <button
          className="table-toggle"
          aria-expanded={showTable}
          onClick={() => setShowTable(!showTable)}
        >
          <span>
            <Database size={16} />
            Delivery interval data{" "}
            <span className="count">{day.rows.length} hours</span>
          </span>
          <ChevronDown size={17} className={showTable ? "rotated" : ""} />
        </button>
        {showTable && (
          <div className="table-wrap">
            <label className="table-option">
              <input
                type="checkbox"
                checked={showActualInTable}
                onChange={(e) => setShowActualInTable(e.target.checked)}
              />
              Show actual and error columns
            </label>
            <table>
              <thead>
                <tr>
                  <th>Delivery hour (UK)</th>
                  <th>Forecast (MW)</th>
                  {showActualInTable && (
                    <>
                      <th>Actual (MW)</th>
                      <th>Error (MW)</th>
                    </>
                  )}
                  <th>Forecast published (UK)</th>
                  <th>Lead time</th>
                </tr>
              </thead>
              <tbody>
                {day.rows.map((r) => (
                  <tr key={r.startTime}>
                    <td>{r.hour}</td>
                    <td>{fmt(r.forecast)}</td>
                    {showActualInTable && (
                      <>
                        <td>{fmt(r.actual)}</td>
                        <td>{fmt(r.error)}</td>
                      </>
                    )}
                    <td>
                      {r.publishTime
                        ? `${dateLabel(r.publishTime.slice(0, 10), { day: "numeric", month: "short" })} · ${timeLabel(r.publishTime)}`
                        : "Unavailable"}
                    </td>
                    <td>
                      {r.leadHours == null ? "—" : `${fmt(r.leadHours, 1)} h`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AccuracyWorkspace({
  cutoff,
  revision,
  onSelect,
}: {
  cutoff: string;
  revision: number;
  onSelect: (date: string) => void;
}) {
  const [from, setFrom] = useState(FIRST),
    [to, setTo] = useState(LAST);
  const result = useApi<Accuracy>(
    `/api/accuracy?from=${from}&to=${to}&cutoff=${encodeURIComponent(cutoff)}`,
    revision,
  );
  return (
    <>
      <div className="cohort-controls">
        <span>
          <CalendarDays size={16} />
          Decision cohort
        </span>
        <label>
          From
          <input
            aria-label="Accuracy start date"
            type="date"
            min={FIRST}
            max={LAST}
            value={from}
            onInput={(e) =>
              e.currentTarget.value && setFrom(e.currentTarget.value)
            }
            onChange={(e) => e.target.value && setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            aria-label="Accuracy end date"
            type="date"
            min={FIRST}
            max={LAST}
            value={to}
            onInput={(e) =>
              e.currentTarget.value && setTo(e.currentTarget.value)
            }
            onChange={(e) => e.target.value && setTo(e.target.value)}
          />
        </label>
      </div>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <Failure message={result.error} />
      ) : (
        result.data && (
          <div className="workspace-enter">
            <MetricStrip metrics={result.data.metrics} />
            <section className="chart-section">
              <div className="section-heading">
                <div>
                  <h2>Daily forecast accuracy</h2>
                  <p>
                    Mean absolute error by purchase decision date · {cutoff} UK
                    cutoff
                  </p>
                </div>
                <span className="muted-tag">Retrospective</span>
              </div>
              <div className="chart-unit">MEAN ABSOLUTE ERROR · MW</div>
              <div className="main-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={result.data.days.map((d) => ({
                      ...d,
                      label: dateLabel(d.decisionDate, {
                        day: "numeric",
                        month: "short",
                      }),
                    }))}
                    margin={{ top: 10, right: 8, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="#e8eeeb"
                      strokeDasharray="3 5"
                    />
                    <XAxis
                      dataKey="label"
                      interval={Math.max(
                        0,
                        Math.floor(result.data.days.length / 8),
                      )}
                      tick={{ fontSize: 11, fill: "#82908b" }}
                      tickLine={false}
                      axisLine={false}
                      tickMargin={12}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#82908b" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value) => [`${fmt(Number(value))} MW`, "MAE"]}
                      contentStyle={{
                        border: "1px solid #dde5df",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="mae"
                      name="MAE"
                      fill="#238875"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={24}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="interval-section">
              <div className="section-heading">
                <div>
                  <h2>Daily breakdown</h2>
                  <p>Select a date to inspect its delivery intervals.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Decision date</th>
                      <th>Delivery date</th>
                      <th>MAE (MW)</th>
                      <th>RMSE (MW)</th>
                      <th>Bias (MW)</th>
                      <th>Matched</th>
                      <th>Inspect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.days.map((d) => (
                      <tr key={d.decisionDate}>
                        <td>{dateLabel(d.decisionDate)}</td>
                        <td>
                          {dateLabel(d.deliveryDate, {
                            day: "numeric",
                            month: "short",
                          })}
                        </td>
                        <td>{fmt(d.mae)}</td>
                        <td>{fmt(d.rmse)}</td>
                        <td>{fmt(d.bias)}</td>
                        <td>
                          {d.matched}/{d.expected}
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => onSelect(d.decisionDate)}
                            aria-label={`Inspect ${d.decisionDate}`}
                          >
                            View day <ArrowRight size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="inline-note">
              <Info size={16} />
              Metrics are calculated over all matched hours, not averaged from
              daily metrics. The complete January cohort is a retrospective
              evaluation.
            </div>
          </div>
        )
      )}
    </>
  );
}

function DataWorkspace({ metadata }: { metadata: Metadata }) {
  const m = metadata.manifest;
  return (
    <div className="data-workspace workspace-enter">
      <div className="data-banner">
        <ShieldCheck size={28} />
        <div>
          <h2>Validated Elexon snapshot</h2>
          <p>
            Real historical API responses. No synthetic or interpolated
            generation.
          </p>
        </div>
        <span className="status-pill">Read only</span>
      </div>
      <div className="data-stats">
        <div>
          <span>Forecast revisions</span>
          <b>{fmt(m.forecastRows)}</b>
          <small>WINDFOR rows</small>
        </div>
        <div>
          <span>Actual observations</span>
          <b>{fmt(m.actualRows)}</b>
          <small>FUELHH · WIND only</small>
        </div>
        <div>
          <span>Extraction completed</span>
          <b className="date-stat">
            {new Date(m.extractedTo).toLocaleDateString("en-GB", {
              timeZone: "Europe/London",
            })}
          </b>
          <small>{timeLabel(m.extractedTo)} UK</small>
        </div>
      </div>
      <div className="quality-grid">
        <section>
          <h3>Data contract</h3>
          <dl className="detail-list">
            <div>
              <dt>Forecast resolution</dt>
              <dd>60 minutes</dd>
            </div>
            <div>
              <dt>Actual resolution</dt>
              <dd>30 minutes</dd>
            </div>
            <div>
              <dt>Comparison resolution</dt>
              <dd>60 minutes · two actuals required</dd>
            </div>
            <div>
              <dt>Generation units</dt>
              <dd>Average actual MW / forecast MW</dd>
            </div>
            <div>
              <dt>Purchase decisions</dt>
              <dd>1–31 January 2026</dd>
            </div>
            <div>
              <dt>Delivery dates</dt>
              <dd>2 January – 1 February 2026</dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>Europe/London · GMT in January</dd>
            </div>
          </dl>
        </section>
        <section>
          <h3>Provenance & integrity</h3>
          <p>
            The backend verifies the snapshot’s SHA-256 checksum before serving
            data. Missing observations remain missing; publication history is
            preserved.
          </p>
          <label className="checksum-label">SNAPSHOT SHA-256</label>
          <code className="checksum">{m.sha256}</code>
          <p>
            API fetching happens during explicit ingestion, outside dashboard
            requests. “Refresh view” reloads this snapshot; it does not fetch
            new upstream data.
          </p>
          <a
            href="/api/metadata"
            target="_blank"
            rel="noreferrer"
            className="text-button"
          >
            Open extraction manifest <ExternalLink size={13} />
          </a>
        </section>
      </div>
      <details className="requests">
        <summary>
          {m.requests.length} source requests <ChevronDown size={15} />
        </summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Request URL</th>
                <th>Rows</th>
              </tr>
            </thead>
            <tbody>
              {m.requests.map((r) => (
                <tr key={r.url}>
                  <td>
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.url}
                    </a>
                  </td>
                  <td>{r.rows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Loading() {
  return (
    <div className="loading-state" role="status">
      <RefreshCw size={22} className="spin" />
      <strong>Loading wind data</strong>
      <span>Reconstructing the selected decision…</span>
    </div>
  );
}
function Failure({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="failure-state" role="alert">
      <Info size={24} />
      <h2>Data is unavailable</h2>
      <p>{message}</p>
      {retry && (
        <button className="button" onClick={retry}>
          <RefreshCw size={15} />
          Try again
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("decision");
  const [selectedDate, setSelectedDate] = useState("2026-01-14");
  const [cutoff, setCutoff] = useState("10:00");
  const [revision, setRevision] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 650px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 650px)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const metadata = useApi<Metadata>("/api/metadata", revision);
  const day = useApi<Day>(
    `/api/decision-day?date=${selectedDate}&cutoff=${encodeURIComponent(cutoff)}`,
    revision,
  );
  const titles: Record<View, [string, string]> = {
    decision: [
      "Day-ahead overview",
      "Wind forecasts available at the moment of your decision.",
    ],
    accuracy: [
      "Forecast accuracy",
      "Understand the error behind your day-ahead wind forecasts.",
    ],
    data: ["Data & provenance", "Trace every observation back to its source."],
    methodology: [
      "Methodology",
      "Explicit assumptions. Reproducible comparisons.",
    ],
  };
  const nav = [
    { id: "decision" as View, label: "Day-ahead overview", icon: Layers3 },
    { id: "accuracy" as View, label: "Forecast accuracy", icon: Activity },
    { id: "data" as View, label: "Data & provenance", icon: Database },
  ];
  function navigate(next: View) {
    setView(next);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }
  return (
    <div
      className="app-shell"
      onKeyDown={(e) => {
        if (e.key === "Escape") setMenuOpen(false);
      }}
    >
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      {menuOpen && (
        <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />
      )}
      <aside
        className={`sidebar ${menuOpen ? "open" : ""}`}
        inert={mobile && !menuOpen}
        aria-hidden={mobile && !menuOpen}
      >
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("decision");
          }}
          aria-label="Ventus home"
        >
          <div className="brand-mark">
            <Wind size={25} strokeWidth={1.8} />
          </div>
          <div>
            ventus<span>WIND INTELLIGENCE</span>
          </div>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`nav-item ${view === id ? "active" : ""}`}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={18} />
              {label}
              {view === id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="pilot-note">
            <span className="pilot-dot" />
            <span>JANUARY 2026 PILOT</span>
            <p>
              Great Britain
              <br />
              National wind generation
            </p>
          </div>
          <button
            onClick={() => navigate("methodology")}
            className={`nav-item ${view === "methodology" ? "active" : ""}`}
          >
            <BookOpen size={17} />
            Methodology
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-source">
            <div className="source-symbol">e</div>
            <div>
              Powered by Elexon<span>Insights Solution · BMRS</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {view === "decision" ? "Day-ahead overview" : titles[view][0]}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="country">
              <span className="flag">GB</span>Great Britain
            </span>
            <span className="topbar-divider" />
            <span className="historical">
              <span />
              Historical replay
            </span>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">NATIONAL WIND · JANUARY 2026</div>
              <h1>{titles[view][0]}</h1>
              <p>{titles[view][1]}</p>
            </div>
            <button
              className="button export-button"
              disabled={!day.data || view !== "decision"}
              onClick={() => day.data && download(day.data)}
            >
              <Download size={15} />
              Export data
            </button>
          </div>
          <div className="filter-bar">
            <div className="date-filter">
              <CalendarDays size={17} />
              <label htmlFor="decision-date">Decision date</label>
              <div className="date-input-wrap">
                <input
                  id="decision-date"
                  aria-label="Decision date"
                  type="date"
                  min={FIRST}
                  max={LAST}
                  value={selectedDate}
                  onInput={(e) => {
                    const value = e.currentTarget.value;
                    if (value >= FIRST && value <= LAST) setSelectedDate(value);
                  }}
                  onChange={(e) => {
                    if (e.target.value >= FIRST && e.target.value <= LAST)
                      setSelectedDate(e.target.value);
                  }}
                />
              </div>
              <div className="date-steppers">
                <button
                  className="icon-button"
                  aria-label="Previous decision day"
                  disabled={selectedDate <= FIRST}
                  onClick={() => setSelectedDate(shiftDay(selectedDate, -1))}
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Next decision day"
                  disabled={selectedDate >= LAST}
                  onClick={() => setSelectedDate(shiftDay(selectedDate, 1))}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
            <span className="filter-divider" />
            <div className="cutoff-filter">
              <label htmlFor="cutoff">Decision cutoff</label>
              <input
                id="cutoff"
                aria-label="Decision cutoff"
                type="time"
                value={cutoff}
                onInput={(e) => {
                  const value = e.currentTarget.value;
                  if (/^\d{2}:\d{2}$/.test(value)) setCutoff(value);
                }}
                onChange={(e) => {
                  if (/^\d{2}:\d{2}$/.test(e.target.value))
                    setCutoff(e.target.value);
                }}
              />
              <span className="timezone">UK</span>
              <span
                className="assumption"
                title="No procurement cutoff was specified; this time is an editable assumption."
              >
                Assumed <Info size={11} />
              </span>
            </div>
            <button
              className="refresh-button"
              onClick={() => setRevision((n) => n + 1)}
              aria-label="Refresh view"
            >
              <RefreshCw size={14} />
              Refresh view
            </button>
          </div>
          <div className="scope-note">
            <span>
              <span className="tiny-dot" />
              {view === "accuracy"
                ? "January decision cohort"
                : `Delivery ${dateLabel(shiftDay(selectedDate, 1), { weekday: "short", day: "numeric", month: "short", year: "numeric" })}`}
            </span>
            <span>Europe/London · hourly comparison</span>
          </div>
          {metadata.loading ? (
            <Loading />
          ) : metadata.error ? (
            <Failure
              message={metadata.error}
              retry={() => setRevision((n) => n + 1)}
            />
          ) : view === "decision" ? (
            day.loading ? (
              <Loading />
            ) : day.error ? (
              <Failure
                message={day.error}
                retry={() => setRevision((n) => n + 1)}
              />
            ) : (
              day.data && <DayWorkspace day={day.data} />
            )
          ) : view === "accuracy" ? (
            <AccuracyWorkspace
              cutoff={cutoff}
              revision={revision}
              onSelect={(date) => {
                setSelectedDate(date);
                setView("decision");
                window.scrollTo(0, 0);
              }}
            />
          ) : view === "data" && metadata.data ? (
            <DataWorkspace metadata={metadata.data} />
          ) : (
            <Methodology />
          )}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={13} />
              <a
                href="https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/"
                target="_blank"
                rel="noreferrer"
              >
                Contains BMRS data © Elexon Limited copyright and database
                right 2026.
              </a>
            </span>
            <button onClick={() => navigate("methodology")}>
              <CircleHelp size={13} />
              Methodology & assumptions
              <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>
    </div>
  );
}
