import { Router } from "express";

// 🔹 Rotas já existentes
import userRoutes from "./user.routes";
import kycRoutes from "./kyc.routes";
import paymentRoutes from "./payment.routes";

// 🔹 NOVAS ROTAS QUE VOCÊ JÁ TEM NO PROJETO
import sellerRoutes from "./seller.routes";
import transactionRoutes from "./transaction.routes";
import walletRoutes from "./wallet.routes";
import checkoutRoutes from "./checkout.routes";
import subaccountRoutes from "./subaccount.routes";
import reserveRoutes from "./reserve.routes";
import releaseRoutes from "./release.routes";
import retentionRoutes from "./retention.routes";
import productsRoutes from "./products.routes";
import cashoutRoutes from "./cashout.routes";
import volumeRoutes from "./volume.routes";
import webhookRoutes from "./webhook.routes";
import imageRoutes from "./images.routes";
import uploadRoutes from "./upload.routes";
import cryptoRoutes from "./crypto.routes";           // <- seu controller novo
import suspiciousRoutes from "./suspicious.routes";
import scoreRoutes from "./score.routes";

const router = Router();

/* -------------------------------------------------------------------------- */
/* 🧾 USUÁRIOS + LOGIN                                                        */
/* -------------------------------------------------------------------------- */
router.use("/users", userRoutes);

/* -------------------------------------------------------------------------- */
/* 👤 SELLERS                                                                 */
/* -------------------------------------------------------------------------- */
router.use("/sellers", sellerRoutes);

/* -------------------------------------------------------------------------- */
/* 🧩 KYC                                                                     */
/* -------------------------------------------------------------------------- */
router.use("/kyc", kycRoutes);

/* -------------------------------------------------------------------------- */
/* 💳 PAGAMENTOS / PIX / CARTÃO                                               */
/* -------------------------------------------------------------------------- */
router.use("/payments", paymentRoutes);

/* -------------------------------------------------------------------------- */
/* 💼 WALLET / SALDO                                                          */
/* -------------------------------------------------------------------------- */
router.use("/wallet", walletRoutes);

/* -------------------------------------------------------------------------- */
/* 🧾 TRANSAÇÕES (consulta, filtros, detalhes)                                */
/* -------------------------------------------------------------------------- */
router.use("/transactions", transactionRoutes);

/* -------------------------------------------------------------------------- */
/* 🛒 CHECKOUT                                                                 */
/* -------------------------------------------------------------------------- */
router.use("/checkout", checkoutRoutes);

/* -------------------------------------------------------------------------- */
/* 🏦 SUBACCOUNTS                                                              */
/* -------------------------------------------------------------------------- */
router.use("/subaccount", subaccountRoutes);

/* -------------------------------------------------------------------------- */
/* 🧱 RESERVA FINANCEIRA (reserve)                                            */
/* -------------------------------------------------------------------------- */
router.use("/reserve", reserveRoutes);

/* -------------------------------------------------------------------------- */
/* 🔓 RELEASE (liberação de valores)                                          */
/* -------------------------------------------------------------------------- */
router.use("/release", releaseRoutes);

/* -------------------------------------------------------------------------- */
/* 🛡 RETENÇÃO (risk/retention engine)                                        */
/* -------------------------------------------------------------------------- */
router.use("/retention", retentionRoutes);

/* -------------------------------------------------------------------------- */
/* 📦 PRODUTOS (catalogo seller)                                              */
/* -------------------------------------------------------------------------- */
router.use("/products", productsRoutes);

/* -------------------------------------------------------------------------- */
/* 💸 CASHOUT (saques)                                                        */
/* -------------------------------------------------------------------------- */
router.use("/cashout", cashoutRoutes);

/* -------------------------------------------------------------------------- */
/* 📊 VOLUME / DASHBOARD                                                      */
/* -------------------------------------------------------------------------- */
router.use("/volume", volumeRoutes);

/* -------------------------------------------------------------------------- */
/* 🪝 WEBHOOKS                                                                 */
/* -------------------------------------------------------------------------- */
router.use("/hooks", webhookRoutes);

/* -------------------------------------------------------------------------- */
/* 🖼 IMAGENS / ASSETS                                                         */
/* -------------------------------------------------------------------------- */
router.use("/images", imageRoutes);

/* -------------------------------------------------------------------------- */
/* 📤 UPLOADS                                                                  */
/* -------------------------------------------------------------------------- */
router.use("/upload", uploadRoutes);

/* -------------------------------------------------------------------------- */
/* 🪙 CRYPTO CASHOUT (SEU CONTROLLER NOVO)                                    */
/* -------------------------------------------------------------------------- */
router.use("/crypto", cryptoRoutes);

/* -------------------------------------------------------------------------- */
/* 🚨 SUSPICIOUS (fraudes)                                                    */
/* -------------------------------------------------------------------------- */
router.use("/suspicious", suspiciousRoutes);

/* -------------------------------------------------------------------------- */
/* 🧠 SCORE (risk engine score)                                               */
/* -------------------------------------------------------------------------- */
router.use("/score", scoreRoutes);

/* -------------------------------------------------------------------------- */
export default router;
