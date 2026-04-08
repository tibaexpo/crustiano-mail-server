import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Resend } from "resend";
import admin from "firebase-admin";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

/* =========================
   ENV CHECK
========================= */
const requiredEnv = [
  "RESEND_API_KEY",
  "ADMIN_EMAIL",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY"
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ Missing ENV: ${key}`);
  }
}

/* =========================
   RESEND
========================= */
const resend = new Resend(process.env.RESEND_API_KEY);

/* =========================
   FIREBASE ADMIN
========================= */
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    })
  });
}

const db = admin.firestore();

/* =========================
   HELPERS
========================= */
function money(v) {
  return `${Number(v || 0)} L.E`;
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatItemsHtml(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return `<tr><td colspan="4" style="padding:12px;border:1px solid #ddd;">No items</td></tr>`;
  }

  return items.map(item => `
    <tr>
      <td style="padding:12px;border:1px solid #ddd;">${escapeHtml(item.name || "")}</td>
      <td style="padding:12px;border:1px solid #ddd;text-align:center;">${Number(item.quantity ?? item.qty ?? 0)}</td>
      <td style="padding:12px;border:1px solid #ddd;text-align:center;">${money(item.price)}</td>
      <td style="padding:12px;border:1px solid #ddd;text-align:center;">${money(item.total ?? ((item.quantity ?? item.qty ?? 0) * Number(item.price || 0)))}</td>
    </tr>
  `).join("");
}

function formatItemsText(items = []) {
  if (!Array.isArray(items) || !items.length) return "No items";

  return items.map(item => {
    const qty = Number(item.quantity ?? item.qty ?? 0);
    const price = Number(item.price || 0);
    const total = Number(item.total ?? (qty * price));
    return `- ${item.name} × ${qty} = ${money(total)}`;
  }).join("\n");
}

function buildEmailHTML(order) {
  const isScheduled = order.orderType === "Scheduled Booking" || order.scheduleType === "scheduled";

  return `
  <div style="font-family:Arial,sans-serif;background:#f7f7f7;padding:30px;">
    <div style="max-width:800px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5;">
      <div style="background:#111315;color:#fff;padding:24px 28px;">
        <h1 style="margin:0;font-size:28px;">🍕 New Crustiano Order</h1>
        <p style="margin:8px 0 0;color:#d0d0d0;">Order ID: <strong>${escapeHtml(order.orderNumber || "")}</strong></p>
      </div>

      <div style="padding:28px;">
        <h2 style="margin-top:0;color:#222;">Customer Details</h2>
        <p><strong>Name:</strong> ${escapeHtml(order.customerName || "")}</p>
        <p><strong>Phone:</strong> ${escapeHtml(order.phone || order.customerPhone || "")}</p>
        <p><strong>Address:</strong> ${escapeHtml(order.address || order.customerAddress || "")}</p>
        ${order.zoneName ? `<p><strong>Delivery Area:</strong> ${escapeHtml(order.zoneName)}</p>` : ""}
        <p><strong>Order Type:</strong> ${escapeHtml(order.orderType || (isScheduled ? "Scheduled Booking" : "Delivery"))}</p>

        ${isScheduled ? `
          ${order.bookingDay ? `<p><strong>Booking Day:</strong> ${escapeHtml(order.bookingDay)}</p>` : ""}
          ${order.deliveryDate ? `<p><strong>Delivery Date:</strong> ${escapeHtml(order.deliveryDate)}</p>` : ""}
          ${order.deliveryTime ? `<p><strong>Delivery Time:</strong> ${escapeHtml(order.deliveryTime)}</p>` : ""}
        ` : ""}

        <hr style="margin:28px 0;border:none;border-top:1px solid #eee;" />

        <h2 style="color:#222;">Payment Info</h2>
        <p><strong>Method:</strong> ${escapeHtml(order.paymentMethod || "")}</p>
        <p><strong>Status:</strong> ${escapeHtml(order.paymentStatus || "")}</p>
        ${order.paymentReceiptUrl ? `
          <p>
            <strong>Receipt:</strong>
            <a href="${order.paymentReceiptUrl}" target="_blank">View Screenshot</a>
          </p>
        ` : ""}

        <hr style="margin:28px 0;border:none;border-top:1px solid #eee;" />

        <h2 style="color:#222;">Order Items</h2>
        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          <thead>
            <tr style="background:#fafafa;">
              <th style="padding:12px;border:1px solid #ddd;text-align:left;">Item</th>
              <th style="padding:12px;border:1px solid #ddd;">Qty</th>
              <th style="padding:12px;border:1px solid #ddd;">Price</th>
              <th style="padding:12px;border:1px solid #ddd;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${formatItemsHtml(order.items)}
          </tbody>
        </table>

        <div style="margin-top:24px;padding:18px;background:#fafafa;border-radius:12px;border:1px solid #eee;">
          <p style="margin:0 0 8px;"><strong>Items Total:</strong> ${money(order.itemsTotal)}</p>
          <p style="margin:0 0 8px;"><strong>Delivery Fee:</strong> ${money(order.deliveryFee)}</p>
          <p style="margin:0;font-size:18px;"><strong>Final Total:</strong> ${money(order.total)}</p>
        </div>

        ${order.notes ? `
          <div style="margin-top:24px;padding:18px;background:#fff8f1;border-radius:12px;border:1px solid #f2d8b3;">
            <strong>Customer Notes:</strong><br>
            ${escapeHtml(order.notes)}
          </div>
        ` : ""}

        <div style="margin-top:30px;color:#777;font-size:13px;">
          Created At: ${escapeHtml(order.createdAt || new Date().toLocaleString("en-GB"))}
        </div>
      </div>
    </div>
  </div>
  `;
}

function buildEmailText(order) {
  const isScheduled = order.orderType === "Scheduled Booking" || order.scheduleType === "scheduled";

  return `
New Crustiano Order
Order ID: ${order.orderNumber || ""}

Customer Details
----------------
Name: ${order.customerName || ""}
Phone: ${order.phone || order.customerPhone || ""}
Address: ${order.address || order.customerAddress || ""}
${order.zoneName ? `Delivery Area: ${order.zoneName}` : ""}
Order Type: ${order.orderType || (isScheduled ? "Scheduled Booking" : "Delivery")}

${isScheduled ? `
${order.bookingDay ? `Booking Day: ${order.bookingDay}` : ""}
${order.deliveryDate ? `Delivery Date: ${order.deliveryDate}` : ""}
${order.deliveryTime ? `Delivery Time: ${order.deliveryTime}` : ""}
` : ""}

Payment
-------
Method: ${order.paymentMethod || ""}
Status: ${order.paymentStatus || ""}
${order.paymentReceiptUrl ? `Receipt: ${order.paymentReceiptUrl}` : ""}

Items
-----
${formatItemsText(order.items)}

Totals
------
Items Total: ${money(order.itemsTotal)}
Delivery Fee: ${money(order.deliveryFee)}
Final Total: ${money(order.total)}

${order.notes ? `Customer Notes: ${order.notes}` : ""}

Created At: ${order.createdAt || new Date().toLocaleString("en-GB")}
  `.trim();
}

async function markEmailStatus(orderId, updates = {}) {
  if (!orderId) return;
  await db.collection("orders").doc(orderId).update(updates);
}

async function sendOrderEmail(order) {
  const subject = `🍕 New Order - ${order.customerName || "Customer"} - ${order.orderNumber || ""}`;

  const html = buildEmailHTML(order);
  const text = buildEmailText(order);

  const result = await resend.emails.send({
    from: "Crustiano Orders <orders@crustiano.com>",
    to: [process.env.ADMIN_EMAIL],
    subject,
    html,
    text
  });

  return result;
}

function mapFirestoreOrderToEmailPayload(docId, data = {}) {
  return {
    orderNumber: docId,
    customerName: data.customerName || "",
    phone: data.customerPhone || "",
    customerPhone: data.customerPhone || "",
    address: data.customerAddress || "",
    customerAddress: data.customerAddress || "",
    zoneName: data.zoneName || "",
    orderType: data.scheduleType === "scheduled" ? "Scheduled Booking" : "Delivery",
    bookingDay: data.bookingDay || "",
    deliveryDate: data.deliveryDate || "",
    deliveryTime: data.deliveryTime || "",
    paymentMethod: data.paymentMethod || "",
    paymentStatus: data.paymentStatus || "",
    paymentReceiptUrl: data.paymentReceiptUrl || "",
    notes: data.customerNotes || "",
    itemsTotal: Number(data.itemsTotal || 0),
    deliveryFee: Number(data.deliveryFee || 0),
    total: Number(data.total || 0),
    createdAt: data.createdAt?.toDate
      ? data.createdAt.toDate().toLocaleString("en-GB")
      : new Date().toLocaleString("en-GB"),
    items: Array.isArray(data.items)
      ? data.items.map(item => ({
          name: item.name || "",
          quantity: Number(item.qty || item.quantity || 0),
          price: Number(item.price || 0),
          total: Number((item.qty || item.quantity || 0) * Number(item.price || 0))
        }))
      : [],
    scheduleType: data.scheduleType || "now"
  };
}

/* =========================
   HEALTH
========================= */
app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Crustiano Mail Server",
    status: "running",
    time: new Date().toISOString()
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/* =========================
   MANUAL EMAIL ENDPOINT
========================= */
app.post("/send-order-email", async (req, res) => {
  try {
    const body = req.body || {};

    if (!body.customerName || !Array.isArray(body.items) || !body.items.length) {
      return res.status(400).json({
        success: false,
        error: "Invalid order payload"
      });
    }

    const result = await sendOrderEmail(body);

    return res.json({
      success: true,
      message: "Email sent successfully",
      result
    });
  } catch (error) {
    console.error("❌ /send-order-email error:", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Email sending failed"
    });
  }
});

/* =========================
   PROCESS PENDING ORDERS
========================= */
app.get("/process-pending-orders", async (req, res) => {
  console.log("🔄 Processing pending orders...");

  try {
    const snapshot = await db
      .collection("orders")
      .where("emailSent", "==", false)
      .limit(20)
      .get();

    if (snapshot.empty) {
      return res.json({
        success: true,
        processed: 0,
        sent: 0,
        failed: 0,
        message: "No pending orders found"
      });
    }

    let processed = 0;
    let sent = 0;
    let failed = 0;

    for (const docSnap of snapshot.docs) {
      const orderId = docSnap.id;
      const data = docSnap.data() || {};

      processed += 1;

      try {
        console.log(`📦 Processing order: ${orderId}`);

        await markEmailStatus(orderId, {
          emailStatus: "Processing",
          emailLastAttemptAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const emailPayload = mapFirestoreOrderToEmailPayload(orderId, data);

        const result = await sendOrderEmail(emailPayload);

        await markEmailStatus(orderId, {
          emailSent: true,
          emailStatus: "Sent",
          emailError: "",
          emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
          emailProviderId: result?.data?.id || result?.id || "",
          emailRetryCount: Number(data.emailRetryCount || 0) + 1
        });

        sent += 1;
        console.log(`✅ Email sent for order: ${orderId}`);
      } catch (err) {
        failed += 1;
        console.error(`❌ Email failed for order ${orderId}:`, err?.message || err);

        await markEmailStatus(orderId, {
          emailSent: false,
          emailStatus: "Failed",
          emailError: err?.message || "Unknown error",
          emailRetryCount: Number(data.emailRetryCount || 0) + 1,
          emailLastAttemptAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    return res.json({
      success: true,
      processed,
      sent,
      failed
    });
  } catch (error) {
    console.error("❌ process-pending-orders fatal error:", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to process pending orders"
    });
  }
});

/* =========================
   RETRY FAILED ORDERS
========================= */
app.get("/retry-failed-orders", async (req, res) => {
  console.log("🔁 Retrying failed orders...");

  try {
    const snapshot = await db
      .collection("orders")
      .where("emailStatus", "==", "Failed")
      .limit(20)
      .get();

    if (snapshot.empty) {
      return res.json({
        success: true,
        processed: 0,
        sent: 0,
        failed: 0,
        message: "No failed orders found"
      });
    }

    let processed = 0;
    let sent = 0;
    let failed = 0;

    for (const docSnap of snapshot.docs) {
      const orderId = docSnap.id;
      const data = docSnap.data() || {};

      processed += 1;

      try {
        console.log(`📦 Retrying order: ${orderId}`);

        await markEmailStatus(orderId, {
          emailStatus: "Retrying",
          emailLastAttemptAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const emailPayload = mapFirestoreOrderToEmailPayload(orderId, data);

        const result = await sendOrderEmail(emailPayload);

        await markEmailStatus(orderId, {
          emailSent: true,
          emailStatus: "Sent",
          emailError: "",
          emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
          emailProviderId: result?.data?.id || result?.id || "",
          emailRetryCount: Number(data.emailRetryCount || 0) + 1
        });

        sent += 1;
        console.log(`✅ Retry success for order: ${orderId}`);
      } catch (err) {
        failed += 1;
        console.error(`❌ Retry failed for order ${orderId}:`, err?.message || err);

        await markEmailStatus(orderId, {
          emailSent: false,
          emailStatus: "Failed",
          emailError: err?.message || "Unknown error",
          emailRetryCount: Number(data.emailRetryCount || 0) + 1,
          emailLastAttemptAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    return res.json({
      success: true,
      processed,
      sent,
      failed
    });
  } catch (error) {
    console.error("❌ retry-failed-orders fatal error:", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to retry failed orders"
    });
  }
});

/* =========================
   FORCE SINGLE ORDER EMAIL
========================= */
app.get("/force-send-order/:id", async (req, res) => {
  const orderId = req.params.id;

  try {
    const docSnap = await db.collection("orders").doc(orderId).get();

    if (!docSnap.exists) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    const data = docSnap.data() || {};
    const emailPayload = mapFirestoreOrderToEmailPayload(orderId, data);

    const result = await sendOrderEmail(emailPayload);

    await markEmailStatus(orderId, {
      emailSent: true,
      emailStatus: "Sent",
      emailError: "",
      emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      emailProviderId: result?.data?.id || result?.id || "",
      emailRetryCount: Number(data.emailRetryCount || 0) + 1,
      emailLastAttemptAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({
      success: true,
      message: `Order ${orderId} email sent`,
      result
    });
  } catch (error) {
    console.error("❌ force-send-order error:", error);

    await markEmailStatus(orderId, {
      emailSent: false,
      emailStatus: "Failed",
      emailError: error?.message || "Unknown error",
      emailRetryCount: admin.firestore.FieldValue.increment(1),
      emailLastAttemptAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to force send order email"
    });
  }
});

/* =========================
   START
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Crustiano mail server running on port ${PORT}`);
});