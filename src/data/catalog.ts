// Mock catalog for a Thai computer shop. Replace with a real API/DB later —
// the views only depend on these typed shapes, not on where the data comes from.

import type { Bundle, Category, Product, Txn } from '../types';

export const CATEGORIES: Category[] = [
  { id: 'all', name: 'ทั้งหมด' },
  { id: 'gpu', name: 'การ์ดจอ' },
  { id: 'cpu', name: 'ซีพียู' },
  { id: 'mb', name: 'เมนบอร์ด' },
  { id: 'ram', name: 'แรม' },
  { id: 'ssd', name: 'หน่วยเก็บข้อมูล' },
  { id: 'psu', name: 'พาวเวอร์' },
  { id: 'monitor', name: 'จอแสดงผล' },
  { id: 'peripheral', name: 'อุปกรณ์เสริม' },
];

export const categoryName = (id: Product['cat'] | 'all'): string =>
  CATEGORIES.find((c) => c.id === id)?.name ?? id;

export const PRODUCTS: Product[] = [
  { id: 'P-0341', cat: 'gpu', name: 'ASUS ROG Strix RTX 4080 Super', sku: 'GPU-RTX4080S-ROG', serial: 'SN-A4080S-2401', cost: 41500, price: 49900, stock: 7, low: 5, brand: 'ASUS', warranty: 36 },
  { id: 'P-0342', cat: 'gpu', name: 'MSI Gaming X RTX 4070 Ti', sku: 'GPU-RTX4070TI-MSI', serial: 'SN-M4070TI-1188', cost: 27800, price: 33500, stock: 12, low: 6, brand: 'MSI', warranty: 36 },
  { id: 'P-0343', cat: 'gpu', name: 'Gigabyte RTX 4060 Eagle', sku: 'GPU-RTX4060-GB', serial: 'SN-G4060-7732', cost: 11200, price: 13900, stock: 3, low: 5, brand: 'Gigabyte', warranty: 36 },
  { id: 'P-0150', cat: 'cpu', name: 'Intel Core i7-14700K', sku: 'CPU-I714700K', serial: 'SN-I7-14700K-9821', cost: 13900, price: 16500, stock: 18, low: 8, brand: 'Intel', warranty: 36 },
  { id: 'P-0151', cat: 'cpu', name: 'AMD Ryzen 7 7800X3D', sku: 'CPU-R7-7800X3D', serial: 'SN-R7-7800-3387', cost: 14200, price: 16900, stock: 9, low: 6, brand: 'AMD', warranty: 36 },
  { id: 'P-0152', cat: 'cpu', name: 'AMD Ryzen 5 7600', sku: 'CPU-R5-7600', serial: 'SN-R5-7600-2210', cost: 7900, price: 9450, stock: 22, low: 10, brand: 'AMD', warranty: 36 },
  { id: 'P-0210', cat: 'mb', name: 'ASUS ROG Strix Z790-E', sku: 'MB-Z790E-ROG', serial: 'SN-Z790E-4451', cost: 13500, price: 16200, stock: 6, low: 4, brand: 'ASUS', warranty: 36 },
  { id: 'P-0211', cat: 'mb', name: 'MSI MAG B650 Tomahawk', sku: 'MB-B650-MAG', serial: 'SN-B650-9912', cost: 7400, price: 8990, stock: 11, low: 5, brand: 'MSI', warranty: 36 },
  { id: 'P-0410', cat: 'ram', name: 'Kingston Fury Beast 32GB DDR5-6000', sku: 'RAM-KF32-6000', serial: 'SN-KF32-6602', cost: 4200, price: 5290, stock: 24, low: 10, brand: 'Kingston', warranty: 60 },
  { id: 'P-0411', cat: 'ram', name: 'Corsair Vengeance 16GB DDR5-5600', sku: 'RAM-CV16-5600', serial: 'SN-CV16-3358', cost: 1950, price: 2490, stock: 35, low: 15, brand: 'Corsair', warranty: 60 },
  { id: 'P-0510', cat: 'ssd', name: 'Samsung 990 Pro 2TB NVMe', sku: 'SSD-990PRO-2T', serial: 'SN-S990P-7741', cost: 5300, price: 6490, stock: 2, low: 6, brand: 'Samsung', warranty: 60 },
  { id: 'P-0511', cat: 'ssd', name: 'WD Black SN850X 1TB', sku: 'SSD-SN850X-1T', serial: 'SN-WDX-2218', cost: 2800, price: 3490, stock: 14, low: 8, brand: 'WD', warranty: 60 },
  { id: 'P-0610', cat: 'psu', name: 'Corsair RM850e 850W 80+ Gold', sku: 'PSU-RM850E', serial: 'SN-CRM850-8810', cost: 3850, price: 4690, stock: 9, low: 4, brand: 'Corsair', warranty: 84 },
  { id: 'P-0710', cat: 'monitor', name: 'LG UltraGear 27GR95QE OLED 240Hz', sku: 'MON-LG27GR95', serial: 'SN-LG27-5520', cost: 28500, price: 33900, stock: 4, low: 3, brand: 'LG', warranty: 24 },
  { id: 'P-0711', cat: 'monitor', name: 'BenQ MOBIUZ EX2710S 165Hz', sku: 'MON-BQ-EX2710', serial: 'SN-BQEX-4498', cost: 6900, price: 8290, stock: 8, low: 4, brand: 'BenQ', warranty: 36 },
  { id: 'P-0810', cat: 'peripheral', name: 'Logitech G Pro X Superlight 2', sku: 'PRH-LGSL2', serial: 'SN-LGSL2-3370', cost: 4200, price: 5290, stock: 16, low: 8, brand: 'Logitech', warranty: 24 },
  { id: 'P-0811', cat: 'peripheral', name: 'Keychron Q1 Pro Wireless', sku: 'PRH-KQ1PRO', serial: 'SN-KQ1P-9921', cost: 6200, price: 7490, stock: 5, low: 3, brand: 'Keychron', warranty: 12 },
];

