'use client';

import { useEffect, useState, useMemo } from 'react';
import { format, subDays, eachDayOfInterval, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { FileText, CheckCircle2, XCircle, Clock } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
  BarChart,
  Pie,
  PieChart,
  Label,
} from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { ApiService } from '@/lib/api';
import type { Invoice } from '@/types/invoice';

const chartConfig: ChartConfig = {
  hochgeladen: {
    label: 'Hochgeladen',
    color: 'var(--chart-1)',
  },
  uebertragen: {
    label: 'Übertragen',
    color: 'var(--chart-2)',
  },
};

const statusChartConfig: ChartConfig = {
  count: { label: 'Rechnungen' },
  success: { label: 'Erfolgreich', color: 'var(--chart-2)' },
  pending: { label: 'Ausstehend', color: 'var(--chart-3)' },
  processing: { label: 'In Bearbeitung', color: 'var(--chart-4)' },
  failed: { label: 'Fehlgeschlagen', color: 'var(--chart-5)' },
};

const transferChartConfig: ChartConfig = {
  erfolgreich: { label: 'Erfolgreich', color: 'var(--chart-2)' },
  offen: { label: 'Offen / Fehler', color: 'var(--chart-1)' },
};

const statusLabels: Record<Invoice['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Ausstehend', variant: 'secondary' },
  processing: { label: 'In Bearbeitung', variant: 'secondary' },
  success: { label: 'Erfolgreich', variant: 'default' },
  failed: { label: 'Fehlgeschlagen', variant: 'destructive' },
};

function StatusBadge({ status }: { status: Invoice['status'] }) {
  const { label, variant } = statusLabels[status] ?? { label: status, variant: 'outline' as const };
  return <Badge variant={variant}>{label}</Badge>;
}

