import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  forecastDate: "2026-01-14",
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
                  forecastDate: "2026-01-01",
                  ...metrics,
                },
              ],
            }
          : (() => {
              const query = new URL(path, "http://localhost").searchParams;
              const decisionDate = query.get("date")!;
              const delivery = new Date(`${decisionDate}T12:00:00Z`);
              delivery.setUTCDate(delivery.getUTCDate() + 1);
              return {
                ...day,
                decisionDate,
                forecastDate: query.get("forecastDate") || decisionDate,
                cutoffAt: `${query.get("forecastDate") || decisionDate}T${query.get("cutoff")}:00Z`,
                deliveryDate: delivery.toISOString().slice(0, 10),
                cutoff: query.get("cutoff")!,
              };
            })(),
}));
beforeEach(() => {
  localStorage.clear();
  fail = false;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

describe("dashboard workflows", () => {
  it("persists dark mode across remounts and allows returning to light mode", () => {
    const first = render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("windin-theme")).toBe("dark");
    first.unmount();
    render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to light mode" }),
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("windin-theme")).toBe("light");
  });
  it("shows delivery date and the full previous-day forecast timestamp", async () => {
    render(<App />);
    expect(
      await screen.findByText("24 of 24 hourly pairs matched"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Delivery date")).toHaveValue("2026-01-15");
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByText("Historical replay")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Wind generation · 15 January 2026",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Forecast error · 15 January 2026" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Forecast taken till 14 January 2026, 10:00 UK time."),
    ).toBeInTheDocument();
    fireEvent.input(screen.getByLabelText("Forecast taken till time"), {
      target: { value: "08:30" },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/decision-day?date=2026-01-14&cutoff=08%3A30&forecastDate=2026-01-14",
        expect.anything(),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next delivery day" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/decision-day?date=2026-01-15&cutoff=08%3A30&forecastDate=2026-01-15",
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
    localStorage.clear();
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
      name: "Inspect delivery 2026-01-02",
    });
    fireEvent.click(inspect);
    expect(screen.getByLabelText("Delivery date")).toHaveValue("2026-01-02");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/decision-day?date=2026-01-01&cutoff=10%3A00&forecastDate=2026-01-01",
        expect.anything(),
      ),
    );
    expect(
      screen.getByRole("button", { name: "Previous delivery day" }),
    ).toBeDisabled();
  });
  it("maps February 1 delivery to January 31 and prevents navigating past the range", async () => {
    render(<App />);
    await screen.findByText("24 of 24 hourly pairs matched");
    fireEvent.change(screen.getByLabelText("Delivery date"), {
      target: { value: "2026-02-01" },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/decision-day?date=2026-01-31&cutoff=10%3A00&forecastDate=2026-01-31",
        expect.anything(),
      ),
    );
    expect(
      screen.getByText("Forecast taken till 31 January 2026, 10:00 UK time."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next delivery day" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Previous delivery day" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/decision-day?date=2026-01-30&cutoff=10%3A00&forecastDate=2026-01-30",
        expect.anything(),
      ),
    );
  });
  it("translates the visible delivery cohort to January decision dates", async () => {
    render(<App />);
    await screen.findByText("24 of 24 hourly pairs matched");
    fireEvent.click(screen.getByRole("button", { name: "Forecast accuracy" }));
    await screen.findByRole("heading", { name: /^Forecast accuracy ·/ });
    expect(
      within(
        screen.getByRole("group", { name: "Chart selections" }),
      ).getByLabelText("First delivery date"),
    ).toHaveValue("2026-01-02");
    expect(screen.getByLabelText("Last delivery date")).toHaveValue(
      "2026-02-01",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/accuracy?from=2026-01-01&to=2026-01-31&cutoff=10%3A00&leadDays=1",
      expect.anything(),
    );
    fireEvent.input(screen.getByLabelText("First delivery date"), {
      target: { value: "2026-02-01" },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/accuracy?from=2026-01-31&to=2026-01-31&cutoff=10%3A00&leadDays=1",
        expect.anything(),
      ),
    );
  });
  it("selects an older publication date without changing the generation day", async () => {
    render(<App />);
    await screen.findByText("24 of 24 hourly pairs matched");
    fireEvent.input(screen.getByLabelText("Forecast taken till date"), {
      target: { value: "2026-01-13" },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/decision-day?date=2026-01-14&cutoff=10%3A00&forecastDate=2026-01-13",
        expect.anything(),
      ),
    );
    expect(screen.getByLabelText("Delivery date")).toHaveValue("2026-01-15");
    expect(
      await screen.findByRole("heading", {
        name: "Wind generation · 15 January 2026",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Forecast taken till date")).toHaveAttribute(
      "max",
      "2026-01-14",
    );
    fireEvent.click(screen.getByRole("button", { name: "Forecast accuracy" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/accuracy?from=2026-01-01&to=2026-01-31&cutoff=10%3A00&leadDays=2",
        expect.anything(),
      ),
    );
    fireEvent.change(screen.getByLabelText("Forecast taken till days before"), {
      target: { value: "3" },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/accuracy?from=2026-01-01&to=2026-01-31&cutoff=10%3A00&leadDays=3",
        expect.anything(),
      ),
    );
  });
});
