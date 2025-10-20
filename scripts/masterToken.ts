// scripts/masterToken.ts
import "dotenv/config";
import { createMasterToken } from "../src/config/auth";

(async () => {
  const token = await createMasterToken();
  console.log("\n✅ MASTER TOKEN GERADO:\n");
  console.log("Bearer " + token);
})();
