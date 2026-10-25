# 交接快照 · 山海策 · 灵脉

> **给接手的人 / 另一个账号看的唯一入口。** 读完这份就能直接开工，不必翻聊天记录。
> 最后更新：2026-10-25 22:20 · git HEAD `0e52f08` · **二期进行中**

---

## 0. 当前节点速览（2026-10-25 20:30）

**P6 已搁置**（用户决定，`dev/regress.js` 停在 75 通过 / 2 失败未提交）。**二期已启动**，主文档：`docs/山海策-灵脉-二期计划.md`（四根主轴：尺度/传承/宿命/呈现）。执行顺序按计划 §3：**P1 = A 战略层 + D 宿命脚本 + G 打击感 + H-P1 图标**，其中 **G 与 H-P1 投入产出比最高，最先做**。

### ✅ 规则修正：攻击不消耗移动力（提交 `165302c`，四连全绿）

用户反馈「原地攻击后移动力还在，不应结束行动」。规则改为：**攻击不消耗移动力**——攻击后移动力有剩就回到移动模式继续走（范围=剩余量），每回合仍限一次攻击类行动（行动菜单攻击/法术/杖/渡厄/道具/说得/召唤按 `attacked` 置灰）。实现：`combat.js reachable` 增 `spent` 参数（maxCost 按剩余量算，spent≥move 只能原地）；`battle.js` 单位增 `moveUsed/attacked`，`moveSelectedTo` 按地形成本累计，攻击后走 `afterAttack`，`cancelSelection` 回退 moveUsed 到会话起点（防反复取消刷范围）。**坑**：沙盒冰面测试第三次是手动传送单位，旧测试依赖「可反复全额移动」的旧行为——手动传送场景要补 `moveUsed = 0`。

**P6 已搁置**（用户决定，`dev/regress.js` 停在 75 通过 / 2 失败未提交）。**二期已启动**，主文档：`docs/山海策-灵脉-二期计划.md`（四根主轴：尺度/传承/宿命/呈现）。执行顺序按计划 §3：**P1 = A 战略层 + D 宿命脚本 + G 打击感 + H-P1 图标**，其中 **G 与 H-P1 投入产出比最高，最先做**。

### ✅ G 打击感（提交 `ff46190`，四连全绿：3178 / 1653 / 冒烟双变体）

- `js/juice.js`（368 行）：虚拟时钟（`update` 顿帧期返回 0 时钟停走，`Juice.now()` 供渲染层读）；顿帧三件套 + 粒子池 + 冲击帧 + 击退/挤压 + 击杀慢动作/倒地/暗角；必杀四段式（推镜 + 立绘切入 + 0.35 慢放）；`TUNING` 调参表；`reducedMotion` 只留 2 帧顿帧；倍速按比例缩短；`clearAll()` 点击跳过清零。
- 接线：`render.js`（演出计时全读 `Juice.now()`、击退/倒地偏移、挤压淡出、trauma 震屏、推镜、`Juice.drawFx`、floatText pop）、`battle.js`（`critWindUp/critWindDown/hitFromEv`，关设置回退旧行为）、`render-battleview.js`（`now()` 读 Juice 时钟；`strike` 命中时刻定时触发——**必须先捕获 `fxRef` 再清 `s.fx`，顺序反了永远不触发**）、`main.js`（rAF dt + busy 点屏 clearAll）、`audio.js`（`duck()` 静音一拍 + thump/crunch）、`game.js`（设置三键 juice/reducedMotion/haptics）。
- 测试：formulas 第 38 节 49 条 + smoke Juice 区块。**vm 里测试 Juice 的坑**：`update` 单帧 dt 钳 50ms；上下文已有 `const Battle`（第 11 节载入 battle.js），只能改 `.B` 不能 `var` 重声明。

### ✅ 死亡定格（提交 `0a200c3`，四连全绿）

- `Juice.deathCardFor(unit, speed)`：handleDeath 挂卡（名字 + EPITAPHS 遗言，与英魂碑同源）+ `freeze(dur)` 世界冻结；卡片真实时钟演淡入淡出（`setTransform` 重置避震屏偏移）；1200ms，倍速缩钳 500~1500；`clearAll`/到点撤卡。battle.js 我方阵亡分支 await 等量 wait。

### ✅ H-P1 物品图标化（提交 `017c77f`，四连全绿：3547 / 1661 / 冒烟双变体）

