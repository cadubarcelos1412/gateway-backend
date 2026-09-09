// Empacota os subprojetos publicáveis e escreve os artefatos servidos pelo
// canal de instalação próprio (/install.sh, /install.ps1, /dist/...).
//
// Não usa registry público: os tarballs são servidos pela nossa própria API,
// e o instalador confere o SHA-256 antes de instalar qualquer coisa.
//
// Rodar: npm run build:release   (e commitar public/dist/)
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, "public", "dist");

const PACOTES = [
  { dir: "mcp", nome: "@pyxgate/mcp", papel: "Servidor MCP — ferramentas de pagamento para agentes de IA" },
  { dir: "sdk", nome: "@pyxgate/sdk", papel: "SDK TypeScript da API /v1" },
];

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino, { recursive: true });

const manifest = { gerado_em: new Date().toISOString(), pacotes: {} };

for (const pacote of PACOTES) {
  const cwd = path.join(raiz, pacote.dir);
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));

  // prepublishOnly do sdk roda o tsc — garante que dist/ está fresco.
  const saida = execSync("npm pack --silent", { cwd, encoding: "utf8" }).trim().split("\n").pop();
  const origem = path.join(cwd, saida);

  const bytes = fs.readFileSync(origem);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const arquivo = `${pacote.dir}-${pkg.version}.tgz`;

  fs.writeFileSync(path.join(destino, arquivo), bytes);
  fs.rmSync(origem);

  manifest.pacotes[pacote.dir] = {
    nome: pkg.name,
    versao: pkg.version,
    descricao: pacote.papel,
    arquivo,
    tamanho: bytes.length,
    sha256,
  };

  console.log(`✅ ${pkg.name}@${pkg.version} → ${arquivo} (${(bytes.length / 1024).toFixed(1)} KB)`);
  console.log(`   sha256: ${sha256}`);
}

fs.writeFileSync(path.join(destino, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`\n📦 manifest.json escrito em public/dist/`);
