import "dotenv/config";
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);
const { getPixPaymentStatus } = await import("../dist/lib/zendry/pixPayout.js");
const result = await getPixPaymentStatus("PE202608170001429525");
console.log(JSON.stringify(result, null, 2));
await mongoose.disconnect();
