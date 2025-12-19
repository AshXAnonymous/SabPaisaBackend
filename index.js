import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ================= SUPABASE =================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ================= HEALTH CHECK =================
app.get("/", (req, res) => {
  res.json({ status: "Backend running 🚀" });
});

// =====================================================
// CREATE ORDER
// =====================================================
app.post("/api/orders/create", async (req, res) => {
  try {
    const { userId, totalAmount, paymentMethod } = req.body;

    if (!userId || !totalAmount) {
      return res.status(400).json({ success: false });
    }

    const { data: order, error } = await supabase
      .from("orders")
      .insert([
        {
          user_id: userId,
          total_amount: totalAmount,
          payment_method: paymentMethod,
          status: "pending"
        }
      ])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, orderId: order.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// =====================================================
// SABPAISA PAYMENT INIT
// =====================================================
app.post("/api/payment/init", async (req, res) => {
  try {
    const { orderId, amount, payerName, payerEmail, payerMobile } = req.body;

    const clientTxnId = `ORD_${orderId}`;

    const checksumPayload = `${process.env.SABPAISA_CLIENT_CODE}|${clientTxnId}|${amount}`;
    const checksum = crypto
      .createHmac("sha256", process.env.SABPAISA_AUTH_KEY)
      .update(checksumPayload)
      .digest("hex");

    const paymentUrl =
      `https://stage-secure.sabpaisa.in/SabPaisa/sabPaisaInit?v=1` +
      `&clientCode=${process.env.SABPAISA_CLIENT_CODE}` +
      `&transUserName=${process.env.SABPAISA_USERNAME}` +
      `&transUserPassword=${process.env.SABPAISA_PASSWORD}` +
      `&clientTxnId=${clientTxnId}` +
      `&amount=${amount}` +
      `&payerName=${encodeURIComponent(payerName)}` +
      `&payerEmail=${encodeURIComponent(payerEmail)}` +
      `&payerMobile=${payerMobile}` +
      `&callbackUrl=${process.env.SABPAISA_CALLBACK_URL}` +
      `&checksum=${checksum}`;

    await supabase
      .from("orders")
      .update({ payment_txn_id: clientTxnId })
      .eq("id", orderId);

    res.json({ success: true, paymentUrl });
  } catch (err) {
    console.error("PAYMENT INIT ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// =====================================================
// SABPAISA CALLBACK
// =====================================================
app.post("/api/payment/callback", async (req, res) => {
  const { clientTxnId, status } = req.body;

  if (status === "SUCCESS") {
    await supabase
      .from("orders")
      .update({ status: "paid" })
      .eq("payment_txn_id", clientTxnId);
  }

  res.send("OK");
});

// ================= START =================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
