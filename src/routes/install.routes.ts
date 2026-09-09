// src/routes/install.routes.ts
//
// 🚚 Canal de instalação próprio — mesmo padrão que Anthropic, OpenAI e
// Docker usam pros CLIs deles:
//
//     curl -fsSL https://api.pyxgate.com/install.sh | sh
//
// Sem registry público: os tarballs são servidos por esta API e o instalador
// confere o SHA-256 do manifesto ANTES de instalar. Sem essa verificação um
// `curl | sh` seria execução remota de código com confiança cega no
// transporte — HTTPS protege o caminho, não o conteúdo servido.
import { Router } from "express";
import express from "express";
import fs from "fs";
import path from "path";

const router = Router();

const distPath = path.join(__dirname, "..", "..", "public", "dist");
const manifestPath = path.join(distPath, "manifest.json");

interface Manifest {
  gerado_em: string;
  pacotes: Record<string, { nome: string; versao: string; descricao: string; arquivo: string; tamanho: number; sha256: string }>;
}

function lerManifest(): Manifest | null {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
  } catch {
    return null;
  }
}

function baseUrl(): string {
  return (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
}

/** URL pública do servidor MCP hospedado — usada no registro automático. */
function mcpUrl(): string {
  return (process.env.MCP_RESOURCE_URL || `${baseUrl()}/mcp`).split(",")[0].trim().replace(/\/$/, "");
}

/* -------------------------------------------------------------------------- */
/* 📇 Manifesto e artefatos                                                   */
/* -------------------------------------------------------------------------- */

router.get("/dist/manifest.json", (_req, res) => {
  const manifest = lerManifest();
  if (!manifest) {
    res.status(503).json({ error: "release_indisponivel", message: "Nenhum release publicado. Rode npm run build:release." });
    return;
  }
  res.set("Cache-Control", "public, max-age=300").json(manifest);
});

// Tarballs. Imutáveis por versão — o nome do arquivo carrega a versão, então
// cache longo é seguro.
router.use(
  "/dist",
  express.static(distPath, {
    maxAge: "1y",
    immutable: true,
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".tgz")) res.type("application/gzip");
    },
  })
);

/* -------------------------------------------------------------------------- */
/* 🐚 Instaladores                                                            */
/* -------------------------------------------------------------------------- */

