import mongoose, { Schema, Document } from "mongoose";

/* 📱 Botão WhatsApp */
export interface IWhatsAppButton {
  status: boolean;
  number: string;
}

/* ⏱️ Contador regressivo */
export interface ICountdownTimer {
  status: boolean;
  title: string;
  time: number;
}

/* ➕ Order Bump */
export interface IOrderBump {
  status: boolean;
  productId: string;
}

/* ⭐ Depoimentos */
export interface IReview {
  photo: string;
  name: string;
  stars: number;
  description: string;
}

export interface ITestimonials {
  status: boolean;
  reviews: IReview[];
}

/* ⚙️ Configurações do Checkout */
export interface ICheckoutConfig {
  logoUrl: string;
  bannerUrl: string;
  redirectUrl: string;
  validateDocument: boolean;
  needAddress: boolean;
  bodyCode: string;
  headCode: string;
}

/* 💳 Métodos de Pagamento */
export interface ICheckoutPayment {
  creditCard: { enabled: boolean; discount: number };
  pix: { enabled: boolean; discount: number };
  boleto: { enabled: boolean; expirationDays: number; discount: number };
}

/* 📦 Interface principal do Checkout */
export interface ICheckout extends Document {
  userId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  /** Código curto pra URL pública (pyxgate.com/#/p/<slug>) — só presente em checkouts criados após 2026-08-06. */
  slug?: string;
  /**
   * "absorb" (padrão): comprador sempre paga o preço cheio do produto,
   * independente do parcelamento — o vendedor recebe menos conforme a taxa
   * da parcela escolhida sobe (comportamento histórico do sistema).
   * "passOn": o valor cobrado do comprador aumenta conforme o parcelamento,
   * pra o vendedor sempre receber o valor cheio do produto.
   */
  feeMode: "absorb" | "passOn";
  /** Se true, o comprador escolhe quantas unidades quer levar (preço multiplicado). Opcional, default false. */
  allowQuantity: boolean;
  maxQuantity: number;
  settings: ICheckoutConfig;
  paymentMethods: ICheckoutPayment;
  whatsappButton: IWhatsAppButton;
  countdownTimer: ICountdownTimer;
  orderBump: IOrderBump;
  testimonials: ITestimonials;
  background: "white" | "dark";
  colors: "#00D084" | "#8B5CF6" | "#1A1A1A" | "#2196F3" | "#4CAF50" | "#FF9800" | "#E91E63";
  status: boolean;
  createdAt: Date;
}

const CheckoutSchema = new Schema<ICheckout>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
      immutable: true, // ✅ evita alteração após criação
    },

    productId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Product",
      immutable: true,
    },

    slug: {
      type: String,
      unique: true,
      sparse: true, // checkouts antigos não têm slug — sparse evita colisão em null
      index: true,
    },

    feeMode: {
      type: String,
      enum: ["absorb", "passOn"],
      default: "absorb",
    },

    allowQuantity: { type: Boolean, default: false },
    maxQuantity: { type: Number, default: 10, min: 1, max: 999 },

    settings: {
      // Vazio = frontend mostra a marca padrão da PYX Gate em vez de <img> quebrada.
      logoUrl: { type: String, default: "" },
      bannerUrl: { type: String, default: "" },
      redirectUrl: { type: String, default: "/" },
      validateDocument: { type: Boolean, default: false },
      needAddress: { type: Boolean, default: false },
      // Scripts de tracking opcionais — não há motivo real pra exigir, é só
      // conveniência de quem quiser instalar pixel/analytics no checkout.
      bodyCode: { type: String, default: "", trim: true },
      headCode: { type: String, default: "", trim: true },
    },

    paymentMethods: {
      creditCard: {
        enabled: { type: Boolean, default: true },
        discount: { type: Number, default: 0, min: 0 },
      },
      pix: {
        enabled: { type: Boolean, default: true },
        discount: { type: Number, default: 0, min: 0 },
      },
      boleto: {
        enabled: { type: Boolean, default: true },
        expirationDays: { type: Number, default: 3, min: 1 },
        discount: { type: Number, default: 0, min: 0 },
      },
    },

    whatsappButton: {
      status: { type: Boolean, default: false },
      number: { type: String, default: "" },
    },

    countdownTimer: {
      status: { type: Boolean, default: false },
      title: { type: String, default: "" },
      time: { type: Number, default: 0, min: 0 },
    },

    orderBump: {
      status: { type: Boolean, default: false },
      productId: { type: String, default: "" },
    },

    testimonials: {
      status: { type: Boolean, default: false },
      reviews: [
        {
          photo: { type: String, default: "" },
          name: { type: String, default: "" },
          stars: { type: Number, default: 0, min: 0, max: 5 },
          description: { type: String, default: "" },
        },
      ],
    },

    background: {
      type: String,
      enum: ["white", "dark"],
      default: "white",
    },

    colors: {
      type: String,
      enum: [
        "#00D084",
        "#8B5CF6",
        "#1A1A1A",
        "#2196F3",
        "#4CAF50",
        "#FF9800",
        "#E91E63",
      ],
      default: "#00D084", // Emerald — cor de marca da PYX Gate
    },

    status: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ✅ Índices importantes para performance
CheckoutSchema.index({ userId: 1 });
CheckoutSchema.index({ productId: 1 });
CheckoutSchema.index({ createdAt: -1 });

export const Checkout = mongoose.model<ICheckout>("Checkout", CheckoutSchema);
