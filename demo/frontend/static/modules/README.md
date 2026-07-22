# Frontend Modules Scaffold

这个目录是 DDP 主前端壳的拆分准备区。

当前说明：

- 这里先放 **稳定 contract / registry / runtime scaffold**
- 其中 `core/module_registry.js` 与 `core/runtime_contract.js` 当前是 **reference-only contract scaffold**
- 它们**不**属于当前页面运行时加载链
- 还没有把主站直接切换成 `type="module"` 运行
- 当前生产入口仍然是：
  - [demo/frontend/static/app.js](/Users/Ruoci/Desktop/fiamma🔥/DDP/demo/frontend/static/app.js)

## 为什么先这样做

因为当前主任务不是一口气推倒 `app.js`，而是先把以下东西冻结：

- 模块边界
- 共享 state / cache contract
- 主线程与 authority/search/UI 线程的接缝

等这些边界钉住后，再逐步搬运具体 panel 逻辑。

## 当前已落地的准备文件

### `core/module_registry.js`

记录：

- 模块 id
- owner
- 迁移 phase
- 依赖关系
- 每块的职责

注意：

- 当前只是线程协作与主壳拆分的参考注册表
- 不是浏览器运行时真正 import/执行的模块

### `core/runtime_contract.js`

记录：

- manifest 稳定字段
- line payload 稳定字段
- record store 稳定字段
- sample 级 cache key
- jump contract

注意：

- 当前只是稳定字段与路径约定的参考文件
- 不是浏览器运行时真正 import/执行的模块

## 当前工作原则

- authority/search/UI 线程不要在这里自行发明另一套 bootstrap 结构
- 主线程先维护这些 contract scaffold
- 后续真正拆 `app.js` 时，先从低副作用 shared layer 开始
