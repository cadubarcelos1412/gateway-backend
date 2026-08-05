// src/models/systemFeeConfig.model.ts
// Documento único (key: "default") com a tabela de taxas padrão da plataforma —
// usada como snapshot inicial pra todo seller novo (ver Seller.feeTable).
import mongoose, { Schema, Document } from "mongoose";
import { IFeeTable, DEFAULT_FEE_TABLE } from "./feeTable.types";
import { FeeTableSchema } from "./feeTable.schema";

export interface ISystemFeeConfig extends Document {
  key: "default";
  feeTable: IFeeTable;
  updatedAt: Date;
}

const SystemFeeConfigSchema = new Schema<ISystemFeeConfig>(
  {
    key: { type: String, enum: ["default"], required: true, unique: true },
    feeTable: { type: FeeTableSchema, required: true, default: DEFAULT_FEE_TABLE },
  },
  { timestamps: true, versionKey: false }
);

export const SystemFeeConfig = mongoose.model<ISystemFeeConfig>(
  "SystemFeeConfig",
  SystemFeeConfigSchema
);

/** Busca a config global, criando com os defaults na primeira vez que for chamada. */
export async function getOrCreateDefaultFeeConfig(): Promise<ISystemFeeConfig> {
  let config = await SystemFeeConfig.findOne({ key: "default" });
  if (!config) {
    config = await SystemFeeConfig.create({ key: "default", feeTable: DEFAULT_FEE_TABLE });
  }
  return config;
}
