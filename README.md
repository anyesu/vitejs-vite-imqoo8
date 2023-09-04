### Describe the bug

```
GET http://localhost:5173/node_modules/.vite/deps/element-ui_lib_button.js?v=bc3e4ba5 504 (Outdated Optimize Dep)
```

On my project built with [vue-element-admin](https://github.com/PanJiaChen/vue-element-admin) , this error sometimes occurs when using the `vite --force` to start the project, so the page displays a white screen. However, the error disappears when restart the project again. Although this way can solve the problem, it is quite annoying to have this error from time to time.

**The reason for this problem is that the id will be changed through [tryOptimizedResolve in vite:resolve](https://github.com/vitejs/vite/blob/v4.4.9/packages/vite/src/node/plugins/resolve.ts#L337-L351) , but the optimizer does not actually pre-build the corresponding file because there is [no outdatedResult](https://github.com/vitejs/vite/blob/v4.4.9/packages/vite/src/node/optimizer/optimizer.ts#L651-L681) .**

The timing of this problem is random ( maybe related to the complexity of the project files ) , and it is difficult to reproduce it stably. However, after repeated trials, I finally found a specific situation that can definitely cause this problem:

- Any url except `/` and `/favicon.ico` which can trigger additional [transformRequest in transformMiddleware](https://github.com/vitejs/vite/blob/v4.4.9/packages/vite/src/node/server/middlewares/transform.ts#L203-L205) , .e.g `/xxx` . **This is very important!**

  https://github.com/vitejs/vite/blob/898fee7ac3283b526377e4515c03562018478592/packages/vite/src/node/server/middlewares/transform.ts#L44

  https://github.com/vitejs/vite/blob/898fee7ac3283b526377e4515c03562018478592/packages/vite/src/node/server/middlewares/transform.ts#L56-L58

  https://github.com/vitejs/vite/blob/898fee7ac3283b526377e4515c03562018478592/packages/vite/src/node/server/middlewares/transform.ts#L203-L205

- Import statements dynamically added by plugins as what [unplugin-auto-import](https://www.npmjs.com/package/unplugin-auto-import) does, they cannot be optimized by [crawl of static imports](https://github.com/vitejs/vite/blob/v4.4.9/packages/vite/src/node/optimizer/optimizer.ts#L197) and will trigger [addMissingDep during transform](https://github.com/vitejs/vite/blob/v4.4.9/packages/vite/src/node/optimizer/optimizer.ts#L541) .

  https://github.com/vitejs/vite/blob/898fee7ac3283b526377e4515c03562018478592/packages/vite/src/node/optimizer/optimizer.ts#L541

- The slow [transformIndexHtml](https://github.com/vitejs/vite/blob/v4.4.9/packages/vite/src/node/server/middlewares/indexHtml.ts#L62-L64) which is used to increase the time interval between the first request `/xxx` and [preTransformRequest](https://github.com/vitejs/vite/blob/v4.4.9/packages/vite/src/node/server/middlewares/indexHtml.ts#L348) .

  https://github.com/vitejs/vite/blob/898fee7ac3283b526377e4515c03562018478592/packages/vite/src/node/server/middlewares/indexHtml.ts#L348-L365

- [Pre-build a large scss file](https://github.com/vitejs/vite/issues/7719#issuecomment-1098683109) ( .e.g [element-ui](https://github.com/ElemeFE/element/blob/v2.15.14/packages/theme-chalk/src/index.scss) ) which may cost a few seconds to make the optimize step slower.

Sorry for my poor Chinglish, but I think you can understand what I mean after running the demo below.

### Reproduction

https://stackblitz.com/edit/vitejs-vite-imqoo8?file=vite.config.js

### Steps to reproduce

In order to better observe the problem, I added a [patch file](https://github.com/anyesu/vitejs-vite-imqoo8/blob/main/patches/vite%2B4.4.9.patch) created with [patch-package](https://www.npmjs.com/package/patch-package) to show more logs.

![vite-bug](https://github.com/vitejs/vite/assets/48339798/17e60cba-c505-4166-ac80-319d99abb61f)

```bash
pnpm i
pnpm run dev
```

Open the browser and visit the page, you can see nothing and will find `504 (Outdated Optimize Dep)` error in devtools.

Then you can see the following log in terminal:

```diff
  Forced re-optimization of dependencies
    vite:deps scanning for dependencies... +0ms

    VITE v4.4.9  ready in 986 ms

    ➜  Local:   http://localhost:5173/
    ➜  Network: use --host to expose
    ➜  press h to show help
+ call delayDepsOptimizerUntil('/not_root') 0ms after the last
+ call markIdAsDone('/not_root') 0ms after the last
    vite:deps Crawling dependencies using entries:
    vite:deps   /home/projects/vitejs-vite-imqoo8/index.html +0ms
    vite:deps ✨ static imports crawl ended +871ms
+ metadata.discovered ( size: 1 ) : element-ui/packages/theme-chalk/src/index.scss
    vite:deps Scan completed in 927.22ms: no dependencies found +95ms
+ metadata.discovered ( size: 1 ) : element-ui/packages/theme-chalk/src/index.scss
+ call delayDepsOptimizerUntil('main.js') 177ms after the last
+ call delayDepsOptimizerUntil('node_modules/.vite/deps/element-ui_lib_button.js?v=1d7c7005') 10ms after the last
    vite:deps Dependencies bundled in 1216.69ms +0ms
+ metadata.discovered ( size: 2 ) : element-ui/packages/theme-chalk/src/index.scss, element-ui/lib/button
    vite:deps ✨ using post-scan optimizer result, the scanner found every used dependency +1s
    vite:deps ✨ dependencies optimized +1ms
+ call delayDepsOptimizerUntil('node_modules/.pnpm/vite@4.4.9_sass@1.66.1/node_modules/vite/dist/client/client.mjs') 1175ms after the last
+ call delayDepsOptimizerUntil('node_modules/.pnpm/vite@4.4.9_sass@1.66.1/node_modules/vite/dist/client/env.mjs') 3ms after the last
+ call delayDepsOptimizerUntil('node_modules/.vite/deps/element-ui_lib_button.js?v=1d7c7005') 405ms after the last
```

> If you run the project multiple times, you will find that the order of the logs may be different.

According to the log we can find two things:

- The `delayDepsOptimizerUntil('main.js')` was called 177ms after the `delayDepsOptimizerUntil('/not_root')` be called.

  This time difference exceeds [callCrawlEndIfIdleAfterMs](https://github.com/vitejs/vite/blob/v4.4.9/packages/vite/src/node/optimizer/optimizer.ts#L718) so the [onCrawlEnd](https://github.com/vitejs/vite/blob/v4.4.9/packages/vite/src/node/optimizer/optimizer.ts#L612) was called earlier than expected.

- The length of `metadata.discovered` was changed from 1 to 2.

  When [this line of code](https://github.com/vitejs/vite/blob/v4.4.9/packages/vite/src/node/optimizer/optimizer.ts#L622) was executed, the actual length of `crawlDeps` is 1, which is the same as `scanDeps` , so it goes to else ( `using post-scan optimizer result...` ) .

  https://github.com/vitejs/vite/blob/898fee7ac3283b526377e4515c03562018478592/packages/vite/src/node/optimizer/optimizer.ts#L622-L635

Then we can change the content of the vite.config.js file:

```diff
- process.env.NO_SLOW || slowTransformIndexHtml(),
+ // process.env.NO_SLOW || slowTransformIndexHtml(),
```

vite will restart automatically, and then we will look at the logs afterwards:

```diff
  [vite] vite.config.js changed, restarting server...
  Forced re-optimization of dependencies
    vite:deps scanning for dependencies... +25m
  [vite] server restarted.
+ call delayDepsOptimizerUntil('/not_root') 0ms after the last
+ call markIdAsDone('/not_root') 0ms after the last
    vite:deps Crawling dependencies using entries:
    vite:deps   /home/projects/vitejs-vite-imqoo8/index.html +25m
+ call delayDepsOptimizerUntil('main.js') 823ms after the last
    vite:deps Scan completed in 928.80ms: no dependencies found +99ms
+ call delayDepsOptimizerUntil('node_modules/.vite/deps/element-ui_lib_button.js?v=e80a6e76') 100ms after the last
+ call markIdAsDone('/home/projects/vitejs-vite-imqoo8/main.js') 922ms after the last
    vite:deps ✨ static imports crawl ended +988ms
+ metadata.discovered ( size: 2 ) : element-ui/packages/theme-chalk/src/index.scss, element-ui/lib/button
+ metadata.discovered ( size: 2 ) : element-ui/packages/theme-chalk/src/index.scss, element-ui/lib/button
    vite:deps Dependencies bundled in 1137.07ms +25m
+ metadata.discovered ( size: 2 ) : element-ui/packages/theme-chalk/src/index.scss, element-ui/lib/button
    vite:deps ✨ new dependencies were found while crawling that weren't detected by the scanner +1s
    vite:deps ✨ re-running optimizer +0ms
    vite:deps new dependencies found: element-ui/packages/theme-chalk/src/index.scss, element-ui/lib/button +6ms
    vite:deps Dependencies bundled in 1032.49ms +1s
    vite:deps ✨ dependencies optimized +1s
+ call delayDepsOptimizerUntil('node_modules/.vite/deps/chunk-76J2PTFD.js?v=b0e72c20') 2196ms after the last
+ call delayDepsOptimizerUntil('node_modules/.pnpm/vite@4.4.9_sass@1.66.1/node_modules/vite/dist/client/client.mjs') 4394ms after the last
+ call delayDepsOptimizerUntil('node_modules/.pnpm/vite@4.4.9_sass@1.66.1/node_modules/vite/dist/client/env.mjs') 2ms after the last
```

The length of `metadata.discovered` was no longer changed, and the [re-running optimizer](https://github.com/vitejs/vite/blob/v4.4.9/packages/vite/src/node/optimizer/optimizer.ts#L671-L672) step was executed as expected.

Open the browser and visit the page, you can see `Hello,World!` and no error in devtools.

**Another strange thing here is that the `delayDepsOptimizerUntil('main.js')` was called 823ms after the previous, which looks like pre-build of scss was run before.**

### System Info

```shell
System:
    OS: Windows 10 10.0.19045
    CPU: (16) x64 11th Gen Intel(R) Core(TM) i7-11700 @ 2.50GHz
    Memory: 26.00 GB / 47.81 GB
  Binaries:
    Node: 16.20.2 - ~\AppData\Local\pnpm\node.EXE
    Yarn: 1.22.18 - D:\software\nodejs\node_global\yarn.CMD
    npm: 8.19.4 - ~\AppData\Local\pnpm\npm.CMD
    pnpm: 8.6.12 - ~\AppData\Local\pnpm\pnpm.EXE
  Browsers:
    Edge: Spartan (44.19041.1266.0), Chromium (116.0.1938.69)
    Internet Explorer: 11.0.19041.1566
```

### Used Package Manager

pnpm

### Logs

_No response_

[Edit on StackBlitz ⚡️](https://stackblitz.com/edit/vitejs-vite-imqoo8)