- `js/item-icons.js`（约 250 行）：80 枚全覆盖（WEAPONS 53 + ITEMS 7 + SPELLS 15，冒烟断言 0 缺图）。SVG data URI 程序图，无外部请求；10 类武器底形 × 铁/钢/银三档材质色（`RANK_TIER`：D/C 铁、B 钢、A/S 银）；五行符号按 `SPELLS.element` 取色，`aoe` 法术加虚线范围十字；药水 3 瓶型（flask/herb/elixir 按 heal 值分流）；材料 4 枚。稀有度走底框描边（武器用 tier 的 frame：墨/青/金；传说赤 `#a02c2c` + 外发光；脉印金；药水青）。**铁/钢/银同形只换色**（测试断言去色后骨架一致）。
- 入口：`ItemIcons.iconHTML(id, cls, size)` → `<img class="ii ...">`（未知 id 返回 `''`，调用方落文字）；`uriFor` 给 camp 传说 PNG 的 onerror 回退链用。
- 接入面：`camp.js` 商店/打造坊/行囊行/兵装行（`weaponIconHTML` 传说仍 PNG 优先 + SVG 兜底）、强化与进化弹窗（`UI.modal` 的 `item.icon`，弹窗按钮有图标时加 `has-icon` 隐圆点）；`ui.js` 战斗预测 `fc-hp` 武器名、单位卡兵装行；`battle.js` 五行法术菜单。`css/style.css` 补 `.ml-icon/.ii-16/20/22/24/.ii-row/.fc-wicon/.uc-weapon img.ii`。
- 测试：test-logic 新增 H-P1 节（files 加 `data-systems.js`+`item-icons.js`）；smoke 新增图标区块（渲染接入 + 全表覆盖 + 静态接线 + `Combat.` 纯洁）。**坑**：smoke 的 `src()` 是 Juice 区块内局部函数，新区块要自己定义；smoke FILES 忘了加 `js/item-icons.js` 会 ReferenceError。

### ✅ 音频架构（提交 `875dcc6`，四连全绿：3558 / 1661 / 冒烟双变体）

- `js/audio-bgm.js`（220 行）：**file:// 下 `<audio>` 是唯一可靠播本地音频文件的方式**（WebAudio 的 fetch+decodeAudioData 被 CORS 挡），故 BGM/采样走元素、合成退居兜底。`BGM` 场景音乐管理器（ogg→mp3 双 source、crossfade、duck 静默一拍、setMusicOn；文件缺失一次探测记终身自动回退程序音乐；无 DOM 整体静默）。`SFX` 采样音效池（文件优先，首次未就绪当次合成、之后全走文件——换采样零成本）。
- `audio.js`：`sweep()` 扫频噪声基底 + 21 个合成音效（挥击 3 / 材质命中 3 / 暴击 / 五系吟唱 5 / 五系爆发 5 / 阵亡 / 占阵 / UI）；`sfx` 开头接 SFX 钩子；duck 在文件音乐激活时转 BGM.duck。
- 接线：battle.js 挥击按武器类型（轻重锐）、命中按材质（披甲/木器/肉身），音乐切换全走 `BGM.play`；game.js 开关补 `BGM.setMusicOn`。
- 测试坑：`_can()` 能力探测也 `createElement('audio')`，fake DOM 统计元素要过滤探测桩；静态查 `Combat.` 会被文件头注释误伤。
- **BGM 素材仍是唯一外求项**：清单与 AI 提示词在 `docs/素材清单与生成提示词.md`（4 首必做：营地/战斗/Boss/剧情），文件丢进 `assets/audio/bgm/` 即自动挂上。

### ✅ 高低地形差（提交 `39680a8`，四连全绿：3612 / 1689 / 冒烟双变体）

