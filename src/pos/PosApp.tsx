import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { getCategories, getSettings, getStock, must, useLoad } from '../lib/data';
import { ErrorBox, Loading, useToast } from '../components/ui';
import type { StockRow } from '../lib/types';
import type { Promo } from './cart';
import { useCart } from './useCart';
import { PinPad, OwnerPinModal } from './PinPad';
import SellView from './SellView';
import StockView from './StockView';
import ExchangeView from './ExchangeView';
import { CloseShiftView, OpenShift } from './ShiftViews';
import { HeldBillsModal, ReprintModal, VoidModal } from './BillTools';
import { PrintProvider } from './print';
import '../pos.css';

const UNLOCK_KEY = 'meesin.pos.unlocked';

export default function PosApp() {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(UNLOCK_KEY) === '1';
    } catch {
      return false;
    }
  });
  const lock = useCallback(() => {
    try {
      sessionStorage.removeItem(UNLOCK_KEY);
    } catch {
      /* ไม่เป็นไร */
    }
    setUnlocked(false);
  }, []);

  return (
    <PrintProvider>
      {unlocked ? (
        <PosMain onLock={lock} />
      ) : (
        <LockScreen
          onUnlock={() => {
            try {
              sessionStorage.setItem(UNLOCK_KEY, '1');
            } catch {
              /* ไม่เป็นไร */
            }
            setUnlocked(true);
          }}
        />
      )}
    </PrintProvider>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { signOut, role } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="login">
      <div className="card" style={{ width: 'min(380px, 100%)', justifyItems: 'center' }}>
        <div className="logo">
          <img src="/favicon.svg" alt="" />
          <div>
            <h1>มีศิลป์ POS</h1>
            <div className="muted small">ใส่ PIN เพื่อเริ่มขาย</div>
          </div>
        </div>
        <PinPad
          label="เข้าหน้าขาย"
          onSubmit={async (pin) => {
            setErr(null);
            const { data, error } = await supabase.rpc('verify_pos_pin', { p_pin: pin });
            if (error) {
              setErr(errorText(error));
              return false;
            }
            if (!data) {
              setErr('PIN ไม่ถูกต้อง');
              return false;
            }
            onUnlock();
            return true;
          }}
        />
        <ErrorBox error={err} />
        <div className="row">
          {role === 'owner' && (
            <Link className="btn ghost sm" to="/admin">
              ไปหลังบ้าน
            </Link>
          )}
          <button type="button" className="btn ghost sm" onClick={signOut}>
            ออกจากระบบเครื่องนี้
          </button>
        </div>
      </div>
    </div>
  );
}

type View = 'sell' | 'stock' | 'exchange' | 'close';

