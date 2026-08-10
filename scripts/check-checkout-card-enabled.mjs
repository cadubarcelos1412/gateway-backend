// Read-only: verifica se a opção de cartão está habilitada nos checkouts
// existentes — se estiver desligada em todos, explicaria por que nunca
// existiu nem uma tentativa de pagamento por cartão no sistema.
import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI);
const Checkouts = mongoose.connection.collection("checkouts");

const checkouts = await Checkouts.find({}).toArray();
console.log(`Total de checkouts: ${checkouts.length}\n`);

for (const c of checkouts) {
  console.log(
    `- ${c._id} | userId=${c.userId} | slug=${c.slug || "-"} | pix.enabled=${c.paymentMethods?.pix?.enabled} | creditCard.enabled=${c.paymentMethods?.creditCard?.enabled} | status=${c.status || "-"}`
  );
}

await mongoose.disconnect();