function StatCard({
  title,
  value,
  icon,
  description,
  loading,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  description?: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ApiService.getInvoices()
      .then(setInvoices)
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const total = invoices.length;
    const successful = invoices.filter(
      i => i.paperless_status === 'success' && i.lexware_status === 'success'
    ).length;
    const failed = invoices.filter(i => i.status === 'failed').length;
    const pending = invoices.filter(
      i => i.status === 'pending' || i.status === 'processing'
    ).length;
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;
    return { total, successful, failed, pending, successRate };
  }, [invoices]);

  const chartData = useMemo(() => {
    return eachDayOfInterval({
      start: subDays(new Date(), 29),
      end: new Date(),
    }).map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayInvoices = invoices.filter(
        i => format(parseISO(i.created_at), 'yyyy-MM-dd') === dayStr
      );
      return {
        date: format(day, 'dd. MMM', { locale: de }),
        hochgeladen: dayInvoices.length,
        uebertragen: dayInvoices.filter(
          i => i.paperless_status === 'success' && i.lexware_status === 'success'
        ).length,
      };
    });
  }, [invoices]);

  const sorted = useMemo(
    () => [...invoices].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
    [invoices]
  );

  const statusData = useMemo(() => {
    const counts: Record<Invoice['status'], number> = {
      success: 0,
      pending: 0,
      processing: 0,
      failed: 0,
    };
    for (const i of invoices) counts[i.status] = (counts[i.status] ?? 0) + 1;
    return (Object.keys(counts) as Invoice['status'][])
      .map((status) => ({
        status,
        count: counts[status],
        fill: `var(--color-${status})`,
      }))
      .filter((d) => d.count > 0);
  }, [invoices]);

  const transferData = useMemo(() => {
    const paperlessOk = invoices.filter((i) => i.paperless_status === 'success').length;
    const lexwareOk = invoices.filter((i) => i.lexware_status === 'success').length;
    const total = invoices.length;
    return [
      { ziel: 'Paperless', erfolgreich: paperlessOk, offen: total - paperlessOk },
      { ziel: 'Lexware', erfolgreich: lexwareOk, offen: total - lexwareOk },
    ];
  }, [invoices]);

  return (
    <main className="flex-1 p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Übersicht aller Rechnungen und Transfers</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Gesamt-Rechnungen"
          value={stats.total}
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          loading={loading}
        />
        <StatCard
          title="Erfolgreich übertragen"
          value={stats.successful}
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
          description={stats.total > 0 ? `${stats.successRate} % Erfolgsrate` : undefined}
          loading={loading}
        />
        <StatCard
          title="Fehlgeschlagen"
          value={stats.failed}
          icon={<XCircle className="h-4 w-4 text-destructive" />}
          loading={loading}
        />
        <StatCard
          title="Ausstehend"
          value={stats.pending}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          loading={loading}
        />
      </div>

      {/* Area Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Uploads pro Tag</CardTitle>
          <CardDescription>Letzte 30 Tage — Hochgeladen vs. erfolgreich übertragen</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : (
            <ChartContainer config={chartConfig} className="h-[220px] w-full">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillHochgeladen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-hochgeladen)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="var(--color-hochgeladen)" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="fillUebertragen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-uebertragen)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="var(--color-uebertragen)" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Area
                  dataKey="hochgeladen"
                  type="monotone"
                  fill="url(#fillHochgeladen)"
                  stroke="var(--color-hochgeladen)"
                  strokeWidth={2}
                />
                <Area
                  dataKey="uebertragen"
                  type="monotone"
                  fill="url(#fillUebertragen)"
                  stroke="var(--color-uebertragen)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Status distribution + transfer comparison */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader className="items-center pb-0">
            <CardTitle>Status-Verteilung</CardTitle>
            <CardDescription>Alle Rechnungen nach Status</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-0">
            {loading ? (
              <Skeleton className="mx-auto h-[240px] w-[240px] rounded-full" />
            ) : statusData.length === 0 ? (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                Noch keine Daten
              </div>
            ) : (
              <ChartContainer
                config={statusChartConfig}
                className="mx-auto aspect-square max-h-[240px]"
              >
                <PieChart>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={statusData}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={60}
                    strokeWidth={4}
                  >
                    <Label
                      content={({ viewBox }) => {
                        if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                          return (
                            <text
                              x={viewBox.cx}
                              y={viewBox.cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              <tspan
                                x={viewBox.cx}
                                y={viewBox.cy}
                                className="fill-foreground text-3xl font-bold"
                              >
                                {stats.total}
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy ?? 0) + 22}
                                className="fill-muted-foreground text-xs"
                              >
                                Rechnungen
                              </tspan>
                            </text>
                          );
                        }
                        return null;
                      }}
                    />
                  </Pie>
                  <ChartLegend
                    content={<ChartLegendContent nameKey="status" />}
                    className="-translate-y-2 flex-wrap gap-2 *:justify-center"
                  />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Transfer-Ziele</CardTitle>
            <CardDescription>Erfolgreiche Übertragungen je Ziel</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {loading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : (
              <ChartContainer config={transferChartConfig} className="h-[240px] w-full">
                <BarChart accessibilityLayer data={transferData} margin={{ top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="ziel"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="erfolgreich" stackId="a" fill="var(--color-erfolgreich)" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="offen" stackId="a" fill="var(--color-offen)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alle Rechnungen</CardTitle>
          <CardDescription>
            {loading ? 'Wird geladen…' : `${stats.total} Einträge gesamt`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dateiname</TableHead>
                  <TableHead className="whitespace-nowrap">Hochgeladen</TableHead>
                  <TableHead>Paperless</TableHead>
                  <TableHead>Lexware</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(invoice => (
                  <TableRow key={invoice.id}>
                    <TableCell
                      className="font-medium max-w-[240px] truncate"
                      title={invoice.filename}
                    >
                      {invoice.filename}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {format(parseISO(invoice.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={invoice.paperless_status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={invoice.lexware_status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={invoice.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {sorted.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-10"
                    >
                      Noch keine Rechnungen vorhanden
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
