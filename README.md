# PhotoSpot PKU

北京大学摄影点位地图 — 一个交互式 Web 地图应用，帮助你探索北大校园的最佳拍摄机位。

## 功能

- **三级导航** — 摄影区域 → 拍摄机位 → 示例照片 + EXIF 参数
- **地图交互** — 基于 Mapbox GL JS，支持缩放、飞行动画、点击选点
- **底图切换** — 暗色 / 街道 / 卫星三种样式
- **照片预览** — Lightbox 全屏查看，叠加相机型号、焦距、光圈等 EXIF 信息
- **响应式** — 桌面侧边栏 + 移动端底部抽屉，支持手势拖拽
- **推荐标记** — 关键摄影区域与机位优先展示

## 快速开始

```bash
# 1. 克隆并进入项目
git clone https://github.com/Raymond1030/PhotoSpot-PKU-Web.git
cd PhotoSpot-PKU-Web

# 2. 配置 Mapbox Token
cp .env.example .env
# 编辑 .env，填入你的 Token（申请地址：https://account.mapbox.com/access-tokens/）

# 3. 安装依赖并启动
npm install
npm run dev
```

打开 `http://localhost:3000` 即可访问。

> 由于使用 `fetch` 加载数据，不能直接打开 `index.html`，需通过 HTTP 服务器访问。

## 项目结构

```
├── index.html                 # 页面入口
├── css/style.css              # 样式（响应式 + 暗色主题 + CSS 变量）
├── js/
│   ├── app.js                 # 应用主逻辑（地图、面板、图片轮播、手势）
│   └── config.js              # 从 .env 自动生成（已 gitignore）
├── data/
│   ├── spot_data/             # GeoJSON 点位数据
│   ├── images/                # 照片（按 区域/机位 目录组织）
│   ├── image_manifest.json    # 图片路径清单（自动生成）
│   └── image_metadata.json    # EXIF 元数据（自动生成）
├── scripts/
│   ├── generate_config.js     # .env → js/config.js
│   └── generate_manifest.js   # 扫描 images/ 生成清单与 EXIF
├── .env.example               # 环境变量模板
└── package.json
```

## 开发命令


| 命令                    | 说明                                       |
| --------------------- | ---------------------------------------- |
| `npm run dev`         | 生成配置 → 生成图片清单 → 启动 live-server (端口 3000) |
| `npm run sync-photos` | 仅重新扫描 `data/images/` 生成清单和 EXIF          |
| `npm run gen-config`  | 仅从 `.env` 重新生成 `js/config.js`            |


## 技术栈

- **前端**：HTML / CSS / JavaScript（纯静态，无框架、无构建）
- **地图**：Mapbox GL JS v3.3（原生图层渲染，非 DOM 标记）
- **数据**：GeoJSON
- **图片**：腾讯云 COS 托管
- **EXIF**：ExifReader

## 数据格式

点位数据为 GeoJSON FeatureCollection，分两级：

**PKU_Area（摄影区域）**：`id` / `Area_Name` / `Des` / `Key_Area`

**PKU_Spot（拍摄机位）**：`Spot_id` / `Area_id` / `Spot_Name` / `Des` / `Key_Spot`

## 部署

可部署到 GitHub Pages、Vercel、Netlify 等静态托管平台。

1. 在部署环境中配置 `.env`（或手动创建 `js/config.js`）
2. 在 [Mapbox 后台](https://account.mapbox.com/access-tokens/) 为 Token 设置 URL 限制，仅允许部署域名使用

## License

MIT