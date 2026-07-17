# Trace 性能分析工具（trace-performance-analyzer）

纯前端、浏览器运行、**无后端**的 LVGL/VG-Lite trace 性能分析工具。选择本地文件夹后，
按文件名自动分类，支持拖拽调整，然后对多份 trace 做横向 / 纵向对比与单文件深度分析。
所有文件读取、解析、统计**全部在浏览器端完成，数据不上传任何服务器**。

主要用于对比同一图形场景在 **不同模糊算法（exp/gau/stk）× 不同降采样（ds8/dsauto）** 下的
性能差异（帧率、每帧耗时、以及 `blur`、`finish` 等具体函数的耗时）。

---

## 一、快速开始

一键脚本（推荐）：

```bash
cd frameworks/graphics/animengine/tools/profiler_an
./run.sh            # 首次自动安装依赖并启动开发服务器
```

启动后用 **Chrome / Edge（Chromium 内核）** 打开终端打印的地址（一般 http://localhost:5173），
点“选择文件夹”，选中含 `.trace` 文件的目录（例如 `frameworks/graphics/animengine/profile/`）。

其他模式：

| 命令 | 作用 |
|------|------|
| `./run.sh` / `./run.sh dev` | 装依赖（首次）+ 启动开发服务器 |
| `./run.sh build` | 构建静态产物到 `dist/` |
| `./run.sh preview` | 构建并本地预览 |
| `./run.sh test` | 运行测试 |
| `./run.sh install` | 仅安装依赖 |

> 注意：`dev` 是常驻进程，请在自己的终端运行。首次 `npm install` 需要联网。
> 若装依赖时报 `EHOSTUNREACH`（IPv6 不通），`run.sh` 已内置 `--dns-result-order=ipv4first` 规避。

手动方式等价于：

```bash
npm install
npm run dev        # 开发
npm run test       # 测试（Vitest + fast-check）
npm run build      # 构建静态产物
npm run typecheck  # 类型检查
```

浏览器兼容性：
- **Chromium 系**（Chrome/Edge）：走 File System Access API，可选整个文件夹、可记住目录。
- **其他浏览器**：回退到 `<input webkitdirectory>`，可读文件但**无法持久化目录句柄**（下次需重选）。

---

## 二、trace 文件格式

ftrace 风格，每行形如：

```
LVGL-1 [0] 85.880882456: tracing_mark_write: B|1|event_cb
LVGL-1 [0] 85.880890877: tracing_mark_write: E|1|event_cb
```

- `B` / `E` = Begin / End，成对嵌套构成调用栈。
- 时间戳为“秒.纳秒”，内部统一转为 `bigint` 纳秒，避免浮点误差。
- 文件常以悬空 `E` 开头（tracing 中途开始）、以悬空 `B` 结尾（采集被截断）；解析器对这些
  做容错并计入诊断，不会因此报错。

### 文件名约定（用于自动分类）

按 `-` 分隔，从右取两段：

```
<scene>            -   <algo>   -   <downsample>   .trace
 feather_64_64_10  -    exp     -      ds8
 feather_martini   -    gau     -      dsauto
```

- `scene`：场景/用例名（可含下划线，甚至含 `-`，从右取两段后其余都算 scene）。
- `algo`：模糊算法（exp / gau / stk 等，不限枚举）。
- `downsample`：降采样配置（ds8 / dsauto 等）。
- 段数不足 3 的文件归入“未分类”，可手动拖拽归类。

### 文件名不符合上述约定怎么办？

**单文件分析永远有效**（self 热点、火焰图、调用树、每帧耗时、FPS、函数下钻都只看文件
内部的 `B/E` 事件，不看文件名）。只有“自动分类”和“分组对比图（图1/2/3、横向/纵向）”依赖
文件名拆出三维。

若命名不是 `xxx-algo-dsxx`，在分类区展开 **“自定义分类规则”** 面板调整（支持实时预览、
非法输入安全兜底）：

- **分隔符模式**：改分隔符即可。例如文件名用下划线 `scene_exp_ds8`，把分隔符设为 `_`。
- **正则模式（高级）**：填带命名分组的正则，可适配任意格式/顺序。例如：
  - 标准：`^(?<scene>.+)-(?<algo>[^-]+)-(?<downsample>[^-]+)$`
  - 维度反序 `ds8-exp-feather`：`^(?<downsample>ds\d+)-(?<algo>\w+)-(?<scene>.+)$`