- **数据**：章节加 `height` 层（8 行 × 16 位数字 0~2，与 map 同尺寸但**不动地形字符**）。先做第 1/3 章示范：1 章东侧山脊（x12~14）台地、首领 (13,2) 海拔 2；3 章北岸渡口台地、水鬼 (12,1) 海拔 2，河面与两座木桥保持 0。旧章节无此字段 → 全 0 兼容。
- **判定**（常量在 `data-systems.js`：HEIGHT_HIT_HIGH 15 / HEIGHT_HIT_LOW -15 / HEIGHT_RANGE_BONUS 1）：`combat.js` 新增 `heightAt/heightMod` 纯函数，经 `ctx.heightAt(x,y)` 读高度（旧测试场无此函数视为全 0，**公式行为零变化**）。高打低：命中 +15、射程上限 +1（`canAttackRange`/`canCounter` 均吃，反击同口径）；低打高：命中 -15；等高无。`hitChance` 计入 hm.hit；`forecast` 输出 `height:{diff,high,low}`；`dangerZone` 对高地停留点多算一圈（只加更低的格子）；`resolve` 全链传 ctx。**法术刻意不吃高低差**（射程与判定从简）。
- **编排**：`battle.js` `heightGrid(ch)` 建 8×16 数字网格（createState 建、applyState 按章节重算——高度是静态数据**不进快照**，旧存档自动兼容）；`combatCtx` 暴露 `heightAt`；`attackTargets`/连携/AI `bestEnemyAttack`/`recomputeDanger` 全部走高度判定；`attackRangeTiles` 让攻击高亮多画那一圈。
- **渲染**：`render.js` 按高度层**从低到高**绘制（painter 次序：南侧高台自然遮住北侧坡脚）；每层上移 `riseUnit = round(tile×0.38)`（2 层 0.76 格 < 1 格，不会整格吞掉北邻格）；`drawHeightBase` 画悬崖竖面 + 竖纹 + 等高墨线 + 台口描边，**竖面只延伸到南邻台面顶边**（同高无缝、南邻更高被遮、出界露崖）；高台台面罩一层暖白受光。`tileCenter/tileXY/toTile/drawUnit/ranges/cursor/floats` 全接入高度偏移；`toTile` 按候选格「抬高后矩形」反算（0~2 层都试）。`juice.js _py` 同步上移，命中粒子跟随高台。
- **UI**：战斗预测标签「高地（命中 +15 · 射程 +1）」/「低地（命中 -15）」。
- 测试：formulas 第 39 节 28 条（常量/heightMod/命中三态/射程/反击/预测/危险圈/resolve 全链）；test-logic 数据校验 + 静态断言（3612）；smoke 端到端（heightGrid 回退钳位、射程三态、快照兼容、渲染抬升、toTile 反算）。
- **坑**：① `mkUnit` 的 `stats` 是**覆盖语义**（`Object.assign(base, o)` 会先用 o.stats 换掉 base.stats），传部分 stats 会丢其他属性——测试里要传全量；② 冒烟后段区块会**重开第 1 章**，sandbox 变体也走在有 height 的分支，无 height 章的回退改用 `Battle.heightGrid({})` 纯函数直接测；③ 纯垂直上移方案下**投影必然被台面+竖面完全遮住**（死代码），已删——视觉高低差靠上移+悬崖+受光三层表达；④ diff 输出里出现过 `2m+` 前缀是终端 artifact，文件内容是干净的。

### ✅ 背侧判定（提交 `d5da483`，四连全绿：3626 / 1716 / 冒烟双变体）

- **常量**（`data-systems.js`）：BACKSTAB_HIT 15 / BACKSTAB_CRIT 20 / SIDE_HIT 5 / SIDE_CRIT 10。
- **判定**（`combat.js`）：单位 `facing`（0 上 / 1 右 / 2 下 / 3 左）；`facingOf` 缺省按阵营回退（我军朝北、敌军朝南——**开局隔空相向不白送背刺**）；`facingAngle`（atan2 归一化到 [0,π]）；`backstabMod` 三级：≥135° 背刺（命中 +15 / 暴击 +20）、≥45° 侧击（+5 / +10）、其余正面无。**只进 hitChance/critChance，不动伤害**；`forecast` 输出 `backstab`/`backstabCounter`；**法术刻意不吃背侧**（`spellAttack` 不含判定）。
- **更新时机**（`battle.js`）：`facingFromDelta(dx,dy)` 位移→朝向（斜向按主轴，先横后竖）；移动收尾按最后一步转向（原地不动不改）；`faceToward` 出手时面向目标——`performCombat` 与连携一击都转；生成默认朝向我军 0 / 敌军 2。
- **渲染**：`render.js` 单位盘面前缘一枚浅色尖角随 facing 转动（`Combat.facingOf` 回退兜底）。
- **UI**：预测标签「背刺（命中 +15 · 暴击 +20）」/「侧击（命中 +5 · 暴击 +10）」/「敌方反击背刺|侧击」。
- **P1 不做 AI 主动绕背**：AI 选格吃的是 forecast 数值（已含修正），自然偏好背刺格，无需专门寻路。
- 测试：formulas 第 40 节 30 条（facingOf 回退/facingAngle 三级/backstabMod/命中暴击修正/伤害不变/预测字段/法术免疫/resolve 全链）；test-logic 背侧公式节 + 静态断言（3626）；smoke 端到端（重开第 1 章验默认朝向、facingFromDelta 四向+斜向、faceToward、暴击 +20）。
- **坑**：① 批量给旧测试摆位加 `facing` 时**几何容易想反**——攻方在守方正西，守方要朝西（`facing: 3`）才是正面，朝东反而是背刺；② smoke 后段区块的默认朝向断言会**被前文测试的出手转向污染**，要在区块内重开一章拿干净状态；③ `grep` 的 `\|` 是 GNU 扩展，macOS BSD grep 不认，搜中文关键词会静默无输出。

