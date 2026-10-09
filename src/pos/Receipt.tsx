import Barcode from '../components/Barcode';
import { baht2 } from '../lib/format';
import type { Settings } from '../lib/types';
import { PAY_LABEL, type BillData } from './bill';

const when = (d: string) =>
  new Date(d).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** ใบเสร็จกว้าง 72 มม. สำหรับกระดาษความร้อน 80 มม. */
export function Receipt({ bill, settings, copy }: { bill: BillData; settings: Settings; copy?: boolean }) {
  const s = bill.sale;
  const sold = bill.items.filter((i) => i.qty > 0);
  const returned = bill.items.filter((i) => i.qty < 0);
  const title =
    s.kind === 'exchange' ? 'ใบเปลี่ยนสินค้า' : s.kind === 'refund' ? 'ใบคืนสินค้า' : settings.receipt_header;
  const pcs = sold.reduce((a, i) => a + i.qty, 0);

  return (
    <div className="receipt">
      <style>{'@page { margin: 0; }'}</style>
      <div className="c big">{settings.shop_name}</div>
      {settings.address && <div className="c sm">{settings.address}</div>}
      {settings.phone && <div className="c sm">โทร {settings.phone}</div>}
      <div className="c title">
        {title}
        {copy && ' (สำเนา)'}
      </div>
      {s.status === 'void' && <div className="c stamp">ยกเลิกแล้ว</div>}
      <div className="r2">
        <span>เลขที่ {s.bill_no}</span>
        <span>{when(s.created_at)}</span>
      </div>
      {bill.ref_bill_no && <div>อ้างอิงบิลเดิม {bill.ref_bill_no}</div>}
      <hr />

      {returned.length > 0 && (
        <>
          <div className="sec">รับคืน</div>
          {returned.map((i) => (
            <div key={i.id} className="item">
              <div>{i.product_name}</div>
              <div className="r2 sm">
                <span>
                  {i.color} · {i.size_label} · {-i.qty} × {baht2(i.unit_price)}
                  {i.return_to_stock === false && ' (ชำรุด)'}
                </span>
                <span>{baht2(i.line_total)}</span>
              </div>
            </div>
          ))}
          {sold.length > 0 && <div className="sec">สินค้าใหม่</div>}
        </>
      )}

      {sold.map((i) => (
        <div key={i.id} className="item">
          <div>{i.product_name}</div>
          <div className="r2 sm">
            <span>
              {i.color} · {i.size_label} · {i.qty} × {baht2(i.unit_price)}
            </span>
            <span>{baht2(i.unit_price * i.qty)}</span>
          </div>
          {i.promo_discount > 0 && (
            <div className="r2 sm">
              <span>  {i.promo_name ?? 'โปรโมชัน'}</span>
              <span>-{baht2(i.promo_discount)}</span>
            </div>
          )}
          {i.discount > 0 && (
            <div className="r2 sm">
              <span>  ส่วนลด</span>
              <span>-{baht2(i.discount)}</span>
            </div>
          )}
        </div>
      ))}
      <hr />

      {s.kind === 'sale' && (
        <div className="r2">
          <span>รวม {pcs} ชิ้น</span>
          <span>{baht2(s.subtotal)}</span>
        </div>
      )}
      {s.promo_discount > 0 && (
        <div className="r2">
          <span>ส่วนลดโปรโมชัน</span>
          <span>-{baht2(s.promo_discount)}</span>
        </div>
      )}
      {s.item_discount > 0 && (
        <div className="r2">
          <span>ส่วนลดรายการ</span>
          <span>-{baht2(s.item_discount)}</span>
        </div>
      )}
      {s.bill_discount > 0 && (
        <div className="r2">
          <span>ส่วนลดท้ายบิล</span>
          <span>-{baht2(s.bill_discount)}</span>
        </div>
      )}
      {s.points_discount > 0 && (
        <div className="r2">
          <span>ใช้ {s.points_used} แต้ม</span>
          <span>-{baht2(s.points_discount)}</span>
        </div>
      )}
      <div className="r2 total">
        <span>{s.total < 0 ? 'คืนเงินลูกค้า' : s.kind === 'sale' ? 'ยอดสุทธิ' : 'ชำระส่วนต่าง'}</span>
        <span>{baht2(Math.abs(s.total))}</span>
      </div>
      {s.pay_method && s.pay_method !== 'none' && (
        <div className="r2">
          <span>{s.total < 0 ? 'คืนเป็น' : 'ชำระโดย'}</span>
          <span>{PAY_LABEL[s.pay_method] ?? s.pay_method}</span>
        </div>
      )}
      {s.cash_received != null && s.total > 0 && (
        <>
          <div className="r2">
            <span>รับเงิน</span>
            <span>{baht2(s.cash_received)}</span>
          </div>
          <div className="r2">
            <span>เงินทอน</span>
            <span>{baht2(s.change_amount ?? 0)}</span>
          </div>
        </>
      )}

      {bill.member && (
        <>
          <hr />
          <div className="r2">
            <span>สมาชิก {bill.member.nickname}</span>
            <span>xxx-xxx-{bill.member.phone.slice(-4)}</span>
          </div>
          {s.points_earned !== 0 && (
            <div className="r2">
              <span>{s.points_earned > 0 ? 'แต้มที่ได้รับ' : 'หักแต้มคืน'}</span>
              <span>{s.points_earned > 0 ? `+${s.points_earned}` : s.points_earned}</span>
            </div>
          )}
          <div className="r2">
            <span>แต้มคงเหลือ</span>
            <span>{bill.member.points}</span>
          </div>
        </>
      )}

      <hr />
      {settings.vat_note && <div className="c sm">{settings.vat_note}</div>}
      {settings.receipt_footer && <div className="c">{settings.receipt_footer}</div>}
      <div className="c bc">
        <Barcode value={s.bill_no} height={34} fontSize={12} width={1.4} />
      </div>
    </div>
  );
}

