import mongoose, { Schema, Document, Types } from "mongoose";

/* -------------------------------------------------------------------------- */
/* 📊 Interface da carteira do usuário                                       */
/* -------------------------------------------------------------------------- */
export interface IWallet extends Document {
  userId: Types.ObjectId;
  balance: {
    available: number;
    unAvailable: {
      amount: number;
      availableIn: Date;
      originTransactionId?: Types.ObjectId; // 🔎 origem da reserva (opcional)
      notes?: string; // 📝 motivo ou observação da retenção
    }[];
  };
  log: {
    transactionId: Types.ObjectId;
    type: "topup" | "withdraw";
    method: "card" | "pix" | "bill" | "manual";
    amount: number;
    security: {
      createdAt: Date;
      ipAddress: string;
      userAgent: string;
      approvedBy?: Types.ObjectId;
      riskFlags?: string[]; // 🛡️ flags de risco herdadas da transação
    };
  }[];
}

/* -------------------------------------------------------------------------- */
/* 🏦 Esquema da carteira – com rastreabilidade e segurança                  */
/* -------------------------------------------------------------------------- */
const WalletSchema = new Schema<IWallet>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    balance: {
      available: { type: Number, default: 0, min: 0 },
      unAvailable: [
        {
          amount: { type: Number, default: 0, min: 0 },
          availableIn: { type: Date, required: true },
          originTransactionId: { type: Schema.Types.ObjectId, ref: "Transaction" }, // 🔎 origem da retenção
          notes: { type: String, trim: true },
        },
      ],
    },

    log: [
      {
        transactionId: {
          type: Schema.Types.ObjectId,
          ref: "Transaction",
          required: true,
        },
        type: {
          type: String,
          enum: ["topup", "withdraw"],
          required: true,
        },
        method: {
          type: String,
          enum: ["card", "pix", "bill", "manual"],
          required: true,
        },
        amount: { type: Number, required: true },
        security: {
          createdAt: { type: Date, default: Date.now },
          ipAddress: { type: String, required: true },
          userAgent: { type: String, required: true },
          approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
          riskFlags: [{ type: String }], // 🛡️ salva flags associadas à operação
        },
      },
    ],
  },
  { timestamps: true, versionKey: false }
);

/* -------------------------------------------------------------------------- */
/* 📊 Índices estratégicos para performance e auditoria                      */
/* -------------------------------------------------------------------------- */
WalletSchema.index({ userId: 1 });
WalletSchema.index({ "balance.unAvailable.availableIn": 1 });
WalletSchema.index({ "log.security.createdAt": -1 });
WalletSchema.index({ "log.security.riskFlags": 1 });

export const Wallet = mongoose.model<IWallet>("Wallet", WalletSchema);
