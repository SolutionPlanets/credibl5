"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CHART_DARK = "#0f172a";

const TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  boxShadow: "0 16px 35px -24px rgba(15,23,42,0.4)",
};

function CustomPieLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}) {
  if (percent < 0.05) return null;
  const radian = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * radian);
  const y = cy + radius * Math.sin(-midAngle * radian);
  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={700}
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}

export interface SentimentPoint {
  name: string;
  value: number;
  fill: string;
}

interface Props {
  data: SentimentPoint[];
  total: number;
}

export function SentimentBreakdownChart({ data, total }: Props) {
  return (
    <Card className="rounded-[1.75rem] border-slate-200/80 bg-white/90 shadow-sm ring-1 ring-slate-900/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-900">Sentiment Breakdown</CardTitle>
        <CardDescription>Positive, neutral, and negative split</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-slate-500">
            No sentiment data available
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <ResponsiveContainer width="100%" height={240} className="sm:max-w-[60%]">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={88}
                  paddingAngle={3}
                  dataKey="value"
                  labelLine={false}
                  label={CustomPieLabel}
                >
                  {data.map((entry, index) => (
                    <Cell key={`sentiment-${entry.name}-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: CHART_DARK, fontSize: 12 }}
                  itemStyle={{ fontSize: 12, color: CHART_DARK }}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className="flex-1 space-y-2">
              {data.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: item.fill }}
                    />
                    <span className="text-sm font-medium capitalize text-slate-700">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{item.value}</span>
                    <Badge
                      className="h-5 border px-1.5 text-[10px]"
                      style={{
                        backgroundColor: `${item.fill}1A`,
                        color: item.fill,
                        borderColor: `${item.fill}40`,
                      }}
                    >
                      {total > 0 ? `${Math.round((item.value / total) * 100)}%` : "0%"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