### ✅ 打击感音效加厚（提交 `0e52f08`，四连全绿：3626 / 1716 / 冒烟双变体）

用户反馈「声音软面无力、没有金属碰撞感、死亡音效差、移动没脚步声」。根因：旧命中音以低频 sine 下滑为主、包络走指数斜坡（慢启动 = 软），缺瞬态与金属共振。

- **新原语**（`audio.js`）：`clang(base, vol, delay)` 金属撞击三层——高通白噪声 8ms 瞬态（**直角 attack**）+ 非谐共振峰 `base×[1, 2.37, 4.11]`（间距不和的整数比才有金属味）+ `base×0.28→0.16` 低频 body；`growl(dur, f0, f1, vol, delay)` 妖物嘶吼（锯齿下滑 + 每 60ms 颤音破平滑感 + 带通噪声呼气）。
- **命中音重做**：`hit_flesh`/`hit` = crunch + body + 闷响；`hit_metal`（`hit_armor` 同名保留，SFX 文件池兼容）双 clang 主打；`hit_wood` 木腔共鸣；`hit_crit` clang 双拍「铛！铛！」+ duck 静音一拍。
- **新增**：`foe_hit`（妖物受击嘶吼）/ `foe_death` / `boss_death` / `death_hero` 加重（披甲倒地闷响 + 远钟）/ 五路脚步 `step_foot·armor·beast·fly·horse`。
- **分流**（`battle.js` 三个 helper）：`hitSfxFor`（妖物嘶吼 / 对披甲金铁 / 杖与木腔 / 肉身）、`deathSfxFor`（我军 / Boss / 妖物 / 人类敌军）、`stepSfxFor`（按 `moveType`：flying/beast·plant·amphibious/horse/armor tag/foot）。移动接线点由 UI 味的 `move` 音换成行进脚步（路程 ≥5 格半程补第二拍）。
- 测试：test-logic 打击感静态断言 15 条；smoke WebAudio 桩行为测试（clang = 4 osc + 1 瞬态 buffer、growl = 1 osc + 1 buffer、三路分流全枚举）。**桩坑**：vm 缺 `setInterval`（此前 ctx=null 从未走到合成音乐路径）；`Audio.failed` 是终身标记，注入桩前必须复位；fake ctx 测完要撤掉并恢复无声态，否则后文 `Battle.start` 的 BGM 回退会真起 timer 挂住进程。

### 🔄 接下来：技能演出（任务 #8）

15 条法术各一套释放演出（代码粒子 + 音效 + 立绘切入），挂在 `battle.js chooseSpellTarget` 咏唱确认后的施法编排上。之后：军议卡/结算摘要 → A 战略层 / D 宿命脚本 → B 薪火 / E 军令声望 / F 机动 → C 圣脉 → H-P2/P3 图标。

### ⬜ 之后再排

军议卡/结算摘要 → A 战略层 / D 宿命脚本 → B 薪火 / E 军令声望 / F 机动 → C 圣脉 → H-P2/P3 图标。
---

## 1. 一分钟上手

```bash
cd /Users/niekai/Documents/ai-game/shanhaice

# 1) 看现状
git log --oneline -5 && git status

# 2) 跑全部验证（约 10 秒，必须全绿再动代码）
node dev/test-logic.js          # 期望：3626 通过，0 失败
node tests/formulas.test.js     # 期望：1716 通过 / 0 失败
node dev/smoke-boot.js          # 期望：冒烟通过：无引用错误
node dev/smoke-boot.js sandbox  # 期望：同上（沙盒变体）

# 3) 起服务试玩
node dev/serve.js               # http://127.0.0.1:4173/
```

**工作区已迁到本目录。** 以前散落在 `~/WorkBuddy AI/2026-10-23-22-40-08/` 的文档全部搬进了 `docs/`，素材源图搬进 `art-source/`（已 gitignore）。新账号请直接把本目录当工作区。

---

## 2. 现在做到哪了

