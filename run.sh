#!/usr/bin/env bash
# 一键运行 trace-performance-analyzer
#
# 用法：
#   ./run.sh            # 首次自动安装依赖并启动开发服务器（默认）
#   ./run.sh dev        # 同上
#   ./run.sh build      # 构建静态产物到 dist/
#   ./run.sh preview    # 构建并本地预览产物
#   ./run.sh test       # 运行测试
#   ./run.sh install    # 仅安装依赖
#
# 说明：数据全程在浏览器本地处理，不上传任何服务器。

set -euo pipefail

# 切换到脚本所在目录（即项目根），保证相对路径稳定。
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${1:-dev}"

# ---- 网络：强制 Node/npm 优先使用 IPv4 ----
# 某些环境域名会解析出 IPv6 地址但无法走 IPv6 出网，导致 npm 报
# EHOSTUNREACH（没有到主机的路由）。优先 IPv4 可规避该问题。
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first"

# ---- 环境检查 ----
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 未找到 node，请先安装 Node.js 18+。" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "❌ 未找到 npm，请先安装 npm。" >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "⚠️  检测到 Node $(node --version)，建议使用 18 及以上版本。" >&2
fi

# ---- 依赖安装（node_modules 不存在时自动安装）----
ensure_deps() {
  if [ ! -d node_modules ]; then
    echo "📦 首次运行，正在安装依赖（npm install）…"
    npm install
  fi
}

case "$MODE" in
  install)
    npm install
    echo "✅ 依赖安装完成。"
    ;;
  dev)
    ensure_deps
    echo "🚀 启动开发服务器…"
    echo "   请用 Chrome / Edge 打开下方地址，选择 profile/ 目录（含 .trace 文件）。"
    npm run dev
    ;;
  build)
    ensure_deps
    echo "🔨 构建静态产物到 dist/ …"
    npm run build
    echo "✅ 构建完成，产物位于：$SCRIPT_DIR/dist/"
    ;;
  preview)
    ensure_deps
    npm run build
    echo "👀 预览构建产物…"
    npm run preview
    ;;
  test)
    ensure_deps
    npm run test
    ;;
  *)
    echo "未知参数：$MODE" >&2
    echo "用法：./run.sh [dev|build|preview|test|install]" >&2
    exit 1
    ;;
esac
