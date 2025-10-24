"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateIdFromName = generateIdFromName;
exports.PostToUtmify = PostToUtmify;
exports.PaiedSendIntegrations = PaiedSendIntegrations;
exports.GenerateSendIntegrations = GenerateSendIntegrations;
const crypto_1 = require("crypto");
/* ------------------ 🧠 Utilitário para gerar ID de produto ------------------ */
function generateIdFromName(name) {
    return (0, crypto_1.createHash)("sha256").update(name).digest("hex").slice(0, 16);
}
/* ------------------ 📡 Envio para a API da Utmify ------------------ */
async function PostToUtmify(token, payload) {
    await fetch("https://api.utmify.com.br/api-credentials/orders", {
        headers: {
            "x-api-token": token,
            "Content-type": "application/json",
        },
        method: "POST",
        body: JSON.stringify(payload),
    });
}
/* ------------------ ✅ Envio quando o pagamento é aprovado ------------------ */
async function PaiedSendIntegrations(user, transaction) {
    // Pushcut Notification
    if (user.token?.pushcut?.notificationUrl) {
        await fetch(user.token.pushcut.notificationUrl, {
            method: "POST",
            headers: { "Content-type": "application/json" },
            body: JSON.stringify({
                text: `Pagamento de R$ ${transaction.amount?.toFixed(2) || "0.00"} foi pago em nosso checkout!`,
                title: `AgillePay - PIX Pago`,
            }),
        });
    }
    // Webhook Paid
    if (user.token?.webhook?.paidUrl) {
        await fetch(user.token.webhook.paidUrl, {
            method: "POST",
            headers: {
                "Content-type": "application/json",
                "secret-key": user.token.secret || "",
            },
            body: JSON.stringify({
                idTransaction: transaction._id?.toString() || "",
                status: transaction.status,
                amount: transaction.amount || 0,
                products: transaction.purchaseData?.products || [],
                customer: transaction.purchaseData?.customer || {},
                tracking: transaction.trackingParameters || {},
            }),
        });
    }
    // Utmify
    if (user.token?.utmify?.apiKey && transaction.purchaseData) {
        const products = transaction.purchaseData.products?.map((pt) => ({
            id: generateIdFromName(pt.name || "produto"),
            name: pt.name || "Produto",
            planId: null,
            planName: null,
            quantity: 1,
            priceInCents: Math.round((pt.price || 0) * 100),
        })) || [];
        const customerData = transaction.purchaseData.customer || {};
        PostToUtmify(user.token.utmify.apiKey, {
            isTest: false,
            orderId: transaction._id?.toString() || "",
            platform: "AgillePay",
            createdAt: transaction.createdAt ? transaction.createdAt.toDateString() : new Date().toDateString(),
            approvedDate: null,
            refundedAt: null,
            customer: {
                name: customerData.name || "",
                email: customerData.email || "",
                phone: customerData.phone || "",
                document: customerData.document || "",
                country: "BR",
                ip: customerData.ip || "",
            },
            products,
            commission: {
                totalPriceInCents: Math.round((transaction.amount || 0) * 100),
                gatewayFeeInCents: Math.round((transaction.fee || 0) * 100),
                userCommissionInCents: Math.round((transaction.amount || 0) * 100) - Math.round((transaction.fee || 0) * 100),
            },
            paymentMethod: "pix",
            status: "approved",
            trackingParameters: {
                sck: null,
                src: null,
                utm_campaign: transaction.trackingParameters?.utm_campaign || null,
                utm_content: transaction.trackingParameters?.utm_content || null,
                utm_medium: transaction.trackingParameters?.utm_medium || null,
                utm_source: transaction.trackingParameters?.utm_source || null,
                utm_term: transaction.trackingParameters?.utm_term || null,
            },
        });
    }
}
/* ------------------ 🪄 Envio quando o pagamento é GERADO ------------------ */
async function GenerateSendIntegrations(user, transaction) {
    if (user.token?.pushcut?.notificationUrl) {
        await fetch(user.token.pushcut.notificationUrl, {
            method: "POST",
            headers: { "Content-type": "application/json" },
            body: JSON.stringify({
                text: `Pagamento de R$ ${transaction.amount?.toFixed(2) || "0.00"} foi gerado no nosso checkout!`,
                title: `AgillePay - PIX Gerado`,
            }),
        });
    }
    if (user.token?.webhook?.generatedUrl) {
        await fetch(user.token.webhook.generatedUrl, {
            method: "POST",
            headers: {
                "Content-type": "application/json",
                "secret-key": user.token.secret || "",
            },
            body: JSON.stringify({
                idTransaction: transaction._id?.toString() || "",
                status: transaction.status,
                amount: transaction.amount || 0,
                products: transaction.purchaseData?.products || [],
                customer: transaction.purchaseData?.customer || {},
                tracking: transaction.trackingParameters || {},
            }),
        });
    }
    if (user.token?.utmify?.apiKey && transaction.purchaseData) {
        const products = transaction.purchaseData.products?.map((pt) => ({
            id: generateIdFromName(pt.name || "produto"),
            name: pt.name || "Produto",
            planId: null,
            planName: null,
            quantity: 1,
            priceInCents: Math.round((pt.price || 0) * 100),
        })) || [];
        const customerData = transaction.purchaseData.customer || {};
        PostToUtmify(user.token.utmify.apiKey, {
            isTest: false,
            orderId: transaction._id?.toString() || "",
            platform: "AgillePay",
            createdAt: transaction.createdAt ? transaction.createdAt.toDateString() : new Date().toDateString(),
            approvedDate: null,
            refundedAt: null,
            customer: {
                name: customerData.name || "",
                email: customerData.email || "",
                phone: customerData.phone || "",
                document: customerData.document || "",
                country: "BR",
                ip: customerData.ip || "",
            },
            products,
            commission: {
                totalPriceInCents: Math.round((transaction.amount || 0) * 100),
                gatewayFeeInCents: Math.round((transaction.fee || 0) * 100),
                userCommissionInCents: Math.round((transaction.amount || 0) * 100) - Math.round((transaction.fee || 0) * 100),
            },
            paymentMethod: "pix",
            status: "waiting_payment",
            trackingParameters: {
                sck: null,
                src: null,
                utm_campaign: transaction.trackingParameters?.utm_campaign || null,
                utm_content: transaction.trackingParameters?.utm_content || null,
                utm_medium: transaction.trackingParameters?.utm_medium || null,
                utm_source: transaction.trackingParameters?.utm_source || null,
                utm_term: transaction.trackingParameters?.utm_term || null,
            },
        });
    }
}
