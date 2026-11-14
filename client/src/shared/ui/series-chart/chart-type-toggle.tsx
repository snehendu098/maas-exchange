"use client";

import { ChartArea, ChartLine } from "lucide-react";
import { IconToggle, type IconToggleOption } from "../icon-toggle";
import type { ChartType } from "./series-plot";

const OPTIONS: ReadonlyArray<IconToggleOption<ChartType>> = [
  { value: "line", label: "Line", Icon: ChartLine },
  { value: "area", label: "Area", Icon: ChartArea },
];

/** line | area icon pills */
export function ChartTypeToggle({ value, onChange }: { value: ChartType; onChange: (value: ChartType) => void }) {
  return <IconToggle aria-label="Chart type" options={OPTIONS} value={value} onChange={onChange} />;
}