| 里程碑 | 状态 | 说明 |
| --- | --- | --- |
| P0 基线固化 | ✅ | tag `v0.9-baseline`、数值回归测试、dev 工具链 |
| P1.1 阵眼升阶 | ✅ | `27eff28` 起，节点 3 阶、驻守推进 |
| P1.2 地形动态层 + 冰面滑行 | ✅ | `js/systems/terrain.js`，覆盖层 `B.overlays` |
| P1.3 敌方精英词缀 | ✅ | `25fdc74` 护盾/自愈/光环/狂暴 |
| P1.4 双人连携 + 指挥技 | ✅ | `5edc5c9` 号令/集火/坚守 |
| P1.5 五行法术 | ✅ | 并入「P2 承」`14cdcc5`：15 条法术、相克 1.25/0.8、次数、aoe、Boss 持法 |
| P1.6 武器强化 +3 / 传送武器 | ✅ | `ef7f9b6` / `fb60d66` |
| P1.7 悔棋快照 + 三档难度 | 🟡 | 快照已含 `overlays`/`nodes`/`rng`；三档难度只有数值定义，未专门复核平衡 |
| P2.1 转职分支 | ✅ | 12 个基础职业全部双线（新增裂阵剑士/裂山斧王/金针医/连珠射手/铁壁枪卫/焚天术士/千面刺客/镇煞符师/兽语者/翎羽卫） |
| P2.2 技能继承 + 个人技 ×2 + 熟练度 S | ✅ | 12 人各两条个人技（`personal2`）；转职继承原职业技能（`inherited` 上限 2、先进先出、同名取大）；熟练度按出手次数成长（40 次升一阶，跨章累加，S 封顶） |
| P2.3 武器进化树 + 传说武器 | ✅ | 传说 7 把全链路 + 强化 +3 + **进化树 13 条**（铁→钢→银/名器，保留强化、耐久刷满） |
| P2.4 召唤三阶 + 新角色 | ✅ | `5c0fe76`：异兽/灵兽/神兽、场上 ≤2、三态指令；姜姒（召唤）虞素秋（歌者）双职业线 |
| **P3.1 A/B 路线分歧** | ✅ | `e75b24d` 第 4 章末分线，各 3 章 + 第 8 章汇合 |
| **P3.2 心结 + 支援扩到 12 组** | ✅ | 支援 12 组（新增云策×墨鸦/云策×白鹭/岩隈×阿蛮/青萝×玄漪）；A 线挂赤桑「空谷」、B 线挂墨鸦「旧影」，未解 -5 命中，支援 A 级了断，全解终章全队 +5/+5 |
| P3.3 替补援军 / 殉志传承 / 英魂碑 | ✅ | 谢无衣（符）/ 滕大戈（重刃）第 5 章末双线必得、等级对齐队伍平均；阵亡把个人技 + 传说兵装传给支援最高者（类型不符封存）；营地「英魂」页签列生平/遗言/传承 |
| P3.4 多结局 + 山海图鉴 + 勇者模式 | ✅ | 三档尾声（灵脉重燃/山河如旧/永夜）按存活×A 级羁绊×阵眼全控判定；图鉴 29 条五类、击破解锁；勇者模式与难度正交（敌军 ×1.15 / 悔棋 0 / 无预测 / 授徽） |
| P3.5 三幕剧情 + 戏眼 | ✅ | 12 章各三幕（intro 9 句 / mid 8 句 / outro 10 句）；`chapter.mids` 按回合触发第二幕，`midsPlayed` 进快照（悔棋不重播）；`DIALOGUES` 35 条 187 句 → 47 条 373 句（7868 字） |
| P4 视听包装 | 🟡 | 已做：对白演出指令（`fx`/`sfx`/`wait`，22 处戏眼挂演出）、新手引导（5 条一次性提示按回合点播）。未做：横版战斗演出、图标化、机制说明库、人物关系图 |
| P5 平衡、P6 回归与文档终稿 | ⬜ | |

> 图例：✅ 已完成 ／ 🟡 部分完成（缺口见右栏）／ ⬜ 未开始。P2 那批当时并进「P2 起 `e00ca0b`」「P2 承 `14cdcc5`」两个提交，没有单独成行，别误以为跳过了。

**🟡 遗留缺口**：① 支援 S 级「决意」；② P1.7 三档难度平衡复核（留给 P5）。P2 整条已收口。