export const productById = (id: string): Product | undefined =>
  PRODUCTS.find((p) => p.id === id);

export const BUNDLES: Bundle[] = [
  { id: 'B-001', name: 'ชุดประกอบสายเกมเมอร์ Tier S', items: ['P-0341', 'P-0150', 'P-0210', 'P-0410', 'P-0510', 'P-0610'], cost: 110150, price: 135990, sold: 12, image: 'gaming' },
  { id: 'B-002', name: 'ชุดประกอบสายทำงาน DDR5', items: ['P-0152', 'P-0211', 'P-0411', 'P-0511', 'P-0610'], cost: 23900, price: 29900, sold: 28, image: 'work' },
  { id: 'B-003', name: 'ชุดมอนิเตอร์ + อุปกรณ์ครบเซต', items: ['P-0711', 'P-0810', 'P-0811'], cost: 17300, price: 20990, sold: 19, image: 'desk' },
];

export const TXNS: Txn[] = [
  { id: 'TXN-2410-0089', ts: '26 พ.ค. 09:42', type: 'bundle', label: 'ชุดประกอบสายเกมเมอร์ Tier S', customer: 'คุณภาณุพงษ์ ส.', staff: 'ทีม กรกฎ', amount: 135990, profit: 25840, status: 'paid' },
  { id: 'TXN-2410-0088', ts: '26 พ.ค. 09:18', type: 'item', label: 'Kingston Fury 32GB DDR5-6000 × 2', customer: 'ร้าน Aurora Café', staff: 'ทีม กรกฎ', amount: 10580, profit: 2180, status: 'paid' },
  { id: 'TXN-2410-0087', ts: '25 พ.ค. 18:21', type: 'item', label: 'Samsung 990 Pro 2TB', customer: 'คุณนภัส อ.', staff: 'ทีม ฐิติ', amount: 6490, profit: 1190, status: 'pending' },
  { id: 'TXN-2410-0086', ts: '25 พ.ค. 16:05', type: 'bundle', label: 'ชุดประกอบสายทำงาน DDR5', customer: 'บจก. นอร์ทเทิร์น ดีไซน์', staff: 'ทีม ฐิติ', amount: 29900, profit: 6000, status: 'paid' },
  { id: 'TXN-2410-0085', ts: '25 พ.ค. 14:32', type: 'item', label: 'LG UltraGear 27GR95QE', customer: 'คุณวรินทร อ.', staff: 'ทีม กรกฎ', amount: 33900, profit: 5400, status: 'paid' },
  { id: 'TXN-2410-0084', ts: '25 พ.ค. 11:14', type: 'item', label: 'AMD Ryzen 7 7800X3D', customer: 'คุณกฤษกร ป.', staff: 'ทีม ฐิติ', amount: 16900, profit: 2700, status: 'refunded' },
  { id: 'TXN-2410-0083', ts: '24 พ.ค. 19:48', type: 'item', label: 'Logitech G Pro X Superlight 2', customer: 'คุณเมธี ก.', staff: 'ทีม กรกฎ', amount: 5290, profit: 1090, status: 'paid' },
  { id: 'TXN-2410-0082', ts: '24 พ.ค. 15:30', type: 'bundle', label: 'ชุดมอนิเตอร์ + อุปกรณ์ครบเซต', customer: 'PicoLabs Studio', staff: 'ทีม กรกฎ', amount: 20990, profit: 3690, status: 'paid' },
];
