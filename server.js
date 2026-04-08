import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Resend } from "resend";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  return `${Number(value || 0).toFixed(2)} EGP`;
}

function formatTimeDisplay(time24) {
  if (!time24) return "-";
  try {
    const [h, m] = String(time24).split(":");
    const date = new Date();
    date.setHours(Number(h || 0), Number(m || 0), 0, 0);
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return time24;
  }
}

function renderItemsTable(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return `<p style="margin:0;color:#888;">No items found.</p>`;
  }

  return `
    <table style="width:100%;border-collapse:collapse;margin-top:12px;">
      <thead>
        <tr style="background:#f7f7f7;">
          <th style="text-align:left;padding:10px;border:1px solid #e5e5e5;">Item</th>
          <th style="text-align:center;padding:10px;border:1px solid #e5e5e5;">Qty</th>
          <th style="text-align:center;padding:10px;border:1px solid #e5e5e5;">Price</th>
          <th style="text-align:center;padding:10px;border:1px solid #e5e5e5;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `
              <tr>
                <td style="padding:10px;border:1px solid #e5e5e5;">${escapeHtml(item.name || "-")}</td>
                <td style="padding:10px;border:1px solid #e5e5e5;text-align:center;">${Number(item.quantity || 0)}</td>
                <td style="padding:10px;border:1px solid #e5e5e5;text-align:center;">${money(item.price)}</td>
                <td style="padding:10px;border:1px solid #e5e5e5;text-align:center;">${money(item.total ?? (Number(item.quantity || 0) * Number(item.price || 0)))}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function orderInfoBlock(order) {
  return `
    <div style="background:#fafafa;border:1px solid #eaeaea;border-radius:14px;padding:18px;margin-bottom:20px;">
      <p><strong>Order ID:</strong> ${escapeHtml(order.orderNumber || "-")}</p>
      <p><strong>Customer Name:</strong> ${escapeHtml(order.customerName || "-")}</p>
      <p><strong>Phone:</strong> ${escapeHtml(order.phone || "-")}</p>
      <p><strong>Address:</strong> ${escapeHtml(order.address || "-")}</p>
      <p><strong>Delivery Area:</strong> ${escapeHtml(order.zoneName || "-")}</p>
      <p><strong>Order Type:</strong> ${escapeHtml(order.orderType || "-")}</p>

      ${
        order.orderType === "Scheduled Booking"
          ? `
            <p><strong>Booking Day:</strong> ${escapeHtml(order.bookingDay || "-")}</p>
            <p><strong>Delivery Date:</strong> ${escapeHtml(order.deliveryDate || "-")}</p>
            <p><strong>Delivery Time:</strong> ${escapeHtml(formatTimeDisplay(order.deliveryTime) || "-")}</p>
          `
          : `
            <p><strong>Order Time:</strong> ASAP (Instant Order)</p>
          `
      }

      <p><strong>Payment Method:</strong> ${escapeHtml(order.paymentMethod || "-")}</p>
      <p><strong>Payment Status:</strong> ${escapeHtml(order.paymentStatus || "-")}</p>
      <p><strong>Items Total:</strong> ${money(order.itemsTotal)}</p>
      <p><strong>Delivery Fee:</strong> ${money(order.deliveryFee)}</p>
      <p><strong>Final Total:</strong> <strong>${money(order.total)}</strong></p>
      <p><strong>Notes:</strong> ${escapeHtml(order.notes || "-")}</p>
      <p><strong>Time Created:</strong> ${escapeHtml(order.createdAt || "-")}</p>
      ${
        order.paymentReceiptUrl
          ? `<p><strong>Payment Receipt:</strong> <a href="${order.paymentReceiptUrl}" target="_blank">View Receipt</a></p>`
          : `<p><strong>Payment Receipt:</strong> -</p>`
      }
    </div>
  `;
}

function adminTemplate(order) {
  return `
    <div style="font-family:Arial,sans-serif;background:#ffffff;padding:30px;max-width:800px;margin:auto;color:#222;">
      <h2 style="margin:0 0 8px;">📦 New Order Received</h2>
      <p style="margin:0 0 25px;color:#666;">A new order has been placed on Crustiano.</p>

      ${orderInfoBlock(order)}

      <h3 style="margin:0 0 10px;">Order Items</h3>
      ${renderItemsTable(order.items)}

      <div style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;color:#888;font-size:13px;">
        Crustiano Orders System
      </div>
    </div>
  `;
}

function kitchenTemplate(order) {
  return `
    <div style="font-family:Arial,sans-serif;background:#ffffff;padding:30px;max-width:800px;margin:auto;color:#111;">
      <h2 style="margin:0 0 8px;">🍕 Kitchen Order Ticket</h2>
      <p style="margin:0 0 25px;color:#666;">Prepare this order as shown below.</p>

      ${orderInfoBlock(order)}

      <h3 style="margin:0 0 10px;">Items to Prepare</h3>
      ${renderItemsTable(order.items)}

      <div style="margin-top:28px;padding-top:16px;border-top:1px dashed #ccc;color:#888;font-size:13px;">
        Crustiano Kitchen Notification
      </div>
    </div>
  `;
}

app.get("/", (req, res) => {
  res.send("Crustiano Mail Server is running ✅");
});

app.post("/send-order-email", async (req, res) => {
  try {
    const order = req.body || {};

    if (!order.orderNumber || !order.customerName || !Array.isArray(order.items)) {
      return res.status(400).json({
        success: false,
        error: "Missing required order data"
      });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const kitchenEmail = process.env.KITCHEN_EMAIL;
    const fromEmail = process.env.EMAIL_FROM;

    const adminHtml = adminTemplate(order);
    const kitchenHtml = kitchenTemplate(order);

    const promises = [];

    if (adminEmail) {
      promises.push(
        resend.emails.send({
          from: fromEmail,
          to: [adminEmail],
          subject: `📦 New Order #${order.orderNumber} - ${order.customerName}`,
          html: adminHtml
        })
      );
    }

    if (kitchenEmail) {
      promises.push(
        resend.emails.send({
          from: fromEmail,
          to: [kitchenEmail],
          subject: `🍕 Kitchen Order #${order.orderNumber}`,
          html: kitchenHtml
        })
      );
    }

    const results = await Promise.allSettled(promises);

    res.json({
      success: true,
      message: "Emails processed",
      results
    });
  } catch (error) {
    console.error("Email server error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Unknown email error"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Crustiano Mail Server running on port ${PORT}`);
});