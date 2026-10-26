export type Metrics = {
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  matched: number;
  expected: number;
  coverage: number;
  missingForecast: number;
  missingActual: number;
};
export type Interval = {
  startTime: string;
  hour: string;
  forecast: number | null;
  actual: number | null;
  error: number | null;
  publishTime: string | null;
  leadHours: number | null;
  actualHalfHours: number;
};
export type Day = {
  decisionDate: string;
  deliveryDate: string;
  cutoff: string;
  cutoffAt: string;
  rows: Interval[];
  metrics: Metrics;
  averageForecast: number | null;
  peakForecast: number | null;
  publications: string[];
};
export type AccuracyDay = Metrics & {
  decisionDate: string;
  deliveryDate: string;
  averageForecast: number | null;
};
export type Accuracy = {
  from: string;
  to: string;
  cutoff: string;
  metrics: Metrics;
  days: AccuracyDay[];
};
export type Metadata = {
  ready: boolean;
  units: string;
  timezone: string;
  defaultCutoff: string;
  manifest: {
    builtAt: string;
    extractedFrom: string;
    extractedTo: string;
    sha256: string;
    forecastRows: number;
    actualRows: number;
    synthetic: boolean;
    requests: { url: string; rows: number; extractedAt: string }[];
  };
};
