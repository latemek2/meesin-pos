// สร้างข้อความ QR พร้อมเพย์ตามมาตรฐาน EMVCo (Thai QR Payment)
// รองรับเบอร์มือถือ 10 หลัก และเลขบัตรประชาชน / เลขผู้เสียภาษี 13 หลัก

const field = (id: string, value: string) => id + String(value.length).padStart(2, '0') + value;

/** CRC-16/CCITT-FALSE */
export function crc16(s: string) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function promptPayPayload(id: string, amount?: number) {
  const digits = id.replace(/\D/g, '');
  const target =
    digits.length >= 13
      ? field('02', digits.slice(0, 13))
      : field('01', ('0000000000000' + digits.replace(/^0/, '66')).slice(-13));
  const merchant = field('00', 'A000000677010111') + target;
  let payload =
    field('00', '01') +
    field('01', amount ? '12' : '11') +
    field('29', merchant) +
    field('53', '764') +
    (amount ? field('54', amount.toFixed(2)) : '') +
    field('58', 'TH') +
    '6304';
  payload += crc16(payload);
  return payload;
}
