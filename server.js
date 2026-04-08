import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Resend } from "resend";

dotenv.config();

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());
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

function customerTemplate(order) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:24px;color:#222;">
    <h2 style="margin:0 0 10px;">🍕 Thank you for your order, ${escapeHtml(order.customerName)}</h2>
    <p style="font-size:15px;">We received your order successfully and it's now being processed.</p>

    <div style="background:#f8f8f8;border-radius:12px;padding:16px;margin:20px 0;">
      <p><strong>Order Number:</strong> #${escapeHtml(order.orderNumber)}</p>
      <p><strong>Order Type:</strong> ${escapeHtml(order.orderType || "Delivery")}</p>
      <p><strong>Total:</strong> ${currency(order.total)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(order.phone || "-")}</p>
      <p><strong>Address:</strong> ${escapeHtml(order.address || "Pickup")}</p>
      <p><strong>Payment:</strong> ${escapeHtml(order.paymentMethod || "Cash")}</p>
    </div>

    <h3>Order Items</h3>
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

    <p style="margin-top:24px;">If you need any help, reply to this email.</p>
    <p style="margin-top:10px;"><strong>Crustiano</strong><br/>crustiano.com</p>
  </div>
  `;
}

function adminTemplate(order) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;padding:24px;color:#222;">
    <h2 style="margin:0 0 10px;">🚨 New Order Received</h2>

    <div style="background:#fff4e5;border-radius:12px;padding:16px;margin:20px 0;border:1px solid #ffd08a;">
      <p><strong>Order Number:</strong> #${escapeHtml(order.orderNumber)}</p>
      <p><strong>Name:</strong> ${escapeHtml(order.customerName)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(order.phone || "-")}</p>
      <p><strong>Email:</strong> ${escapeHtml(order.email || "-")}</p>
      <p><strong>Type:</strong> ${escapeHtml(order.orderType || "Delivery")}</p>
      <p><strong>Address:</strong> ${escapeHtml(order.address || "Pickup")}</p>
      <p><strong>Payment:</strong> ${escapeHtml(order.paymentMethod || "Cash")}</p>
      <p><strong>Total:</strong> ${currency(order.total)}</p>
      <p><strong>Notes:</strong> ${escapeHtml(order.notes || "-")}</p>
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
    <p><strong>Time:</strong> ${new Date().toLocaleString("en-GB")}</p>
    <p><strong>Notes:</strong> ${escapeHtml(order.notes || "-")}</p>
    <hr/>
    <ul style="font-size:18px;line-height:1.8;">
      ${(order.items || []).map(item => `<li>${item.quantity || 1} × ${escapeHtml(item.name || "Item")}</li>`).join("")}
    </ul>
  </div>
  `;
}

app.get("/", (req, res) => {
  res.send("Crustiano Mail Server is running ✅");
});

app.post("/send-order-email", async (req, res) => {
  try {
    const order = req.body || {};

    if (!order.customerName || !Array.isArray(order.items) || !order.items.length) {
      return res.status(400).json({ success: false, error: "Invalid order data" });
    }

    const jobs = [];

        // 1) Admin email
    jobs.push(
      resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: [process.env.ADMIN_EMAIL],
        subject: `🚨 New Order Received #${order.orderNumber}`,
        html: adminTemplate(order),
        replyTo: "info@crustiano.com"
      })
    );

    // 2) Kitchen email
    jobs.push(
      resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: [process.env.KITCHEN_EMAIL],
        subject: `Kitchen Ticket - Order #${order.orderNumber}`,
        html: kitchenTemplate(order),
        replyTo: "info@crustiano.com"
      })
    );

    const results = await Promise.allSettled(jobs);

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

app.listen(process.env.PORT || 3000, () => {
  console.log(`Crustiano Mail Server running on http://localhost:${process.env.PORT || 3000}`);
});