function scriptSh(base: string, mcp: string): string {
  return `#!/bin/sh
# Instalador da PYX Gate — https://pyxgate.com
#
#   curl -fsSL ${base}/install.sh | sh
#
# Instala o servidor MCP (@pyxgate/mcp) a partir da nossa própria
# infraestrutura, verificando o SHA-256 do manifesto. Não usa registry
# público. Requer Node.js 18+.
set -eu

BASE="${base}"
MCP_URL="${mcp}"
PACOTE="\${PYXGATE_PACOTE:-mcp}"   # mcp | sdk

vermelho() { printf '\\033[31m%s\\033[0m\\n' "$1" >&2; }
verde()    { printf '\\033[32m%s\\033[0m\\n' "$1"; }
info()     { printf '  %s\\n' "$1"; }

erro() { vermelho "erro: $1"; exit 1; }

command -v node >/dev/null 2>&1 || erro "Node.js não encontrado. Instale Node 18+ e rode de novo."
command -v npm  >/dev/null 2>&1 || erro "npm não encontrado. Instale Node 18+ e rode de novo."

MAIOR=$(node -p "process.versions.node.split('.')[0]")
[ "$MAIOR" -ge 18 ] || erro "Node 18+ é necessário (encontrado: $(node -v))."

if command -v curl >/dev/null 2>&1; then
  baixar() { curl -fsSL "$1" -o "$2"; }
  ler()    { curl -fsSL "$1"; }
elif command -v wget >/dev/null 2>&1; then
  baixar() { wget -qO "$2" "$1"; }
  ler()    { wget -qO- "$1"; }
else
  erro "curl ou wget são necessários."
fi

printf '\\n  PYX GATE · instalador\\n\\n'

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

info "buscando manifesto..."
ler "$BASE/dist/manifest.json" > "$TMP/manifest.json" || erro "não consegui ler o manifesto em $BASE"

eval "$(node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const p = m.pacotes[process.argv[2]];
  if (!p) { console.error("pacote desconhecido"); process.exit(1); }
  console.log("ARQUIVO=" + p.arquivo);
  console.log("SHA=" + p.sha256);
  console.log("VERSAO=" + p.versao);
  console.log("NOME=" + p.nome);
' "$TMP/manifest.json" "$PACOTE")"

info "baixando $NOME@$VERSAO"
baixar "$BASE/dist/$ARQUIVO" "$TMP/$ARQUIVO" || erro "falha ao baixar $ARQUIVO"

# Verificação de integridade — sem isso, "curl | sh" confia cegamente no
# que voltou do servidor.
if command -v sha256sum >/dev/null 2>&1; then
  REAL=$(sha256sum "$TMP/$ARQUIVO" | cut -d" " -f1)
elif command -v shasum >/dev/null 2>&1; then
  REAL=$(shasum -a 256 "$TMP/$ARQUIVO" | cut -d" " -f1)
else
  REAL=$(node -e 'const c=require("crypto"),f=require("fs");console.log(c.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex"))' "$TMP/$ARQUIVO")
fi

[ "$REAL" = "$SHA" ] || erro "checksum não confere.
       esperado: $SHA
       recebido: $REAL
       Não instalei nada. Tente de novo; se persistir, fale com o suporte."
info "checksum conferido (sha256)"

info "instalando..."
npm install -g "$TMP/$ARQUIVO" >/dev/null 2>&1 || erro "npm install falhou. Se for permissão, configure um prefixo do npm no seu home:
       npm config set prefix ~/.npm-global && export PATH=~/.npm-global/bin:\\$PATH"

verde "  ✓ $NOME@$VERSAO instalado"

# Registro automático no Claude Code, se estiver por perto.
if [ "$PACOTE" = "mcp" ] && command -v claude >/dev/null 2>&1; then
  printf '\\n'
  info "registrando o MCP no Claude Code..."
  if claude mcp add --transport http pyxgate "$MCP_URL" >/dev/null 2>&1; then
    verde "  ✓ registrado — abra o Claude Code e autorize sua conta no primeiro uso"
  else
    info "já registrado (ou registre à mão):"
    info "  claude mcp add --transport http pyxgate $MCP_URL"
  fi
fi

cat <<'FIM'

  Como usar
  ---------
  Hospedado (recomendado) — autoriza via OAuth no navegador:
    claude mcp add --transport http pyxgate MCPURL

  Local, com chave de API:
    PYXGATE_API_KEY=sk_test_... pyxgate-mcp --stdio

  Documentação: BASEURL/docs#mcp

FIM
printf '  (substitua MCPURL por %s e BASEURL por %s)\\n\\n' "$MCP_URL" "$BASE"
`;
}

