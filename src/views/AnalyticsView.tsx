import { useState } from 'react';
import { Icons } from '../components/Icons';
import { Sparkline } from '../components/charts/Sparkline';
import { BarChart } from '../components/charts/BarChart';
import { Donut } from '../components/charts/Donut';
import { AreaChart } from '../components/charts/AreaChart';
import { BUNDLES, productById } from '../data/catalog';
import { fmtTHB } from '../data/format';

type Range = '7d' | '30d' | '90d' | '1y';
type Tab = 'sales' | 'profit' | 'inventory' | 'bundle';

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export function AnalyticsView() {
  const [range, setRange] = useState<Range>('30d');
  const [tab, setTab] = useState<Tab>('sales');

  const salesByMonth = [682000, 745000, 821000, 794000, 880000, 928000, 1010000, 1085000, 1124000, 1192000, 1228000, 1248430];
  const profitByMonth = salesByMonth.map((v) => Math.round(v * 0.175));

  const headline = [
    { label: 'ยอดขายรวม', value: fmtTHB(1248430), delta: '+12.4%', positive: true, hint: 'จากเดือนก่อน' },
    { label: 'กำไรสุทธิ', value: fmtTHB(218940), delta: '+8.1%', positive: true, hint: 'อัตรากำไร 17.5%' },
    { label: 'ออเดอร์', value: '142', unit: 'รายการ', delta: '+18', positive: true, hint: 'มูลค่าเฉลี่ย ' + fmtTHB(8792) },
    { label: 'อัตราเปลี่ยนสต๊อก', value: '2.4×', delta: '+0.3', positive: true, hint: 'ต่อเดือน' },
  ];

  const ranges: { id: Range; label: string }[] = [
    { id: '7d', label: '7 วัน' },
    { id: '30d', label: '30 วัน' },
    { id: '90d', label: '90 วัน' },
    { id: '1y', label: '1 ปี' },
  ];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'sales', label: 'ยอดขาย' },
    { id: 'profit', label: 'กำไร' },
    { id: 'inventory', label: 'การเคลื่อนไหวสต๊อก' },
    { id: 'bundle', label: 'ประสิทธิภาพชุดสินค้า' },
  ];

  const donutShare = [
    { label: 'การ์ดจอ', value: 442000, color: 'var(--accent)', pct: 41 },
    { label: 'ซีพียู', value: 285000, color: 'var(--pos)', pct: 27 },
    { label: 'เมนบอร์ด', value: 138000, color: 'var(--warn)', pct: 13 },
    { label: 'แรม', value: 86000, color: 'oklch(0.65 0.13 25)', pct: 8 },
    { label: 'อื่น ๆ', value: 112000, color: 'var(--ink-3)', pct: 11 },
  ];

  const topProducts = [
    { id: 'P-0410', sold: 38, rev: 38 * 5290, prof: 38 * 1090 },
    { id: 'P-0152', sold: 22, rev: 22 * 9450, prof: 22 * 1550 },
    { id: 'P-0511', sold: 19, rev: 19 * 3490, prof: 19 * 690 },
    { id: 'P-0810', sold: 17, rev: 17 * 5290, prof: 17 * 1090 },
    { id: 'P-0411', sold: 14, rev: 14 * 2490, prof: 14 * 540 },
  ];

  const monthly = [
    { m: 'พ.ค. 2568', s: 1248430, p: 218940, o: 142 },
    { m: 'เม.ย. 2568', s: 1110650, p: 194380, o: 124 },
    { m: 'มี.ค. 2568', s: 1085200, p: 189910, o: 118 },
    { m: 'ก.พ. 2568', s: 1010500, p: 176830, o: 109 },
    { m: 'ม.ค. 2568', s: 928800, p: 162540, o: 102 },
  ];

  const velocity = [
    { name: 'แรม', vel: 92, color: 'var(--accent)' },
    { name: 'หน่วยเก็บข้อมูล', vel: 78, color: 'var(--pos)' },
    { name: 'ซีพียู', vel: 64, color: 'var(--warn)' },
    { name: 'อุปกรณ์เสริม', vel: 58, color: 'oklch(0.65 0.13 25)' },
    { name: 'การ์ดจอ', vel: 41, color: 'var(--ink-3)' },
    { name: 'เมนบอร์ด', vel: 32, color: 'var(--ink-4)' },
  ];

  return (
    <div className="grid" style={{ gap: 'var(--gap)' }}>
      <div className="page-head">
        <div>
          <div className="page-title">วิเคราะห์และรายงาน</div>
          <div className="muted page-subtitle">ภาพรวมยอดขาย กำไร และการเคลื่อนไหวของสินค้า</div>
        </div>
        <div className="page-head-actions" style={{ alignItems: 'center' }}>
          <div className="range-seg">
            {ranges.map((o) => (
              <button
                key={o.id}
                className="btn btn-sm range-btn"
                onClick={() => setRange(o.id)}
                data-active={range === o.id}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button className="btn"><Icons.calendar /> 28 เม.ย. – 26 พ.ค. 2568</button>
          <button className="btn"><Icons.download /> ส่งออก</button>
        </div>
      </div>

      <div className="grid grid-4">
        {headline.map((k, i) => (
          <div key={i} className="card kpi" style={{ minHeight: 100 }}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}{k.unit && <span className="unit">{k.unit}</span>}</div>
            <div className="kpi-delta">
              <span className={k.positive ? 'chip chip-pos' : 'chip chip-neg'}>{k.delta}</span>
              <span>{k.hint}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="tabs tabs-scroll">
        {tabs.map((t) => (
          <button key={t.id} className="tab" data-active={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'sales' && (
        <div className="grid grid-12">
          <div className="card col-8">
            <div className="card-pad">
              <div className="section-h"><div><h3>ยอดขายรายเดือน</h3><div className="muted section-sub">12 เดือนล่าสุด</div></div></div>
              <BarChart labels={MONTHS} height={260} legend series={[
                { name: 'ยอดขาย', color: 'var(--accent)', data: salesByMonth },
                { name: 'กำไร', color: 'var(--pos)', data: profitByMonth },
              ]} />
            </div>
          </div>
          <div className="card col-4">
            <div className="card-pad">
              <div className="section-h"><div><h3>สัดส่วนยอดขาย</h3><div className="muted section-sub">ตามหมวด</div></div></div>
              <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
                <Donut size={180} data={donutShare} />
              </div>
              {donutShare.map((d) => (
                <div key={d.label} className="donut-label" style={{ justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="sw" style={{ background: d.color }} /> {d.label}</span>
                  <span className="num muted">{d.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card col-7">
            <div className="card-pad">
              <div className="section-h"><div><h3>สินค้าขายดี 5 อันดับ</h3></div></div>
              <div className="table-wrap">
                <table className="tbl" style={{ marginTop: -4 }}>
                  <thead><tr><th>สินค้า</th><th style={{ textAlign: 'right' }}>จำนวน</th><th style={{ textAlign: 'right' }}>ยอดขาย</th><th style={{ textAlign: 'right' }}>กำไร</th></tr></thead>
                  <tbody>
                    {topProducts.map((r) => {
                      const p = productById(r.id)!;
                      return (
                        <tr key={r.id}>
                          <td><div className="product-cell"><div className="thumb">{p.cat.toUpperCase()}</div><div><div className="product-cell-name">{p.name}</div><div className="product-cell-meta">{p.sku}</div></div></div></td>
                          <td className="num" style={{ textAlign: 'right' }}>{r.sold}</td>
                          <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(r.rev)}</td>
                          <td className="num" style={{ textAlign: 'right', color: 'var(--pos)' }}>+{fmtTHB(r.prof)}</td>
                        </tr>
                      );
                    })}
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
                  <div key={r.m} className="month-row" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
                    <div><div style={{ fontWeight: 500, fontSize: 13.5 }}>{r.m}</div><div className="muted" style={{ fontSize: 12, marginTop: 1 }}>{r.o} ออเดอร์</div></div>
                    <div className="num" style={{ textAlign: 'right' }}><div style={{ fontWeight: 600 }}>{fmtTHB(r.s)}</div><div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>ยอดขาย</div></div>
                    <div className="num" style={{ textAlign: 'right', color: 'var(--pos)' }}><div style={{ fontWeight: 600 }}>+{fmtTHB(r.p)}</div><div className="muted" style={{ fontSize: 11.5, marginTop: 1, color: 'var(--ink-3)' }}>กำไร</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'profit' && (
        <div className="card card-pad">
          <div className="section-h"><div><h3>เส้นกราฟกำไรสุทธิ vs ยอดขาย</h3></div></div>
          <AreaChart labels={MONTHS} height={300} series={[
            { name: 'ยอดขาย', color: 'var(--accent)', data: salesByMonth },
            { name: 'กำไร', color: 'var(--pos)', data: profitByMonth },
          ]} />
        </div>
      )}

      {tab === 'inventory' && (
        <div className="grid grid-12">
          <div className="card col-7">
            <div className="card-pad">
              <div className="section-h"><div><h3>การเคลื่อนไหวสต๊อก</h3><div className="muted section-sub">นำเข้า vs ขายออก 12 เดือน</div></div></div>
              <BarChart labels={MONTHS} height={240} legend series={[
                { name: 'นำเข้า', color: 'var(--ink-3)', data: [22, 28, 35, 30, 42, 38, 45, 52, 48, 55, 60, 58] },
                { name: 'ขายออก', color: 'var(--accent)', data: [18, 24, 30, 28, 38, 42, 48, 55, 52, 58, 65, 68] },
              ]} />
            </div>
          </div>
          <div className="card col-5">
            <div className="card-pad">
              <div className="section-h"><div><h3>หมวดที่เคลื่อนไหวเร็วสุด</h3></div></div>
              {velocity.map((c) => (
                <div key={c.name} className="bar-row" style={{ gridTemplateColumns: '1fr 50px' }}>
                  <div className="bar-label" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div className="name">{c.name}</div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: c.vel + '%', background: c.color }} /></div>
                  </div>
                  <div className="num muted" style={{ textAlign: 'right' }}>{c.vel}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'bundle' && (
        <div className="card card-pad">
          <div className="section-h"><div><h3>ประสิทธิภาพชุดสินค้า</h3></div></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>ชุด</th><th style={{ textAlign: 'right' }}>ขายไป</th><th style={{ textAlign: 'right' }}>ยอดรวม</th><th style={{ textAlign: 'right' }}>กำไรรวม</th><th style={{ textAlign: 'right' }}>อัตรากำไร</th><th>เทรนด์</th></tr></thead>
              <tbody>
                {BUNDLES.map((b) => {
                  const rev = b.price * b.sold;
                  const prof = (b.price - b.cost) * b.sold;
                  const margin = ((b.price - b.cost) / b.price) * 100;
                  return (
                    <tr key={b.id}>
                      <td><div style={{ fontWeight: 500 }}>{b.name}</div><div className="muted mono" style={{ fontSize: 11.5 }}>{b.id} · {b.items.length} ชิ้น</div></td>
                      <td className="num" style={{ textAlign: 'right' }}>{b.sold}</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(rev)}</td>
                      <td className="num" style={{ textAlign: 'right', color: 'var(--pos)' }}>+{fmtTHB(prof)}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{margin.toFixed(1)}%</td>
                      <td style={{ width: 120 }}><Sparkline data={[2, 4, 3, 5, 7, 6, 9, 12, 10, 14, 12, 15]} color="var(--pos)" height={28} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
