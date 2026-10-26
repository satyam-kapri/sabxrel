import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import App from "./App";

vi.mock("recharts", async () => {
  const Wrapper = ({ children }: PropsWithChildren) => <div>{children}</div>;
  const Empty = () => null;
  return {
    ResponsiveContainer: Wrapper,
    ComposedChart: ({ children }: PropsWithChildren) => <svg>{children}</svg>,
    Area: Empty,
    Bar: Empty,
    CartesianGrid: Empty,
    Cell: Empty,
    Line: Empty,
    ReferenceLine: Empty,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: Empty,
  };
});
const metrics = {
  mae: 50,
  rmse: 60,
  bias: -10,
  matched: 24,
  expected: 24,
  coverage: 1,
  missingForecast: 0,
  missingActual: 0,
};
const day = {
  decisionDate: "2026-01-14",
  deliveryDate: "2026-01-15",
  cutoff: "10:00",
  cutoffAt: "2026-01-14T10:00:00Z",
  metrics,
  rows: [],
  publications: ["2026-01-14T09:30:00Z"],
  averageForecast: 10000,
  peakForecast: 12000,
};
let fail = false;
const fetchMock = vi.fn(async (path: string) => ({
  ok: !fail,
  json: async () =>
    fail
      ? { detail: "Validated dataset unavailable." }
      : path === "/api/metadata"
        ? { ready: true, manifest: {} }
        : path.startsWith("/api/accuracy")
          ? {
              metrics,
              days: [
                {
                  decisionDate: "2026-01-01",
                  deliveryDate: "2026-01-02",
                  ...metrics,
                },
              ],
            }
          : day,
}));
beforeEach(() => {
  fail = false;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

describe("dashboard workflows", () => {
  it("loads real API contracts and requests a new cutoff and date", async () => {
    render(<App />);
    expect(
      await screen.findByText("24 of 24 hourly pairs matched"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Decision cutoff"), {
      target: { value: "08:30" },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/decision-day?date=2026-01-14&cutoff=08%3A30",
        expect.anything(),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next decision day" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/decision-day?date=2026-01-15&cutoff=08%3A30",
        expect.anything(),
      ),
    );
  });
  it("shows an unavailable state and retries without invented data", async () => {
    fail = true;
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Validated dataset unavailable.",
    );
    expect(
      screen.queryByText("24 of 24 hourly pairs matched"),
    ).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("24 of 24 hourly pairs matched"),
    ).toBeInTheDocument();
  });
  it("opens the accuracy cohort and drills into the selected day", async () => {
    render(<App />);
    await screen.findByText("24 of 24 hourly pairs matched");
    fireEvent.click(screen.getByRole("button", { name: "Forecast accuracy" }));
    const inspect = await screen.findByRole("button", {
      name: "Inspect 2026-01-01",
    });
    fireEvent.click(inspect);
    expect(screen.getByLabelText("Decision date")).toHaveValue("2026-01-01");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/decision-day?date=2026-01-01&cutoff=10%3A00",
        expect.anything(),
      ),
    );
    expect(
      screen.getByRole("button", { name: "Previous decision day" }),
    ).toBeDisabled();
  });
});