function scriptPs1(base: string, mcp: string): string {
  return `# Instalador da PYX Gate — https://pyxgate.com
#
#   irm ${base}/install.ps1 | iex
#
# Instala o servidor MCP a partir da nossa infraestrutura, verificando o
# SHA-256 do manifesto. Não usa registry público. Requer Node.js 18+.
$ErrorActionPreference = 'Stop'

$Base    = '${base}'
$McpUrl  = '${mcp}'
$Pacote  = if ($env:PYXGATE_PACOTE) { $env:PYXGATE_PACOTE } else { 'mcp' }

function Erro($m) { Write-Host "erro: $m" -ForegroundColor Red; exit 1 }
function Info($m) { Write-Host "  $m" }
function Ok($m)   { Write-Host "  $m" -ForegroundColor Green }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Erro 'Node.js nao encontrado. Instale Node 18+.' }
if (-not (Get-Command npm  -ErrorAction SilentlyContinue)) { Erro 'npm nao encontrado. Instale Node 18+.' }

$maior = [int](node -p "process.versions.node.split('.')[0]")
if ($maior -lt 18) { Erro "Node 18+ e necessario (encontrado: $(node -v))." }

Write-Host ''
Write-Host '  PYX GATE - instalador'
Write-Host ''

$tmp = Join-Path $env:TEMP ("pyxgate-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

try {
  Info 'buscando manifesto...'
  $manifest = Invoke-RestMethod -Uri "$Base/dist/manifest.json"
  $info = $manifest.pacotes.$Pacote
  if (-not $info) { Erro "pacote desconhecido: $Pacote" }

  Info "baixando $($info.nome)@$($info.versao)"
  $arquivo = Join-Path $tmp $info.arquivo
  Invoke-WebRequest -Uri "$Base/dist/$($info.arquivo)" -OutFile $arquivo

  $real = (Get-FileHash -Path $arquivo -Algorithm SHA256).Hash.ToLower()
  if ($real -ne $info.sha256) {
    Erro "checksum nao confere.\`n       esperado: $($info.sha256)\`n       recebido: $real\`n       Nao instalei nada."
  }
  Info 'checksum conferido (sha256)'

  Info 'instalando...'
  npm install -g $arquivo 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Erro 'npm install falhou.' }

  Ok "OK $($info.nome)@$($info.versao) instalado"

  if ($Pacote -eq 'mcp' -and (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host ''
    Info 'registrando o MCP no Claude Code...'
    claude mcp add --transport http pyxgate $McpUrl 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Ok 'OK registrado - abra o Claude Code e autorize sua conta no primeiro uso'
    } else {
      Info 'ja registrado (ou registre a mao):'
      Info "  claude mcp add --transport http pyxgate $McpUrl"
    }
  }

  Write-Host ''
  Write-Host '  Como usar'
  Write-Host '  ---------'
  Write-Host '  Hospedado (recomendado) - autoriza via OAuth no navegador:'
  Write-Host "    claude mcp add --transport http pyxgate $McpUrl"
  Write-Host ''
  Write-Host '  Local, com chave de API:'
  Write-Host '    $env:PYXGATE_API_KEY="sk_test_..."; pyxgate-mcp --stdio'
  Write-Host ''
  Write-Host "  Documentacao: $Base/docs#mcp"
  Write-Host ''
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
`;
}

/**
 * Os instaladores são gerados com a BASE_URL desta instalação — assim o
 * script baixado de um ambiente sempre aponta pra ele mesmo, sem URL
 * chumbada no repositório.
 */
router.get("/install.sh", (_req, res) => {
  res.type("text/plain; charset=utf-8").set("Cache-Control", "no-cache").send(scriptSh(baseUrl(), mcpUrl()));
});

router.get("/install.ps1", (_req, res) => {
  res.type("text/plain; charset=utf-8").set("Cache-Control", "no-cache").send(scriptPs1(baseUrl(), mcpUrl()));
});

/** Atalho amigável: quem abre /install no navegador vê o que fazer. */
router.get("/install", (_req, res) => {
  const manifest = lerManifest();
  const versao = manifest?.pacotes?.mcp?.versao ?? "—";
  res.type("text/plain; charset=utf-8").send(
    `PYX Gate — instalação do servidor MCP (versão ${versao})\n\n` +
      `  macOS / Linux:\n    curl -fsSL ${baseUrl()}/install.sh | sh\n\n` +
      `  Windows (PowerShell):\n    irm ${baseUrl()}/install.ps1 | iex\n\n` +
      `Os instaladores conferem o SHA-256 publicado em ${baseUrl()}/dist/manifest.json\n` +
      `antes de instalar. Documentação: ${baseUrl()}/docs#mcp\n`
  );
});

export default router;