export interface ShiftSummary {
  shift_id: number;
  status: string;
  opened_at: string;
  opening_cash: number;
  expected_cash: number;
  methods: Record<string, { bills: number; total: number }>;
  bills: number;
  net_total: number;
  void_bills: number;
  discounts: number;
  counted_cash?: number;
  difference?: number;
}

export function ShiftSlip({ summary, settings, note }: { summary: ShiftSummary; settings: Settings; note?: string }) {
  return (
    <div className="receipt">
      <style>{'@page { margin: 0; }'}</style>
      <div className="c big">{settings.shop_name}</div>
      <div className="c title">สรุปปิดยอด</div>
      <div className="r2">
        <span>เปิดร้าน</span>
        <span>{when(summary.opened_at)}</span>
      </div>
      <div className="r2">
        <span>ปิดยอด</span>
        <span>{when(new Date().toISOString())}</span>
      </div>
      <hr />
      <div className="r2">
        <span>จำนวนบิล</span>
        <span>{summary.bills}</span>
      </div>
      <div className="r2">
        <span>บิลที่ยกเลิก</span>
        <span>{summary.void_bills}</span>
      </div>
      <div className="r2">
        <span>ส่วนลดทั้งหมด</span>
        <span>{baht2(summary.discounts)}</span>
      </div>
      <hr />
      {Object.entries(summary.methods).map(([k, v]) => (
        <div key={k} className="r2">
          <span>
            {PAY_LABEL[k] ?? k} ({v.bills})
          </span>
          <span>{baht2(v.total)}</span>
        </div>
      ))}
      <div className="r2 total">
        <span>ยอดสุทธิ</span>
        <span>{baht2(summary.net_total)}</span>
      </div>
      <hr />
      <div className="r2">
        <span>เงินทอนตั้งต้น</span>
        <span>{baht2(summary.opening_cash)}</span>
      </div>
      <div className="r2">
        <span>เงินสดที่ควรมี</span>
        <span>{baht2(summary.expected_cash)}</span>
      </div>
      {summary.counted_cash != null && (
        <>
          <div className="r2">
            <span>นับได้จริง</span>
            <span>{baht2(summary.counted_cash)}</span>
          </div>
          <div className="r2 total">
            <span>{(summary.difference ?? 0) < 0 ? 'ขาด' : (summary.difference ?? 0) > 0 ? 'เกิน' : 'ตรงยอด'}</span>
            <span>{baht2(Math.abs(summary.difference ?? 0))}</span>
          </div>
        </>
      )}
      {note && <div className="sm">หมายเหตุ: {note}</div>}
    </div>
  );
}