面板会实时显示每个文件解析成的 scene/algo/downsample 及“可匹配 X/总数”，确认后点
“应用该规则重新分类”。仍无法匹配的文件会留在“未分类”，不影响其余文件的分析。

---

## 三、功能与使用流程

### 1) 选择文件夹 → 自动分类
读入所有 `.trace`，按文件名解析出 `scene/algo/downsample` 三维。分类维度可在
“分类维度”处切换（同文件 scene / 采样率 downsample / 算法 algo）。

### 2) 拖拽调整分类
看板形式，可把文件在分组间拖动、新建自定义分组、拖入“未分类”。拖拽只改变归属，
**不重新解析**（解析结果已缓存），因此响应很快。

### 3) 逐文件指标表
**每个 `.trace` 是一个独立测试 case，指标各自独立，绝不跨文件求平均。**
表中每行一个文件：帧数（有效/原始）、渲染 FPS、刷新率 FPS、平均/ P90 /最大帧耗时。
帧数列会标注被剔除的“超大帧”数量。

### 4) 分组对比图表（核心，一次性展示所有文件）
三张分组柱状图，每根柱 = 单个文件的真实值（**不平均**）：

- **图1 · 不同算法**：X = (文件 · 采样率)，每组 exp/gau/stk。
- **图2 · 不同采样率**：X = (文件 · 算法)，每组 ds8/dsauto。
- **图3 · 不同文件**：X = (算法 · 采样率)，各 scene；按文件名**自然排序**
  （`feather_64_64` 在 `feather_128_128` 之前）。

**指标可选**：
- 帧级：渲染 FPS / 刷新率 FPS / 平均帧耗时 / P90 / 最大帧耗时。
- 函数 self 耗时：输入关键词（如 `blur`、`finish`，带自动补全），按子串匹配聚合。
  聚合口径三选一：
  - **每次调用平均（推荐）**：`self 累计 ÷ 调用次数`，反映单次开销，跨文件/跨算法**可比**。
  - **每帧平均**：`self 累计 ÷ 有效帧数`。
  - **累计总和**：受帧数/调用次数影响，不同文件帧数不同时**不可直接比较，慎用**。

> 关于“帧率是平均还是累计”：帧级指标是平均（基于剔除异常帧后的帧）；函数 self 默认按
> **每次调用平均**。若对比结论与理论不符（如 stk 反而慢于 gau），先切到“每次调用平均”
> 排除帧数差异，再点柱子核对原始数据判断是真实差异还是采集抖动。

### 5) 点击柱子 → 原始数据核对
点任意柱子，弹窗展示该文件该指标的**全部有效样本**（逐帧或逐次调用），并给出
样本数 / 均值 / P50 / P90 / 最大。
- **异常样本默认不显示、且不计入统计**（与图表口径一致）。
- 勾选“显示已剔除的异常样本”可查看被剔的是哪些（标红，仅核对用）。

### 6) 单文件深度分析（self 热点 / 火焰图 / 调用树）
选一个文件查看：
- **self 热点榜**：按“自身独占耗时”排序（**不是** total）。带调用栈的 trace 里顶层
  total 天然最大且无意义，self 才能定位真正烧时间的叶子函数。
- **self vs total 对比**：直观说明为何不能看 total。
- **调用火焰图**：宽度 ∝ 总耗时，展示时间花在哪条调用路径上。
- **调用树表**：total / self / 占比 / 调用次数，可展开。
- **只看函数**：输入关键词（如 `blur finish`）筛选上述所有视图。

### 7) 对比明细表 / 诊断 / 导出
- **横向 / 纵向对比表**：读具体数值，绿=最优、红=最差。
- **解析诊断**：每文件的 danglingBegin/End、名称不匹配、格式错误行、负耗时等，异常偏高会标红。
- **导出**：逐文件指标 JSON / CSV（`bigint` 序列化为字符串），本地下载，无网络请求。

---

## 四、异常数据处理

分两层：

1. **结构异常（解析期）**：悬空 `B`/`E`、名称不匹配、格式错误/截断行、负耗时（钳制为 0）。
   全部计入诊断并在“解析诊断”面板展示，不影响其余数据。
2. **数值异常（统计期）**：帧耗时里的“超大帧”（如偶发 2000ms 卡顿/暂停）会**自动剔除**，
   避免拉偏平均帧率。方法可选 IQR（默认）/ P99 / MAD，可在顶部开关关闭。
   剔除对图表、逐文件表、点击弹窗**口径一致**。

