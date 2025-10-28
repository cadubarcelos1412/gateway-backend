import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../src/models/user.model";

(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);

  const email = "administrador@teste.com";
  const newPassword = "SenhaForte123!";

  const hashed = await bcrypt.hash(newPassword, 10);
  await User.updateOne({ email }, { $set: { password: hashed } });

  console.log(`✅ Senha redefinida para ${email}`);
  console.log(`🔑 Nova senha: ${newPassword}`);
  process.exit(0);
})();
