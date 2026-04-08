import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Resend } from "resend";

dotenv.config();

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

// ====== CORS: اسمح لموقعك الحقيقي فقط + localhost للاختبار ======
const allowedOrigins = [
  "https://crustiano.com",
  "https://www.crustiano.com",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost:3000"
];

app.use(cors({
  origin(origin, callback) {
    // اسمح للطلبات بدون origin (بعض الأدوات/الاختبارات)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  }
}));

app.use(express.json({ limit: "2mb" }));

function currency(v) {
  return `${Number(v || 0).toFixed(2)} EGP`;
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderItems(items = []) {
  return items.map(item => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(item.name || "Item")}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity || 1}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${currency(item.price || 0)}</td>
    </tr>
  `).join("");
}

function adminTemplate(order) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:760px;margin:auto;padding:24px;color:#222;">
    <h2 style="margin:0 0 10px;">🚨 New Order Received</h2>

    <div style="background:#fff4e5;border-radius:12px;padding:16px;margin:20px 0;border:1px solid #ffd08a;">
      <p><strong>Order Number:</strong> #${escapeHtml(order.orderNumber)}</p>
      <p><strong>Customer Name:</strong> ${escapeHtml(order.customerName)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(order.phone || "-")}</p>
      <p><strong>Address:</strong> ${escapeHtml(order.address || "Pickup")}</p>
      <p><strong>Delivery Area:</strong> ${escapeHtml(order.zoneName || "-")}</p>
      <p><strong>Order Type:</strong> ${escapeHtml(order.orderType || "Delivery")}</p>
      <p><strong>Booking Day:</strong> ${escapeHtml(order.bookingDay || "-")}</p>
      <p><strong>Delivery Date:</strong> ${escapeHtml(order.deliveryDate || "-")}</p>
      <p><strong>Delivery Time:</strong> ${escapeHtml(order.deliveryTime || "-")}</p>
      <p><strong>Payment Method:</strong> ${escapeHtml(order.paymentMethod || "Cash")}</p>
      <p><strong>Payment Status:</strong> ${escapeHtml(order.paymentStatus || "Unpaid")}</p>
      <p><strong>Total:</strong> ${currency(order.total)}</p>
      <p><strong>Items Total:</strong> ${currency(order.itemsTotal)}</p>
      <p><strong>Delivery Fee:</strong> ${currency(order.deliveryFee)}</p>
      <p><strong>Notes:</strong> ${escapeHtml(order.notes || "-")}</p>
      <p><strong>Source:</strong> ${escapeHtml(order.source || "website")}</p>
      <p><strong>Time:</strong> ${escapeHtml(order.createdAtText || "-")}</p>
      <p><strong>Receipt:</strong> ${
        order.paymentReceiptUrl
          ? `<a href="${escapeHtml(order.paymentReceiptUrl)}" target="_blank" rel="noopener noreferrer">Open Receipt</a>`
          : "No receipt uploaded"
      }</p>
    </div>

    <h3>Items</h3>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Item</th>
          <th style="text-align:center;padding:8px;border-bottom:2px solid #ddd;">Qty</th>
          <th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${renderItems(order.items)}
      </tbody>
    </table>
  </div>
  `;
}

function kitchenTemplate(order) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:24px;color:#111;">
    <h2 style="margin:0 0 10px;">Kitchen Ticket</h2>
    <p><strong>Order #${escapeHtml(order.orderNumber)}</strong></p>
    <p><strong>Type:</strong> ${escapeHtml(order.orderType || "Delivery")}</p>
    <p><strong>Area:</strong> ${escapeHtml(order.zoneName || "-")}</p>
    <p><strong>Day:</strong> ${escapeHtml(order.bookingDay || "-")}</p>
    <p><strong>Date:</strong> ${escapeHtml(order.deliveryDate || "-")}</p>
    <p><strong>Time:</strong> ${escapeHtml(order.deliveryTime || "-")}</p>
    <p><strong>Payment:</strong> ${escapeHtml(order.paymentMethod || "Cash")} — ${escapeHtml(order.paymentStatus || "Unpaid")}</p>
    <p><strong>Time Created:</strong> ${escapeHtml(order.createdAtText || "-")}</p>
    <p><strong>Notes:</strong> ${escapeHtml(order.notes || "-")}</p>
    <hr/>
    <ul style="font-size:18px;line-height:1.8;">
      ${(order.items || []).map(item => `<li>${item.quantity || 1} × ${escapeHtml(item.name || "Item")}</li>`).join("")}
    </ul>
    <hr/>
    <p><strong>Total:</strong> ${currency(order.total)}</p>
  </div>
  `;
}

// Health check
app.get("/", (req, res) => {
  res.send("Crustiano Mail Server is running ✅");
});

app.post("/send-order-email", async (req, res) => {
  try {
    const order = req.body || {};

    if (!order.customerName || !Array.isArray(order.items) || !order.items.length || !order.orderNumber) {
      return res.status(400).json({ success: false, error: "Invalid order data" });
    }

    const createdAtText = new Date().toLocaleString("en-GB", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });

    const normalizedOrder = {
      ...order,
      createdAtText
    };

    const jobs = [];

    // ===== 1) Admin email =====
    jobs.push(
      resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: [process.env.ADMIN_EMAIL],
        subject: `🚨 New Order Received #${normalizedOrder.orderNumber}`,
        html: adminTemplate(normalizedOrder),
        replyTo: "info@crustiano.com",
        headers: {
          "Idempotency-Key": `order-${normalizedOrder.orderNumber}-admin`
        }
      })
    );

    // ===== 2) Kitchen email =====
    jobs.push(
      resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: [process.env.KITCHEN_EMAIL],
        subject: `Kitchen Ticket - Order #${normalizedOrder.orderNumber}`,
        html: kitchenTemplate(normalizedOrder),
        replyTo: "info@crustiano.com",
        headers: {
          "Idempotency-Key": `order-${normalizedOrder.orderNumber}-kitchen`
        }
      })
    );

    const results = await Promise.allSettled(jobs);

    console.log("==== EMAIL SEND RESULTS ====");
    console.log(JSON.stringify({
      orderNumber: normalizedOrder.orderNumber,
      customerName: normalizedOrder.customerName,
      adminEmail: process.env.ADMIN_EMAIL,
      kitchenEmail: process.env.KITCHEN_EMAIL,
      results
    }, null, 2));

    return res.json({
      success: true,
      message: "Emails processed",
      results
    });
  } catch (error) {
    console.error("SEND EMAIL ERROR:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to send emails"
    });
  }
});

app.listen(process.env.PORT || 10000, () => {
  console.log(`Crustiano Mail Server running on port ${process.env.PORT || 10000}`);
});