# 文游工坊 · 云酒馆 Git 安装版 v1.0

把 PDF、DOCX、TXT 等资料变成手机端互动文游。适用于带有「安装扩展 → 输入 Git URL」入口的 SillyTavern。

## 这份包怎么用

这是一份可直接放到 Git 仓库根目录的扩展文件集，还没有被发布成可安装的 Git 仓库。ZIP 下载地址不是 Git URL。

解压后有6个文件：`manifest.json`、`index.js`、`host.css`、`app.html`、`LICENSE`、`README.md`。把这6个文件上传到你自己新建的 GitHub 仓库根目录；不要只上传ZIP，不要再套一层文件夹。

## 手机上传 GitHub

1. 打开 https://github.com/new ，登录你自己的 GitHub 账号。
2. 创建一个新的空仓库，例如 `wenyou-forge`。选择 Public（公开），以便云酒馆无需仓库凭据即可读取；包里是扩展代码，不要往仓库加入自己的资料或密钥。
3. 在空仓库首页点击「uploading an existing file」。如果仓库已有文件，选择「Add file → Upload files」。
4. 点击「choose your files」，在手机文件选择器内选中本包解压得到的6个文件，然后完成提交。
5. 回到仓库首页，确认文件列表直接显示 `manifest.json`、`index.js` 和 `app.html`。
6. 复制仓库首页地址（格式见下文），回云酒馆的安装扩展弹窗粘贴并安装。分支栏可留空，使用默认分支。

仓库地址格式示意，必须替换成你实际建立的仓库：

`https://github.com/你的GitHub用户名/wenyou-forge`

这不是现成的可安装链接。不要直接复制带「你的GitHub用户名」的示例。

手机网页看不到上述按钮时，可尝试浏览器的「桌面版网站」；不同GitHub页面布局可能略有区别。

## 云酒馆内安装

1. 点击顶部积木图标进入扩展页。
2. 点击「安装扩展程序」。
3. 在「输入扩展程序的 Git URL 以安装」弹窗中，粘贴真实仓库地址。
4. 分支 / 标签留空。若要指定分支，填写你仓库里实际存在的分支名。
5. 点击安装，成功后刷新酒馆；在扩展设置里找到「文游工坊」并点击「打开文游工坊」。
6. 上传游戏资料，选择AI模式，生成并游玩。

不要填进「下载扩展程序和资源 → 资源网址」输入框：那里接收资源列表，不是这个扩展的Git仓库地址。

## 功能和使用条件

- 上传PDF、DOCX、TXT、MD、JSON、CSV；一次最多6个，每个≤16MB，总提取文字≤50万字符，PDF≤200页。
- 清新卡片页面，剧情选择、回合推进、随机事件、玩家数值、NPC互动及关系累计。
- AI模式使用酒馆当前模型，不需在扩展内重复填写密钥。若酒馆显示「未连接到API」，先连接模型；否则可先用本地规则体验。
- 本地提取文件文字；选择AI生成后，会把相关资料片段与游戏状态发送到当前连接的模型。
- PDF仅提取文字层；扫描件需先OCR。DOCX读取文字，旧DOC请先转DOCX。复杂表格、图片和原页面排版不保留。
- 本地规则体验使用资料摘录和通用事件；它不等同于AI原创剧情。
- 四项通用属性为体力、心情、洞察、资源；不自动编译任意资料中的复杂数值系统。
- 自动存档存在当前浏览器，同一酒馆地址共用一个当前进度，不与聊天或账户自动隔离；重要进度请导出JSON。
- 支持导出带存档的完整单文件HTML；离开酒馆后使用本地规则继续。

## 无法安装时

有安装入口不保证云端开放了相应权限，或能够访问GitHub。如果提示安装被禁用、权限不足或网络错误，请向云酒馆管理员确认第三方扩展安装和GitHub访问是否开放。不能通过角色卡导入绕过这些限制。

本扩展按近期官方SillyTavern的 `SillyTavern.getContext().generateRaw({...})` 接口开发，不依赖Extras或酒馆助手。云酒馆若使用旧版或修改版，仍需实际验证兼容性。

交付前已验证文件解析、DOM功能、回合与存档，以及模拟酒馆接口；未在你的云酒馆、实际模型或安卓实体设备联调。本次仅调整Git仓库打包结构，不改变v1.0游戏逻辑。

## 源码与授权

`app.html` 是完整自包含页面，包含原生HTML、CSS和JavaScript，已内嵌PDF.js、Mammoth及字体/CMap数据，不依赖运行时CDN。第三方完整许可证已保存在HTML的 `wenyou-licenses` 文本节点中；原创代码使用MIT许可证，见LICENSE。

## 官方参考

- SillyTavern Git扩展安装：https://docs.sillytavern.app/extensions/
- GitHub网页上传文件：https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
