# mini-mvvm
通过自己实现的mvvm一共包含了以下东西：
1. 通过Object.defineProperty的get和set进行数据劫持
2. 通过遍历data数据进行数据代理到this上
3. 通过{{}}对数据进行编译
4. 通过发布订阅模式实现数据与视图同步
5. 顺带写了computed和mounted