function PosMain({ onLock }: { onLock: () => void }) {
  const { role } = useAuth();
  const toast = useToast();
  const cart = useCart();
  const [view, setView] = useState<View>('sell');
  const [tool, setTool] = useState<null | 'held' | 'void' | 'reprint'>(null);
  const [heldCount, setHeldCount] = useState(0);
  const [pinReq, setPinReq] = useState<{ title: string; detail?: string; resolve: (pin: string | null) => void } | null>(null);
  const [clock, setClock] = useState(() => new Date());

  const { data, error, loading, reload, setData } = useLoad(async () => {
    const [settings, categories, stock, promos, shifts] = await Promise.all([
      getSettings(),
      getCategories(),
      getStock(),
      must<Promo[]>(supabase.from('promotions').select('*, promotion_targets(category_id, product_id)').eq('active', true)),
      must<{ id: number; opened_at: string; opening_cash: number }[]>(
        supabase.from('shifts').select('id, opened_at, opening_cash').eq('status', 'open').limit(1),
      ),
    ]);
    return { settings, categories, stock, promos, shift: shifts[0] ?? null };
  });

  const { refreshRows } = cart;
  const refreshStock = useCallback(async () => {
    try {
      const stock: StockRow[] = await getStock();
      setData((d) => (d ? { ...d, stock } : d));
      refreshRows(stock);
    } catch (e) {
      toast(`โหลดสต็อกไม่สำเร็จ: ${errorText(e)}`, 'danger');
    }
  }, [setData, refreshRows, toast]);

  const refreshHeld = useCallback(async () => {
    const { count } = await supabase.from('held_bills').select('id', { count: 'exact', head: true });
    setHeldCount(count ?? 0);
  }, []);

  useEffect(() => {
    refreshHeld();
    const t = window.setInterval(() => setClock(new Date()), 30000);
    // ดึงสต็อกใหม่ทุก 2 นาที และทุกครั้งที่กลับมาที่หน้าต่างนี้ เผื่อหลังบ้านรับของเข้า
    const s = window.setInterval(refreshStock, 120000);
    const onFocus = () => refreshStock();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(t);
      window.clearInterval(s);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshHeld, refreshStock]);

  const askOwner = useCallback(
    (title: string, detail?: string) => new Promise<string | null>((resolve) => setPinReq({ title, detail, resolve })),
    [],
  );

  const inCart = useMemo(() => new Map(cart.lines.map((l) => [l.row.variant_id, l.qty])), [cart.lines]);

  if (loading && !data) return <Loading text="กำลังเปิดหน้าขาย…" />;
  if (!data)
    return (
      <div className="login">
        <div className="card">
          <ErrorBox error={error} />
          <button type="button" className="btn primary" onClick={reload}>
            ลองใหม่
          </button>
        </div>
      </div>
    );
  if (!data.shift) return <OpenShift settings={data.settings} onOpened={reload} onLock={onLock} />;

  const tab = (v: View, label: string) => (
    <button type="button" className={`btn ${view === v ? 'on' : ''}`} onClick={() => setView(v)}>
      {label}
    </button>
  );

  return (
    <div className="pos">
      <header className="pos-top">
        <span className="title">{data.settings.shop_name}</span>
        <span className="meta">
          {clock.toLocaleString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
        <nav className="tools">
          {tab('sell', 'ขาย')}
          {tab('stock', 'เช็กสต็อก')}
          <button type="button" className="btn" onClick={() => setTool('held')}>
            บิลที่พัก {heldCount > 0 && <span className="count">{heldCount}</span>}
          </button>
          {tab('exchange', 'เปลี่ยน/คืน')}
          <button type="button" className="btn" onClick={() => setTool('void')}>
            ยกเลิกบิล
          </button>
          <button type="button" className="btn" onClick={() => setTool('reprint')}>
            พิมพ์ซ้ำ
          </button>
          {tab('close', 'ปิดยอด')}
          {role === 'owner' && (
            <Link className="btn" to="/admin">
              หลังบ้าน
            </Link>
          )}
          <button type="button" className="btn" onClick={onLock} aria-label="ล็อกหน้าจอ">
            ล็อก
          </button>
        </nav>
      </header>

      {view === 'sell' && (
        <SellView
          settings={data.settings}
          categories={data.categories}
          stock={data.stock}
          promos={data.promos}
          cart={cart}
          askOwner={askOwner}
          onStockChanged={refreshStock}
          onHeldChanged={refreshHeld}
        />
      )}
      {view === 'stock' && (
        <StockView
          settings={data.settings}
          categories={data.categories}
          stock={data.stock}
          inCart={inCart}
          onAdd={(row) => {
            cart.add(row);
            toast(`เพิ่ม ${row.product_name} ${row.color} ${row.size_label} ลงบิลปัจจุบัน`);
          }}
        />
      )}
      {view === 'exchange' && (
        <ExchangeView
          settings={data.settings}
          stock={data.stock}
          askOwner={askOwner}
          onDone={refreshStock}
          onExit={() => setView('sell')}
        />
      )}
      {view === 'close' && (
        <CloseShiftView
          settings={data.settings}
          onCancel={() => setView('sell')}
          onClosed={() => {
            setView('sell');
            reload();
          }}
        />
      )}

      {tool === 'held' && (
        <HeldBillsModal
          stock={data.stock}
          cart={cart}
          onChanged={refreshHeld}
          onClose={() => {
            setTool(null);
            setView('sell');
          }}
        />
      )}
      {tool === 'void' && (
        <VoidModal
          askOwner={askOwner}
          onClose={() => setTool(null)}
          onDone={() => {
            setTool(null);
            refreshStock();
          }}
        />
      )}
      {tool === 'reprint' && <ReprintModal settings={data.settings} onClose={() => setTool(null)} />}
      {pinReq && (
        <OwnerPinModal
          title={pinReq.title}
          detail={pinReq.detail}
          onDone={(pin) => {
            pinReq.resolve(pin);
            setPinReq(null);
          }}
        />
      )}
    </div>
  );
}
