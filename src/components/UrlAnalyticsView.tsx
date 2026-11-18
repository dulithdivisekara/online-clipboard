import { BarChart3, Globe, Laptop, MonitorSmartphone } from "lucide-react";

interface BucketItem {
  label: string;
  count: number;
}

interface UrlAnalyticsViewProps {
  code: string;
  targetUrl: string;
  title?: string;
  totalClicks: number;
  browsers: BucketItem[];
  operatingSystems: BucketItem[];
  devices: BucketItem[];
  countries: BucketItem[];
  days: BucketItem[];
}

const COLORS = ["#0a74e6", "#177a2b", "#8b5cf6", "#f97316", "#06b6d4", "#e11d48"];

function BreakdownCard({
  heading,
  icon,
  items,
  total,
}: {
  heading: string;
  icon: React.ReactNode;
  items: BucketItem[];
  total: number;
}) {
  return (
    <div className="glass-card sheet">
      <div className="step-head">
        <h3 style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {icon}
          <span>{heading}</span>
        </h3>
        <span className="badge-pill">{items.length} unique</span>
      </div>

      {items.length === 0 ? (
        <p style={{ margin: 0, color: "var(--label-tertiary)", fontSize: 14 }}>
          No click telemetry recorded yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.slice(0, 8).map((item, idx) => {
            const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
            const color = COLORS[idx % COLORS.length];
            return (
              <div key={item.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ fontWeight: 550 }}>{item.label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--label-secondary)" }}>
                    {item.count} ({pct}%)
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: "var(--separator)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(4, pct)}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function UrlAnalyticsView({
  code,
  targetUrl,
  title,
  totalClicks,
  browsers,
  operatingSystems,
  devices,
  countries,
  days,
}: UrlAnalyticsViewProps) {
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section className="glass-card sheet">
        <div className="step-head">
          <div>
            <h2 style={{ margin: 0 }}>{title || `/${code}`}</h2>
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cb-link"
              style={{ fontSize: 14, wordBreak: "break-all" }}
            >
              {targetUrl}
            </a>
          </div>

          <div className="well" style={{ padding: "10px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 740, lineHeight: 1.1 }}>{totalClicks}</div>
            <div style={{ fontSize: 12, color: "var(--label-secondary)" }}>Total Clicks</div>
          </div>
        </div>

        {days.length > 0 && (
          <div className="well">
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--label-secondary)", marginBottom: 10 }}>
              Daily Visits
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 110 }}>
              {days.slice(-14).map((d) => {
                const hPct = Math.max(8, Math.round((d.count / maxDay) * 100));
                return (
                  <div
                    key={d.label}
                    title={`${d.label}: ${d.count} click(s)`}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      height: "100%",
                      justifyContent: "flex-end",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        maxWidth: 28,
                        height: `${hPct}%`,
                        borderRadius: 6,
                        background: "var(--accent)",
                      }}
                    />
                    <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--label-tertiary)" }}>
                      {d.label.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <div className="field-grid">
        <BreakdownCard
          heading="Browsers"
          icon={<BarChart3 size={18} style={{ color: "var(--accent)" }} />}
          items={browsers}
          total={totalClicks}
        />
        <BreakdownCard
          heading="Operating Systems"
          icon={<Laptop size={18} style={{ color: "var(--accent)" }} />}
          items={operatingSystems}
          total={totalClicks}
        />
        <BreakdownCard
          heading="Device Types"
          icon={<MonitorSmartphone size={18} style={{ color: "var(--accent)" }} />}
          items={devices}
          total={totalClicks}
        />
        <BreakdownCard
          heading="Countries"
          icon={<Globe size={18} style={{ color: "var(--accent)" }} />}
          items={countries}
          total={totalClicks}
        />
      </div>
    </div>
  );
}
