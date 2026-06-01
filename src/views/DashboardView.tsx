import { Icons } from '../components/Icons';
import { Sparkline } from '../components/charts/Sparkline';
import { AreaChart } from '../components/charts/AreaChart';
import { Donut } from '../components/charts/Donut';
import { PRODUCTS, TXNS, productById } from '../data/catalog';
import { fmtTHB, fmtN } from '../data/format';
import type { Product, ViewId } from '../types';

interface ViewProps {
  onNav: (id: ViewId) => void;
}

export function DashboardView({ onNav }: ViewProps) {
  const lowStock = PRODUCTS.filter((p) => p.stock <= p.low);
  const inventoryValue = PRODUCTS.reduce((s, p) => s + p.stock * p.cost, 0);
  const monthSales = 1248430;
  const monthProfit = 218940;
  const orders = 142;

  const kpis = [
    { label: 'ยอดขายเดือนนี้', value: fmtTHB(monthSales), delta: '+12.4%', positive: true, period: 'เทียบกับเดือนก่อน', spark: [40, 42, 48, 46, 52, 58, 57, 63, 68, 72, 80, 76, 84, 92], color: 'var(--accent)' },
    { label: 'กำไรสุทธิ', value: fmtTHB(monthProfit), delta: '+8.1%', positive: true, period: 'เทียบกับเดือนก่อน', spark: [22, 24, 23, 28, 26, 32, 34, 36, 38, 42, 40, 45, 48, 52], color: 'var(--pos)' },
    { label: 'มูลค่าคลังสินค้า', value: fmtTHB(inventoryValue), delta: '−2.3%', positive: false, period: 'จากการขายออก', spark: [80, 78, 82, 79, 76, 74, 72, 75, 73, 70, 68, 66, 64, 62], color: 'var(--ink-2)' },
    { label: 'คำสั่งซื้อ', value: fmtN(orders), unit: 'รายการ', delta: '+18', positive: true, period: 'จาก 7 วันก่อนหน้า', spark: [4, 6, 5, 8, 7, 9, 11, 8, 12, 14, 10, 15, 16, 18], color: 'var(--accent)' },
  ];

  const topSelling = [
    { p: productById('P-0410')!, sold: 38, revenue: 38 * 5290 },
    { p: productById('P-0152')!, sold: 22, revenue: 22 * 9450 },
    { p: productById('P-0511')!, sold: 19, revenue: 19 * 3490 },
    { p: productById('P-0810')!, sold: 17, revenue: 17 * 5290 },
    { p: productById('P-0411')!, sold: 14, revenue: 14 * 2490 },
  ];
  const maxSold = Math.max(...topSelling.map((t) => t.sold));

  const week = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

  const categoryShare = [
    { label: 'การ์ดจอ', value: 442000, color: 'var(--accent)', pct: 41 },
    { label: 'ซีพียู', value: 285000, color: 'var(--pos)', pct: 27 },
    { label: 'เมนบอร์ด', value: 138000, color: 'var(--warn)', pct: 13 },
    { label: 'อุปกรณ์อื่น ๆ', value: 198000, color: 'var(--ink-3)', pct: 19 },
  ];

  return (
    <div className="grid" style={{ gap: 'var(--gap)' }}>
      <div className="page-head">
        <div>
          <div className="page-title">สวัสดีตอนเช้า, กรกฎ 👋</div>
          <div className="muted page-subtitle">ภาพรวมร้าน วันจันทร์ที่ 26 พฤษภาคม 2568</div>
        </div>
        <div className="page-head-actions">
          <button className="btn" onClick={() => onNav('analytics')}><Icons.chart /> ดูรายงานเต็ม</button>
          <button className="btn btn-primary" onClick={() => onNav('sales')}><Icons.cart /> เปิดบิลขาย</button>
        </div>
      </div>

      <div className="grid grid-4">
        {kpis.map((k, i) => (
          <div key={i} className="card kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="kpi-delta">
              <span className={k.positive ? 'chip chip-pos' : 'chip chip-neg'}>{k.delta}</span>
              <span>{k.period}</span>
            </div>
            <div className="kpi-spark"><Sparkline data={k.spark} color={k.color} /></div>
          </div>
        ))}
      </div>

      <div className="grid grid-12">
        <div className="card col-8">
          <div className="card-pad">
            <div className="section-h">
              <div>
                <h3>ภาพรวมยอดขาย — 7 วันล่าสุด</h3>
                <div className="muted section-sub">เปรียบเทียบกับสัปดาห์ก่อนหน้า</div>
              </div>
              <div className="spacer" />
              <button className="btn btn-sm btn-ghost">รายวัน</button>
              <button className="btn btn-sm">รายสัปดาห์</button>
              <button className="btn btn-sm btn-ghost">รายเดือน</button>
            </div>
            <AreaChart
              labels={week}
              series={[
                { name: 'ยอดขาย', color: 'var(--accent)', data: [124000, 168000, 142000, 198000, 215000, 268000, 232000] },
                { name: 'สัปดาห์ก่อน', color: 'var(--ink-4)', data: [108000, 132000, 158000, 142000, 182000, 215000, 198000], dashed: true },
              ]}
              height={220}
            />
          </div>
        </div>

        <div className="card col-4">
          <div className="card-pad">
            <div className="section-h">
              <div>
                <h3>สัดส่วนยอดขายตามหมวด</h3>
                <div className="muted section-sub">30 วันล่าสุด</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0 16px' }}>
              <Donut data={categoryShare} />
            </div>
            <div>
              {categoryShare.map((d, i) => (
                <div key={i} className="donut-label" style={{ justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="sw" style={{ background: d.color }} /> {d.label}
                  </span>
                  <span className="num muted">{d.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-12">
        <div className="card col-7">
          <div className="card-pad">
            <div className="section-h">
              <div>
                <h3>สินค้าขายดี</h3>
                <div className="muted section-sub">30 วันที่ผ่านมา</div>
              </div>
              <div className="spacer" />
              <button className="btn btn-sm btn-ghost" onClick={() => onNav('inventory')}>ดูทั้งหมด <Icons.arrowRight /></button>
            </div>
            <div>
              {topSelling.map(({ p, sold, revenue }, i) => (
                <div key={p.id} className="bar-row top-row">
                  <div className="muted num" style={{ fontSize: 12 }}>{String(i + 1).padStart(2, '0')}</div>
                  <div className="bar-label" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div className="name" style={{ fontWeight: 500 }}>{p.name}</div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${(sold / maxSold) * 100}%` }} /></div>
                  </div>
                  <div className="num" style={{ textAlign: 'right' }}>{fmtTHB(revenue)}</div>
                  <div className="num muted" style={{ textAlign: 'right' }}>{sold} ชิ้น</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card col-5">
          <div className="card-pad">
            <div className="section-h">
              <div><h3>ธุรกรรมล่าสุด</h3></div>
              <div className="spacer" />
              <button className="btn btn-sm btn-ghost">ทั้งหมด <Icons.arrowRight /></button>
            </div>
            <div>
              {TXNS.slice(0, 5).map((t) => (
                <div key={t.id} className="txn">
                  <div className="txn-ic">{t.type === 'bundle' ? <Icons.layers /> : <Icons.cart />}</div>
                  <div className="txn-body">
                    <div className="txn-title">{t.label}</div>
                    <div className="txn-sub">{t.id} · {t.customer} · {t.ts}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="txn-amt">{fmtTHB(t.amount)}</div>
                    <div style={{ marginTop: 3 }}>
                      {t.status === 'paid' && <span className="chip chip-pos chip-dot">ชำระแล้ว</span>}
                      {t.status === 'pending' && <span className="chip chip-warn chip-dot">รอชำระ</span>}
                      {t.status === 'refunded' && <span className="chip chip-neg chip-dot">คืนเงิน</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-pad">
          <div className="section-h">
            <Icons.warning style={{ color: 'var(--warn)' }} />
            <div>
              <h3>แจ้งเตือนสินค้าใกล้หมด</h3>
              <div className="muted section-sub">มี {lowStock.length} รายการที่ควรสั่งเพิ่ม</div>
            </div>
            <div className="spacer" />
            <button className="btn btn-sm">สร้างใบสั่งซื้อ</button>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>สินค้า</th><th>SKU</th><th style={{ textAlign: 'right' }}>คงเหลือ</th>
                  <th style={{ textAlign: 'right' }}>จุดสั่งซื้อ</th><th>สถานะ</th><th />
                </tr>
              </thead>
              <tbody>
                {lowStock.map((p: Product) => (
                  <tr key={p.id}>
                    <td>
                      <div className="product-cell">
                        <div className="thumb">{p.cat.toUpperCase()}</div>
                        <div><div className="product-cell-name">{p.name}</div><div className="product-cell-meta">{p.brand}</div></div>
                      </div>
                    </td>
                    <td className="mono">{p.sku}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{p.stock}</td>
                    <td className="num muted" style={{ textAlign: 'right' }}>{p.low}</td>
                    <td>{p.stock === 0
                      ? <span className="chip chip-neg chip-dot">หมดสต๊อก</span>
                      : <span className="chip chip-warn chip-dot">เหลือน้อย</span>}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn btn-sm">สั่งเพิ่ม</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