**当前可玩内容**：12 张地图（1/2/3/4 → 5A/6A/7A 或 5B/6B/7B → 8 → 9）、14 名角色（12 主力 + 2 替补援军）、12 组支援与心结、双路线完整通关、三档结局、29 条图鉴、勇者模式、每章三幕剧情（含戏眼与章尾钩 + 震屏/闪白/压暗演出）、5 条新手引导，词缀/连携/指挥/传送武器/强化/进化/转职/继承/殉志传承全部接入。存档键 `shanhaice.*.v4`。

美术缺口：白鹭、云翎的 resolve 立绘与图标待重绘（用户在自行处理水印）；`art-source/` 里 140 张 PNG 原稿尚未全部接入游戏（游戏内用的是 `assets/portraits/*.svg` 程序生成图 + `assets/icons/weapons/*.png`）。

---

## 3. 下一步做什么（P4 视听包装）

P4 做了两件（演出指令 + 新手引导），还剩四件。P5/P6 在后面等着。

### 3.1 P4 已完成

1. **对白演出指令**（`dcc3ba5`）：`UI.dialogue` 的行支持 `fx`（`shake`/`flash`/`dim`/`lit`）、`sfx`、`wait` 三个字段，缺省即无演出。白名单在 `data-maps.js` 的 `DIALOGUE_FX`/`DIALOGUE_SFX`，formulas 第 32 节会读 `js/audio.js` 源码校验音效名。22 处戏眼已挂演出。
2. **新手引导**（`5397043`）：`HINTS` 五条 + `HINT_TURNS` 点播表（2~6 回合），`Game.hintOnce(key)` 记 `campaign.hintsSeen`，整个战役只弹一次。文案只讲操作不讲剧情。

### 3.2 P4 还剩什么

1. **横版战斗演出**：新建 `js/render-battleview.js`——攻击时切到横版画面，两侧立绘对峙 + 底部克制/弱点条，播完再回棋盘。改动集中在 `render.js` 与 `battle.performCombat` 的演出钩子，注意别把公式搬过去。
2. **图标化**：技能/状态/阵眼阶位现在都是文字，缺图标位。走 SVG 程序图（`assets/icons/` 里武器图标是 PNG，别再进 PNG）。
3. **机制说明库**：营地加「机制」页签，约 28 条（战场/战斗/成长/战役四组），文案照 `docs/山海策-灵脉-升级方案.md` 写但**必须与常量对齐**（图鉴那次就因为照着方案写、没查常量，三条数值全错）。
4. **人物关系图**：支援 12 组已有 `SUPPORTS`，画成关系网即可。

### 3.3 之后再排

P5 平衡（三档难度实测 + 成长曲线）、P6 回归与文档终稿；长期缺口：支援 S 级「决意」、P1.7 三档难度平衡复核。

**工程习惯（此前每个 sprint 都是这个流程）**：改完 → 四个测试命令全绿 → `git commit`（中文信息，正文列改动点）→ 更新 `docs/开发计划.md` 进度记录与提交链 → 追加 memory 日志。

---

## 4. 代码地图

| 文件 | 职责 | 改动注意 |
| --- | --- | --- |
| `index.html` | 脚本加载顺序 | **新增 js 文件必须在这里按依赖顺序加 `<script>`**，否则 file:// 直接白屏 |
| `js/data-core.js` | 职业、武器、角色、敌型、支援、难度、地形 | 常量表，改数值先看这里 |
| `js/data-maps.js` | 12 张地图、目标、事件、对白、`AUTO_JOINS` | 地图固定 16×8；字符与实体坐标必须一一对应 |
| `js/data-systems.js` | 法术、传说武器、召唤、词缀、指挥技 | 新系统常量放这里 |
| `js/combat.js` | **所有战斗公式**（命中/伤害/必杀/追击/减伤） | 公式只许写在这里，别在 battle.js 里另算 |
| `js/battle.js` | 战斗流程、阶段、AI、阵眼、悔棋、连携、指挥 | 最大的文件，改动集中区 |
| `js/render.js` | Canvas 绘制与演出 | |
| `js/ui.js` | HUD、对话、弹层、战报、预测 | `chapterLabel(ch.no)` 统一章号显示 |
| `js/camp.js` | 营地、编成、商店、转职、打造 | |
| `js/game.js` | 战役推进、章节结算、存档、分歧选择 | 章节一律用 chapterId，不再用数组下标 |
| `js/systems/route.js` | A/B 路线定义、章节链、旧档迁移 | `Route.byId / order / nextId / seedOf` |
| `js/systems/*.js` | terrain / spells / summon / smith / legendary 等 | 系统模块化 |
| `tests/formulas.test.js` | 数值回归（1432 条） | 纯函数为主，Node + vm 直接加载 |
| `dev/test-logic.js` | 规则与数据完整性（3178 条） | 数据改动必跑 |
| `dev/smoke-boot.js` | 启动冒烟，含 `sandbox` 变体 | 断言真实流程，不是单元测试 |
| `dev/serve.js` | 本地静态服务器 | |
| `dev/cdp.js` | CDP 调试与截图 | 需要浏览器开 9222 端口 |
| `docs/` | 全部设计文档 | 见 §7 |
| `art-source/` | PNG 素材原稿（536M，不进库） | `manifest.json` 是交付清单 |

