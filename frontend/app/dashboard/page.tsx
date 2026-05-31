'use client';

import { useEffect, useState, useMemo } from 'react';
import { format, subDays, eachDayOfInterval, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { FileText, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
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
    color: 'hsl(var(--chart-1))',
  },
  uebertragen: {
    label: 'Übertragen',
    color: 'hsl(var(--chart-2))',
  },
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
                    <stop offset="5%" stopColor="var(--color-hochgeladen)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-hochgeladen)" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="fillUebertragen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-uebertragen)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-uebertragen)" stopOpacity={0.05} />
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

      {/* Invoices Table */}
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
