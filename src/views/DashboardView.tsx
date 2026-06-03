import { useEffect, useState } from 'react';
import { Icons } from '../components/Icons';
import { Sparkline } from '../components/charts/Sparkline';
import { AreaChart } from '../components/charts/AreaChart';
import { Donut } from '../components/charts/Donut';
import { fmtTHB, fmtN } from '../data/format';
import { fetchStats, type Stats } from '../data/stats';
import { fetchSales, type Sale } from '../data/sales';
import type { ViewId } from '../types';

interface ViewProps {
  onNav: (id: ViewId) => void;
}

const DONUT_COLORS = ['var(--accent)', 'var(--pos)', 'var(--warn)', 'oklch(0.65 0.13 25)', 'var(--ink-3)', 'var(--ink-4)'];

function Thumb({ url }: { url: string | null }) {
  return (
    <div className="thumb">
      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
        : <span style={{ fontSize: 7, color: 'var(--ink-4)' }}>ไม่มีรูป</span>}
    </div>
  );
}

export function DashboardView({ onNav }: ViewProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchStats(), fetchSales()])
      .then(([s, sales]) => { setStats(s); setRecent(sales.slice(0, 5)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (loading || !stats) {
    return <div className="muted" style={{ padding: 40 }}>กำลังโหลด...</div>;
  }

  const k = stats.kpis;
  const kpis = [
    { label: 'ยอดขายเดือนนี้', value: fmtTHB(k.monthSales), delta: k.deltaSales, period: 'เทียบกับเดือนก่อน', spark: stats.salesByMonth.sales, color: 'var(--accent)' },
    { label: 'กำไรเดือนนี้', value: fmtTHB(k.monthProfit), delta: k.deltaProfit, period: 'เทียบกับเดือนก่อน', spark: stats.salesByMonth.profit, color: 'var(--pos)' },
    { label: 'มูลค่าคลังสินค้า', value: fmtTHB(k.inventoryValue), delta: null, period: 'ราคาทุน × คงเหลือ', spark: [], color: 'var(--ink-2)' },
    { label: 'ออเดอร์เดือนนี้', value: fmtN(k.monthOrders), unit: 'รายการ', delta: k.deltaOrders, period: 'เทียบกับเดือนก่อน', spark: stats.salesByMonth.orders, color: 'var(--accent)' },
  ];

  const shareTotal = stats.categoryShare.reduce((s, c) => s + c.value, 0);
  const donut = stats.categoryShare.slice(0, 6).map((c, i) => ({
    label: c.label, value: c.value, color: DONUT_COLORS[i % DONUT_COLORS.length],
    pct: shareTotal ? Math.round((c.value / shareTotal) * 100) : 0,
  }));
  const maxSold = Math.max(1, ...stats.topProducts.map((t) => t.qty));

  return (
    <div className="grid" style={{ gap: 'var(--gap)' }}>
      <div className="page-head">
        <div>
          <div className="page-title">ภาพรวมร้าน 👋</div>
          <div className="muted page-subtitle">{today}</div>
        </div>
        <div className="page-head-actions">
          <button className="btn" onClick={() => onNav('analytics')}><Icons.chart /> ดูรายงานเต็ม</button>
          <button className="btn btn-primary" onClick={() => onNav('sales')}><Icons.cart /> เปิดบิลขาย</button>
        </div>
      </div>

      <div className="grid grid-4">
        {kpis.map((kpi, i) => (
          <div key={i} className="card kpi">
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}{kpi.unit && <span className="unit">{kpi.unit}</span>}</div>
            <div className="kpi-delta">
              {kpi.delta !== null && (
                <span className={kpi.delta >= 0 ? 'chip chip-pos' : 'chip chip-neg'}>{kpi.delta >= 0 ? '+' : ''}{kpi.delta}%</span>
              )}
              <span>{kpi.period}</span>
            </div>
            {kpi.spark.length > 0 && <div className="kpi-spark"><Sparkline data={kpi.spark} color={kpi.color} /></div>}
          </div>
        ))}
      </div>

      <div className="grid grid-12">
        <div className="card col-8">
          <div className="card-pad">
            <div className="section-h">
              <div><h3>ภาพรวมยอดขาย — 7 วันล่าสุด</h3><div className="muted section-sub">เทียบกับสัปดาห์ก่อนหน้า</div></div>
            </div>
            <AreaChart
              labels={stats.salesTrend.labels}
              series={[
                { name: 'สัปดาห์นี้', color: 'var(--accent)', data: stats.salesTrend.thisWeek },
                { name: 'สัปดาห์ก่อน', color: 'var(--ink-4)', data: stats.salesTrend.lastWeek, dashed: true },
              ]}
              height={220}
            />
          </div>
        </div>

        <div className="card col-4">
          <div className="card-pad">
            <div className="section-h"><div><h3>สัดส่วนยอดขายตามหมวด</h3><div className="muted section-sub">จากการขายทั้งหมด</div></div></div>
            {donut.length ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0 16px' }}><Donut data={donut} /></div>
                {donut.map((d, i) => (
                  <div key={i} className="donut-label" style={{ justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="sw" style={{ background: d.color }} /> {d.label}</span>
                    <span className="num muted">{d.pct}%</span>
                  </div>
                ))}
              </>
            ) : <div className="muted" style={{ padding: 24, textAlign: 'center' }}>ยังไม่มีข้อมูลการขาย</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-12">
        <div className="card col-7">
          <div className="card-pad">
            <div className="section-h">
              <div><h3>สินค้าขายดี</h3><div className="muted section-sub">จากการขายทั้งหมด</div></div>
              <div className="spacer" />
              <button className="btn btn-sm btn-ghost" onClick={() => onNav('inventory')}>ดูทั้งหมด <Icons.arrowRight /></button>
            </div>
            {stats.topProducts.length ? stats.topProducts.map((t, i) => (
              <div key={t.id} className="bar-row top-row">
                <div className="muted num" style={{ fontSize: 12 }}>{String(i + 1).padStart(2, '0')}</div>
                <div className="bar-label" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div className="name" style={{ fontWeight: 500 }}>{t.name}</div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(t.qty / maxSold) * 100}%` }} /></div>
                </div>
                <div className="num" style={{ textAlign: 'right' }}>{fmtTHB(t.revenue)}</div>
                <div className="num muted" style={{ textAlign: 'right' }}>{t.qty} ชิ้น</div>
              </div>
            )) : <div className="muted" style={{ padding: 24, textAlign: 'center' }}>ยังไม่มีการขาย</div>}
          </div>
        </div>

        <div className="card col-5">
          <div className="card-pad">
            <div className="section-h"><div><h3>ธุรกรรมล่าสุด</h3></div><div className="spacer" />
              <button className="btn btn-sm btn-ghost" onClick={() => onNav('sales')}>ทั้งหมด <Icons.arrowRight /></button>
            </div>
            {recent.length ? recent.map((t) => (
              <div key={t.id} className="txn">
                <div className="txn-ic">{t.kind === 'bundle' ? <Icons.layers /> : <Icons.cart />}</div>
                <div className="txn-body">
                  <div className="txn-title">{t.label}</div>
                  <div className="txn-sub">#{t.id} · {t.customer_name || 'ลูกค้าทั่วไป'} · {new Date(t.created_at).toLocaleDateString('th-TH')}</div>
                </div>
                <div style={{ textAlign: 'right' }}><div className="txn-amt">{fmtTHB(t.total)}</div></div>
              </div>
            )) : <div className="muted" style={{ padding: 24, textAlign: 'center' }}>ยังไม่มีธุรกรรม</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-pad">
          <div className="section-h">
            <Icons.warning style={{ color: 'var(--warn)' }} />
            <div><h3>แจ้งเตือนสินค้าใกล้หมด</h3><div className="muted section-sub">มี {stats.lowStock.length} รายการที่ควรสั่งเพิ่ม</div></div>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>สินค้า</th><th>SKU</th><th style={{ textAlign: 'right' }}>คงเหลือ</th><th style={{ textAlign: 'right' }}>จุดสั่งซื้อ</th><th>สถานะ</th></tr></thead>
              <tbody>
                {stats.lowStock.map((p) => (
                  <tr key={p.id}>
                    <td><div className="product-cell"><Thumb url={p.image_url} /><div><div className="product-cell-name">{p.name}</div><div className="product-cell-meta">{p.brand || '—'}</div></div></div></td>
                    <td className="mono">{p.sku || '—'}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{p.stock}</td>
                    <td className="num muted" style={{ textAlign: 'right' }}>{p.low}</td>
                    <td>{p.stock === 0 ? <span className="chip chip-neg chip-dot">หมดสต๊อก</span> : <span className="chip chip-warn chip-dot">เหลือน้อย</span>}</td>
                  </tr>
                ))}
                {stats.lowStock.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30 }} className="muted">ไม่มีสินค้าใกล้หมด 👍</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