---

## 5. 工程红线（违反即返工）

1. **纯静态**：vanilla JS + 多 `<script>` 标签，无构建、无依赖、**`file://` 必须能跑**。
2. **公式只在 `combat.js`**。battle/ui 只调用，不自己算命中伤害。
3. **章节 id 是 chapterId**（`1/2/3/4/'5A'/'6A'/'7A'/'5B'/'6B'/'7B'/8/9`），人读章号在 `ch.no`。任何 `CHAPTERS[id - 1]` 的写法都是 bug。
4. **地图字符与实体坐标必须一一对应**（`L` 阵眼 / `v` 村 / `C` 宝匣 / `S` 祠堂 / `G` 增援 / `E` 突围口）。`dev/test-logic.js` 的「与地图一致」组就是守这个的。
5. **存档兼容**：改存档结构就升 `SAVE_VERSION` 并在 `Route.migrateLegacyChapter` / `normalizeCampaign` 里写迁移。
6. **改数据先跑 `dev/test-logic.js`，再跑冒烟**。

---

## 6. 踩坑清单（都是真金白银踩出来的）

- **vm 沙箱有独立的 `Math`**：在 Node 外层改 `Math.random` 对 vm 里的代码无效。要在沙箱内打补丁：
  `vm.runInContext('globalThis.__orig = Math.random; Math.random = () => 0.99', ctx)`，用完还原。否则传说掉落这类概率断言会偶发 flaky。
- **`mkUnit` 默认 `id: 't'`**：多个单位一起造会 id 撞车，光环「排除自己」之类的逻辑会误判。要显式给不同 id。
- **`mkUnit` 默认 `weaponIndex: 0`**：测 `Combat.weaponOf` 的自动优选时，先把它置 `-1`，否则直接短路。
- **真实角色 ≠ 测试假单位**：鹿鸣只有 `staff: 'C'` 的武器 rank，给她塞铁剑 `weaponOf` 会返 null、射程判定全灭。smoke 用真实角色前先查 `ranks` / 武器类型。
- **曼哈顿距离不是欧氏**：连携 `CHAIN_RANGE 2` 是曼哈顿，斜角 (3,3)→(4,4) 距离是 2 不是 1.41。摆位要手算。
- **测试里的 `+chId` 陷阱**：`+'5A'` 是 `NaN`，`CHAPTERS[NaN]` 永远 undefined。按 id 比对。
- **两套测试都要同步**：`dev/test-logic.js`（数据/规则）与 `tests/formulas.test.js`（公式）是独立的两套，改数据只跑一套会漏。P3.1 就是只更了 test-logic，formulas 留了 9 条失败。
- **破盾逻辑位置**：`performCombat` 里破盾判定要在 `if (ev.hit)` 主层，不能嵌在 `if (wsk)` 传奇武器分支里（曾因此只在传奇武器触发时才破盾）。
- **换位武器要先捕获武器引用**：`swapWeapon` 在 `resolve` 之前捕获，否则耐久耗尽后引用丢了，认不出是哪把武器。
- **`skillFieldsOf` 是覆盖语义**：`Object.assign` 会让后加的技能把前面的同名字段压下去（兽使的 `summon: true` 就被个人技②的 `summon: 1` 覆盖过）。P2.2 起个人技②/继承技改走 `mergeSkillMax`「同名字段取较大值」；往技能里加数值字段前，先想清楚它该覆盖还是该取大。
- **`normalizeUnitRecord` 是重建不是合并**：它返回全新对象，战报里没带的字段会被抹成默认值。所以 `inherited` / `rankPts` 这类「只增不减」的字段必须显式透传 `prev`，否则普通章节一结算就把继承技洗掉了。
- **幕间对白靠 `chapter.mids` 的 key 找 `DIALOGUES`**：键名写错不会报错，只会静默标记已播、永远不弹。改对白键名时 `data-maps.js` 的 `mids` 必须同步（formulas 第 31 节会红）。
- **`B.midsPlayed` 必须进快照**：它和 `mainHoldCount` 一样是「阶段性进度」，漏了序列化就会一悔棋就重播第二幕。加这类一次性演出标记时，`serialize` 与 `applyState` 两处都要动。
- **新说话人要先登 `DIALOGUE_NPCS`**：`DIALOGUES` 的 `who` 不是任意字符串，formulas 第 31 节按「`CHARS` 人名 ∪ `DIALOGUE_NPCS`」校验，写错名字（岩隈 → 岩隗）会直接红。
- **`UI.toast` 是覆盖式不是排队式**：同一时刻只能显示一条，后弹的会把前一条顶掉。所以新手引导刻意避开第 1 回合（那时要弹章节目标提示），并且延迟 600ms 让回合横幅先出。往战斗流程里加提示前先想清楚会不会互相顶。
- **音效键写错是静默失声**：`Audio.sfx` 的 `default` 分支只给一个轻响，不报错。formulas 第 32 节直接读 `js/audio.js` 源码找 `case '<name>':`，所以往 `DIALOGUE_SFX` 加名字必须同步 `audio.js` 的 switch。
- **`fx` 类要清干净**：`fx-dim` 是持续态，靠 `lit` 或 `_finishDialogue` 复位。加新的持续态动效时，两处都要清，否则会漏到下一段对白甚至战斗界面。

