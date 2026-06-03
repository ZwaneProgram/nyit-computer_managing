import { useEffect, useState } from 'react';
import { BarChart } from '../components/charts/BarChart';
import { Donut } from '../components/charts/Donut';
import { AreaChart } from '../components/charts/AreaChart';
import { fmtTHB } from '../data/format';
import { fetchStats, type Stats, type StatsRange } from '../data/stats';

type Tab = 'sales' | 'profit' | 'inventory' | 'bundle';

const DONUT_COLORS = ['var(--accent)', 'var(--pos)', 'var(--warn)', 'oklch(0.65 0.13 25)', 'var(--ink-3)', 'var(--ink-4)'];

const RANGES: { id: StatsRange; label: string }[] = [
  { id: '7d', label: '7 วัน' },
  { id: '30d', label: '30 วัน' },
  { id: '90d', label: '90 วัน' },
  { id: '1y', label: '1 ปี' },
  { id: 'all', label: 'ทั้งหมด' },
];

export function AnalyticsView() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('sales');
  const [range, setRange] = useState<StatsRange>('all');

  useEffect(() => {
    setLoading(true);
    fetchStats(range).then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, [range]);

  if (loading || !stats) return <div className="muted" style={{ padding: 40 }}>กำลังโหลด...</div>;

  const t = stats.totals;
  const rangeLabel = RANGES.find((r) => r.id === stats.range)?.label ?? 'ทั้งหมด';
  const headline = [
    { label: 'ยอดขายรวม', value: fmtTHB(t.sales), hint: 'ทั้งหมด' },
    { label: 'กำไรสุทธิ', value: fmtTHB(t.profit), hint: t.sales ? `อัตรากำไร ${Math.round((t.profit / t.sales) * 100)}%` : '—' },
    { label: 'ออเดอร์', value: String(t.orders), unit: 'รายการ', hint: 'มูลค่าเฉลี่ย ' + fmtTHB(t.avgOrder) },
    { label: 'สินค้าในคลัง', value: String(t.inStockUnits), unit: 'ชิ้น', hint: 'พร้อมขาย' },
  ];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'sales', label: 'ยอดขาย' },
    { id: 'profit', label: 'กำไร' },
    { id: 'inventory', label: 'การเคลื่อนไหวสต๊อก' },
    { id: 'bundle', label: 'ประสิทธิภาพชุดสินค้า' },
  ];

  const shareTotal = stats.categoryShare.reduce((s, c) => s + c.value, 0);
  const donut = stats.categoryShare.slice(0, 6).map((c, i) => ({
    label: c.label, value: c.value, color: DONUT_COLORS[i % DONUT_COLORS.length],
    pct: shareTotal ? Math.round((c.value / shareTotal) * 100) : 0,
  }));

  // last 5 months, newest first
  const m = stats.salesByMonth;
  const monthly = m.labels.map((label, i) => ({ label, sales: m.sales[i], profit: m.profit[i], orders: m.orders[i] }))
    .slice(-5).reverse();

  const maxVel = Math.max(1, ...stats.categoryUnits.map((c) => c.units));

  return (
    <div className="grid" style={{ gap: 'var(--gap)' }}>
      <div className="page-head">
        <div>
          <div className="page-title">วิเคราะห์และรายงาน</div>
          <div className="muted page-subtitle">ภาพรวมยอดขาย กำไร และการเคลื่อนไหวของสินค้า</div>
        </div>
        <div className="quick-filters">
          {RANGES.map((r) => (
            <button key={r.id} className={'quick-chip' + (range === r.id ? ' chip-accent' : '')} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-4">
        {headline.map((k, i) => (
          <div key={i} className="card kpi" style={{ minHeight: 100 }}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="kpi-delta"><span>{k.hint}</span></div>
          </div>
        ))}
      </div>

      <div className="tabs tabs-scroll">
        {tabs.map((x) => <button key={x.id} className="tab" data-active={tab === x.id} onClick={() => setTab(x.id)}>{x.label}</button>)}
      </div>

      {tab === 'sales' && (
        <div className="grid grid-12">
          <div className="card col-8">
            <div className="card-pad">
              <div className="section-h"><div><h3>ยอดขายรายเดือน</h3><div className="muted section-sub">ช่วง: {rangeLabel}</div></div></div>
              <BarChart labels={m.labels} height={260} legend series={[
                { name: 'ยอดขาย', color: 'var(--accent)', data: m.sales },
                { name: 'กำไร', color: 'var(--pos)', data: m.profit },
              ]} />
            </div>
          </div>
          <div className="card col-4">
            <div className="card-pad">
              <div className="section-h"><div><h3>สัดส่วนยอดขาย</h3><div className="muted section-sub">ตามหมวด</div></div></div>
              {donut.length ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><Donut size={180} data={donut} /></div>
                  {donut.map((d) => (
                    <div key={d.label} className="donut-label" style={{ justifyContent: 'space-between' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="sw" style={{ background: d.color }} /> {d.label}</span>
                      <span className="num muted">{d.pct}%</span>
                    </div>
                  ))}
                </>
              ) : <div className="muted" style={{ padding: 24, textAlign: 'center' }}>ยังไม่มีข้อมูล</div>}
            </div>
          </div>

          <div className="card col-7">
            <div className="card-pad">
              <div className="section-h"><div><h3>สินค้าขายดี 5 อันดับ</h3></div></div>
              <div className="table-wrap">
                <table className="tbl" style={{ marginTop: -4 }}>
                  <thead><tr><th>สินค้า</th><th style={{ textAlign: 'right' }}>จำนวน</th><th style={{ textAlign: 'right' }}>ยอดขาย</th><th style={{ textAlign: 'right' }}>กำไร</th></tr></thead>
                  <tbody>
                    {stats.topProducts.map((r) => (
                      <tr key={r.id}>
                        <td><div className="product-cell"><div className="thumb">{r.image_url ? <img src={r.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : <span style={{ fontSize: 7, color: 'var(--ink-4)' }}>ไม่มีรูป</span>}</div><div><div className="product-cell-name">{r.name}</div><div className="product-cell-meta">{r.sku || '—'}</div></div></div></td>
                        <td className="num" style={{ textAlign: 'right' }}>{r.qty}</td>
                        <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(r.revenue)}</td>
                        <td className="num" style={{ textAlign: 'right', color: 'var(--pos)' }}>+{fmtTHB(r.profit)}</td>
                      </tr>
                    ))}
                    {stats.topProducts.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24 }} className="muted">ยังไม่มีการขาย</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="card col-5">
            <div className="card-pad">
              <div className="section-h"><div><h3>สรุปรายเดือน</h3></div></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {monthly.map((r, i) => (
                  <div key={r.label + i} className="month-row" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                    <div><div style={{ fontWeight: 500, fontSize: 13.5 }}>{r.label}</div><div className="muted" style={{ fontSize: 12, marginTop: 1 }}>{r.orders} ออเดอร์</div></div>
                    <div className="num" style={{ textAlign: 'right' }}><div style={{ fontWeight: 600 }}>{fmtTHB(r.sales)}</div><div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>ยอดขาย</div></div>
                    <div className="num" style={{ textAlign: 'right', color: 'var(--pos)' }}><div style={{ fontWeight: 600 }}>+{fmtTHB(r.profit)}</div><div className="muted" style={{ fontSize: 11.5, marginTop: 1, color: 'var(--ink-3)' }}>กำไร</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'profit' && (
        <div className="card card-pad">
          <div className="section-h"><div><h3>เส้นกราฟกำไรสุทธิ vs ยอดขาย</h3><div className="muted section-sub">ช่วง: {rangeLabel}</div></div></div>
          <AreaChart labels={m.labels} height={300} series={[
            { name: 'ยอดขาย', color: 'var(--accent)', data: m.sales },
            { name: 'กำไร', color: 'var(--pos)', data: m.profit },
          ]} />
        </div>
      )}

      {tab === 'inventory' && (
        <div className="grid grid-12">
          <div className="card col-7">
            <div className="card-pad">
              <div className="section-h"><div><h3>การเคลื่อนไหวสต๊อก</h3><div className="muted section-sub">นำเข้า vs ขายออก (จำนวนเครื่อง) 12 เดือน</div></div></div>
              <BarChart labels={stats.stockMovement.labels} height={240} legend series={[
                { name: 'นำเข้า', color: 'var(--ink-3)', data: stats.stockMovement.inb },
                { name: 'ขายออก', color: 'var(--accent)', data: stats.stockMovement.outb },
              ]} />
            </div>
          </div>
          <div className="card col-5">
            <div className="card-pad">
              <div className="section-h"><div><h3>หมวดที่ขายดีที่สุด</h3><div className="muted section-sub">ตามจำนวนที่ขายได้</div></div></div>
              {stats.categoryUnits.length ? stats.categoryUnits.map((c, i) => (
                <div key={c.label} className="bar-row" style={{ gridTemplateColumns: '1fr 50px' }}>
                  <div className="bar-label" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div className="name">{c.label}</div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: (c.units / maxVel) * 100 + '%', background: DONUT_COLORS[i % DONUT_COLORS.length] }} /></div>
                  </div>
                  <div className="num muted" style={{ textAlign: 'right' }}>{c.units}</div>
                </div>
              )) : <div className="muted" style={{ padding: 24, textAlign: 'center' }}>ยังไม่มีข้อมูล</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'bundle' && (
        <div className="card card-pad">
          <div className="section-h"><div><h3>ประสิทธิภาพชุดสินค้า</h3></div></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>ชุด</th><th style={{ textAlign: 'right' }}>ขายไป</th><th style={{ textAlign: 'right' }}>ยอดรวม</th><th style={{ textAlign: 'right' }}>กำไรรวม</th><th style={{ textAlign: 'right' }}>อัตรากำไร</th></tr></thead>
              <tbody>
                {stats.bundlePerformance.map((b) => (
                  <tr key={b.id}>
                    <td><div style={{ fontWeight: 500 }}>{b.name}</div><div className="muted mono" style={{ fontSize: 11.5 }}>{b.item_count} ชิ้น</div></td>
                    <td className="num" style={{ textAlign: 'right' }}>{b.sold}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(b.revenue)}</td>
                    <td className="num" style={{ textAlign: 'right', color: 'var(--pos)' }}>+{fmtTHB(b.profit)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{b.margin}%</td>
                  </tr>
                ))}
                {stats.bundlePerformance.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }} className="muted">ยังไม่มีชุดสินค้า</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