> 工具能把“采集抖动”和“真实差异”分开，但无法修正原始 trace 本身的误差
> （如打点开销、预热帧、被抢占、样本过少）。样本量少时弹窗会提示均值可能不稳，建议看 P50。

---

## 五、目录结构

```
profiler_an/
├─ run.sh                一键脚本
├─ index.html            入口 HTML
├─ package.json / vite.config.ts / tsconfig.json
└─ src/
   ├─ core/              零依赖、isomorphic 分析核心（可在 Worker/Node 运行，不依赖 React）
   │  ├─ parseLine.ts        单行事件解析
   │  ├─ buildIntervals.ts   B/E 配对栈状态机（多 CPU、容错、调用树 id/parentId）
   │  ├─ aggregate.ts        每函数统计（含 self time 分解、百分位）
   │  ├─ analyzeFrames.ts    每帧耗时 + 双帧率（渲染 FPS / 刷新率 FPS）
   │  ├─ applyAnomalyFilter.ts 异常剔除（none/percentile/iqr/mad）+ 上界计算
   │  ├─ classifier.ts       文件名分类（按 '-' 拆 scene/algo/downsample）
   │  ├─ caseAnalysis.ts     单文件独立指标 CaseMetrics（含超大帧剔除、每函数多口径）
   │  ├─ groupCompare.ts     分组柱状图数据 + 自然排序
   │  ├─ compareViews.ts     横向(算法×采样率) / 纵向(跨文件) 明细
   │  ├─ callTree.ts         聚合调用树 + 火焰图数据
   │  ├─ cellDetail.ts       点击柱子的原始数据 + 异常标记
   │  ├─ drilldown.ts        指定函数选择 + 逐次调用（frameIndex 归属）
   │  ├─ exporters.ts        JSON / CSV 导出
   │  ├─ stats.ts / types.ts / analyzeFile.ts / index.ts
   ├─ worker/            Web Worker + WorkerPool（并行解析、每文件解析一次缓存）
   └─ ui/               React 组件与应用状态（FolderPicker / ClassificationBoard /
                        GroupCompareView / Dashboard / FlameChart / CallTreeTable /
                        CompareView / CaseTable / DiagnosticsPanel / ExportPanel / ...）
```

---

## 六、技术栈与测试

- **运行时**：React + Vite + ECharts + dnd-kit（拖拽）。
- **分析核心**：**零运行时第三方依赖**的纯 TypeScript，跑在 Web Worker 中，主线程不卡顿。
- **测试**：Vitest + fast-check（属性测试）+ Testing Library。核心的解析/配对/统计/分类
  等有属性测试保证正确性（如耗时非负、B/E 配对守恒、self ≤ total、异常剔除计数守恒等），
  并有针对真实样例目录的集成测试。

```bash
npm run test        # 全部测试
npm run typecheck   # 类型检查
```

---

## 七、部署到 GitHub Pages（在线访问）

本工具是纯静态应用，可托管到 GitHub Pages 免费在线访问（HTTPS，"选文件夹"功能在线可用）。

**推荐：把 `profiler_an` 目录作为独立仓库根上传**，已内置工作流 `.github/workflows/deploy.yml`：

1. 将本目录作为一个新的 GitHub 仓库根推送（`git init` → `git add .` → push）。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 推送到 `main` 分支后自动构建部署，访问 `https://<用户名>.github.io/<仓库名>/`。

> 若放在 monorepo 子目录部署，把工作流移到仓库根的 `.github/workflows/`，并将其中
> `working-directory` 改为子目录相对路径。

构建产物使用相对路径（`base: "./"`），Web Worker 通过 `import.meta.url` 相对解析，
因此在带子路径的 Pages 站点下可正常运行。也可用 `./run.sh build` 生成 `dist/` 后部署到
任意静态托管（内部 GitLab Pages / Nginx / 对象存储等）。

> **合规提醒**：公开发布前请确认代码可对外开放；**切勿提交任何 `.trace` 采集数据**
> （已在 `.gitignore` 中排除）。工具本身不含 trace 数据，用户在浏览器现场选本地文件。

## 八、隐私与安全

- 所有数据在浏览器本地处理，**不上传、无数据外传的网络请求**。
- 解析器为纯正则/状态机，**不对 trace 内容执行 eval 或动态代码**。
- 用户输入的筛选通配符/正则被安全转义处理，非法输入不会导致崩溃。
- 目录句柄（如持久化）仅存于本机浏览器沙箱（IndexedDB）。
```