---

## 7. 文档索引

| 文档 | 用途 |
| --- | --- |
| `docs/开发计划.md` | **里程碑与进度以它为准**，末尾有完整提交链 |
| `docs/山海策-灵脉-升级方案.md` | 系统设计全文（阵眼/词缀/连携/指挥/路线/心结/叙事/世界观） |
| `docs/绘图提示词库.md` | 美术出图提示词 |
| `docs/待生成素材清单.md`、`docs/剩余素材提示词.md` | 缺口素材与对应提示词 |
| `docs/传说武器图标提示词.md` | 武器图标专用 |
| `docs/战斗演出立绘提示词.md` | 战斗演出立绘 |
| `art-source/manifest.json` | 素材交付清单（文件名 / 状态 / 水印说明） |

---

## 8. 提交链（新 → 旧）

`0e52f08`（打击感音效加厚）← `89a8bae`（背侧判定文档）← `d5da483`（背侧判定：facing + 背刺/侧击）← `44e2b72`（高低地形差文档）← `39680a8`（二期高低地形差）← `875dcc6`（音频架构）← `017c77f`（H-P1 物品图标）← `ff46190`（G 打击感）← `0a200c3`（死亡定格）← `165302c`（攻击不耗移动力）← `5397043`（P4.2 新手引导）← `dcc3ba5`（P4.1 对白演出指令）← `300b992`（P3.5 三幕剧情）← `3fa5c78`（P3.5 文档）← `a3bacd4`（P3.4 文档）← `f2b01f4`（P3.4 山海图鉴）← `630151a`（P3.4 多结局+勇者模式）← `56acdd2`（P3.3 替补援军+殉志传承+英魂碑）← `d8d4596`（HANDOFF 同步）← `b28d8c1`（P2.2 个人技×2+继承+熟练度）← `c130de8`（P3.2 心结+支援12组）← `02fc047`（smoke 转职端到端）← `8036e28`（P2.1 双转职线+P2.3 进化树）← `9e687ea`（formulas 路线化）← `401ffed`（文档迁入 docs/）← `e75b24d`（A/B 路线）← `5edc5c9`（连携+指挥）← `25fdc74`（敌方词缀）← `fb60d66`（传送武器）← `ef7f9b6`（强化 +3）← `1aa370c` ← `e89a36e` ← `813525f` ← `667d829` ← `e309688` ← `5c0fe76` ← `bc5eeb2` ← `9182c3a` ← `14cdcc5` ← `e00ca0b` ← `27eff28` ← `6fc0bb5` ← `aae6375`

---

## 9. 协作约定（用户的偏好，别踩）

- 验证用 **Safari**，不要用 Chrome；**不要主动截图**。
- 节奏要快：做完一项立刻跑测试 → 提交 → 更新文档，不要停下来等确认。
- 用户会直接指出「试玩跟基础版没区别」这类体验问题——**先修体验，再谈架构**。
- 中文回复，提交信息也用中文，正文列具体改动点。
- 每个 sprint 结束追加一条 memory 日志（`.workbuddy-ai/memory/YYYY-MM-DD.md`），写清坑。
