const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS }
  });

const text = (body, status = 200, type = "text/plain; charset=utf-8") =>
  new Response(body, { status, headers: { "Content-Type": type, ...CORS_HEADERS } });

const num = v => Number(v) || 0;
const str = v => String(v ?? "").trim();
const rowId = () => crypto.randomUUID();
const csv = v => `"${String(v ?? "").replace(/"/g, '""')}"`;

function normalizePayload(data) {
  const slip = data.slip || {};
  const receipt = data.receipt || {};
  const vehicle = data.vehicle || slip.vehicle || {};
  const items = data.items || slip.items || [];

  const soPhieu = str(data.so_phieu || receipt.so_phieu || slip.so_phieu || data.receipt_no);
  if (!soPhieu) throw new Error("Thiếu số phiếu");

  return {
    id: soPhieu,
    so_phieu: soPhieu,
    ngay: str(data.ngay || receipt.ngay || slip.date),
    so_xe: str(data.so_xe || receipt.so_xe || vehicle.plate),
    tai_xe: str(data.tai_xe || receipt.tai_xe || vehicle.driver),
    sdt: str(data.sdt || receipt.sdt || vehicle.phone),
    cuoc_xe: num(data.cuoc_xe || receipt.cuoc_xe || vehicle.freight),
    tong_hang: num(data.tong_hang || receipt.tong_hang),
    tong_gom_cuoc: num(data.tong_gom_cuoc || receipt.tong_gom_cuoc),
    items,
    device_id: str(data.device_id),
    app_version: str(data.app_version || "d1-full-data-v3"),
    full_json: JSON.stringify(data)
  };
}

function normalizeItem(item) {
  return {
    chu_hang: str(item.chu_hang || item.owner),
    loai_hang: str(item.loai_hang || item.product),
    loai_bao: str(item.loai_bao || item.bag),
    so_bao: num(item.so_bao || item.bagCount),
    trong_luong_kg: num(item.trong_luong_kg || item.kg),
    tap_chat: num(item.tap_chat || item.impurity),
    don_gia: num(item.don_gia || item.price),
    thanh_tien: num(item.thanh_tien)
  };
}

async function submitReceipt(env, data) {
  const r = normalizePayload(data);
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT OR REPLACE INTO receipts (
      id, so_phieu, ngay, so_xe, tai_xe, sdt,
      cuoc_xe, tong_hang, tong_gom_cuoc,
      created_at, updated_at, full_json, device_id, app_version
    )
    VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      COALESCE((SELECT created_at FROM receipts WHERE id = ?), ?),
      ?, ?, ?, ?
    )
  `).bind(
    r.id, r.so_phieu, r.ngay, r.so_xe, r.tai_xe, r.sdt,
    r.cuoc_xe, r.tong_hang, r.tong_gom_cuoc,
    r.id, now,
    now, r.full_json, r.device_id, r.app_version
  ).run();

  await env.DB.prepare(`DELETE FROM receipt_items WHERE receipt_id = ?`).bind(r.id).run();

  for (const raw of r.items) {
    const item = normalizeItem(raw);
    await env.DB.prepare(`
      INSERT INTO receipt_items (
        id, receipt_id, chu_hang, loai_hang, loai_bao,
        so_bao, trong_luong_kg, tap_chat, don_gia, thanh_tien
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      rowId(), r.id,
      item.chu_hang, item.loai_hang, item.loai_bao,
      item.so_bao, item.trong_luong_kg, item.tap_chat,
      item.don_gia, item.thanh_tien
    ).run();
  }

  return { success: true, id: r.id, items: r.items.length };
}

async function listReceipts(env) {
  return env.DB.prepare(`
    SELECT r.*, COUNT(i.id) AS so_dong_hang
    FROM receipts r
    LEFT JOIN receipt_items i ON i.receipt_id = r.id
    GROUP BY r.id
    ORDER BY r.created_at DESC
    LIMIT 100
  `).all();
}

async function receiptDetail(env, url) {
  const id = url.searchParams.get("id");
  if (!id) throw new Error("Thiếu id");

  const receipt = await env.DB.prepare(`SELECT * FROM receipts WHERE id = ?`).bind(id).first();
  const items = await env.DB.prepare(`SELECT * FROM receipt_items WHERE receipt_id = ?`).bind(id).all();
  return { receipt, items: items.results };
}

async function exportCsv(env) {
  const result = await env.DB.prepare(`
    SELECT
      r.created_at, r.updated_at, r.device_id, r.app_version,
      r.so_phieu, r.ngay, r.so_xe, r.tai_xe, r.sdt,
      r.cuoc_xe, r.tong_hang, r.tong_gom_cuoc,
      i.chu_hang, i.loai_hang, i.loai_bao, i.so_bao,
      i.trong_luong_kg, i.tap_chat, i.don_gia, i.thanh_tien
    FROM receipts r
    LEFT JOIN receipt_items i ON i.receipt_id = r.id
    ORDER BY r.created_at DESC, r.so_phieu ASC
  `).all();

  const headers = [
    "created_at", "updated_at", "device_id", "app_version", "so_phieu", "ngay",
    "so_xe", "tai_xe", "sdt", "cuoc_xe", "tong_hang", "tong_gom_cuoc",
    "chu_hang", "loai_hang", "loai_bao", "so_bao", "trong_luong_kg",
    "tap_chat", "don_gia", "thanh_tien"
  ];

  const delimiter = ";";
  const lines = ["sep=;", headers.join(delimiter)];
  for (const item of result.results) {
    lines.push(headers.map(key => csv(item[key])).join(delimiter));
  }

  return new Response("\ufeff" + lines.join("\r\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=receiptkl-export.csv",
      ...CORS_HEADERS
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      if (url.pathname === "/health") {
        return json({ status: "ok", app: "receiptkl-api", version: "full-cloud-v3" });
      }
      if (url.pathname === "/submit" && request.method === "POST") {
        return json(await submitReceipt(env, await request.json()));
      }
      if (url.pathname === "/receipts" && request.method === "GET") {
        return json((await listReceipts(env)).results);
      }
      if (url.pathname === "/receipt" && request.method === "GET") {
        return json(await receiptDetail(env, url));
      }
      if (url.pathname === "/export.csv" && request.method === "GET") {
        return exportCsv(env);
      }
      return text("Not Found", 404);
    } catch (error) {
      return json({ success: false, error: error.message }, 400);
    }
  }
};
