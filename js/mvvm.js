function Mvvm(options = {}) {
  // vue 是将所有属性都挂在了 vm.$options 上，我们这里也这样挂
  this.$options = options;
  // this._data 这里也和vue一样
  let data = this._data = this.$options.data;

  // 数据劫持
  observe(data);

  // 数据代理 -> this 代理了 this._data
  for (let key in data) {
    Object.defineProperty(this, key, {
      configurable: false,
      enumerable: true, // 可枚举
      get() {
        return this._data[key];
      },
      set(newVal) {
        this._data[key] = newVal;
      }
    })
  }

  // 初始化 computed ，将 this 指向实例
  initComputed.call(this);

  // 编译 -> 把 {{}} 里面的内容解析出来
  new Compile(options.el, this);

  // 所有事情处理好后执行 mounted 钩子函数
  options.mounted.call(this);
  this.initMounted = true
}

function Observe(data) {
  let dep = new Dep();
  // 所谓数据劫持就是给对象增加get,set
  for (let key in data) {
    let val = data[key];
    observe(val); // 递归继续向下找，实现深度的数据劫持
    Object.defineProperty(data, key, {
      configurable: false,
      enumerable: true,
      get() {
        Dep.target && dep.addSub(Dep.target); // 将 watcher 添加到订阅事件中
        return val;
      },
      set(newVal) {
        if (val === newVal) {
          return
        }
        val = newVal;
        observe(newVal); // 新值也要数据劫持
        dep.notify(); // 让所有 watcher 的 update 方法执行
      }
    });
  }
}

// 写个函数不用每次都new，也方便递归调用
function observe(data) {
  // 不是对象的话就直接return
  // 防止递归溢出
  if (!data || typeof data !== 'object') return;
  return new Observe(data);
}

// 数据编译 -> 将 {{}} 的内容解析出来
function Compile(el, vm) {
  // 将 el 挂载在实例上方便调用
  vm.$el = document.querySelector(el);
  // 把 el 范围内内容都拿到，存到文档碎片中，节省开销
  let fragment = document.createDocumentFragment();
  let child;
  while (child = vm.$el.firstChild) {
    fragment.appendChild(child); // 被插入节点会从原先文档树位置上移除
  }
  // 对 el 里面的内容进行替换
  function replace(frag) {
    Array.from(frag.childNodes).forEach(node => {
      let txt = node.textContent;
      const reg = /\{\{\s*([^}]+\S)\s*\}\}/g; // 正则匹配 {{}}

      if (node.nodeType === 3 && reg.test(txt)) { // 既是文本节点又包括大括号{{}}
        function replaceTxt() {
          node.textContent = txt.replace(reg, (matched, placeholder) => { // matched参数是正表本次匹配到的内容，此处就是这个节点的 textContent 中的 {{xxx}} 这个东东
            // console.log(placeholder); // placeholder 这个参数就是指本次所匹配到的 matched 中的分组，对应正表()的内容，如：{{album.name}} 中的 album.name 字符串
            
            vm.initMounted || new Watcher(vm, placeholder, replaceTxt); // 监听变化，进行匹配替换内容

            return placeholder.split('.').reduce((val, key) => {
              return val[key];
            }, vm); // 这里很骚 把匹配到的 placeholder 转变成了 值，并且返回
          });
        };
        // 替换
        replaceTxt();
      }
      if (node.nodeType === 1) { // 元素节点 (input标签的情况)
        let nodeAttr = node.attributes; // 获取该node节点上的所有属性，是个类数组
        Array.from(nodeAttr).forEach(attr => {
          let name = attr.name; // v-model type
          let exp = attr.value; // text
          if (name.includes('v-')) {
            node.value = vm[exp]; // 节点的值是data里面的值
          }
          // 监听变化
          new Watcher(vm, exp, function(newVal) {
            node.value = newVal; // 当watcher触发时自动将内容放进输入框中
          })

          node.addEventListener('input', e => {
            let newVal = e.target.value;
            // 值的改变会调用set，set中又会调用notify，notify中调用watcher的update方法实现了更新
            vm[exp] = newVal;
          })
        })
      }
      // 如果还有子节点，继续递归replace
      if (node.childNodes && node.childNodes.length) {
        replace(node);
      }
    });
  }
  replace(fragment);

  vm.$el.appendChild(fragment); // 替换好{{xxxx}}后，再从文档碎片放入el中
}

// 发布订阅模式 -> 订阅就是放入函数，发布就是让数组里的函数执行
function Dep() {
  this.subs = []; // 存放函数的事件池
}

Dep.prototype = {
  addSub(sub) { // 订阅
    this.subs.push(sub);
  },
  notify() { // 发布
    // 绑定的方法，都有一个update方法
    this.subs.forEach(sub => sub.update());
  }
}
// 监听函数
// 通过Watcher这个类创建的实例，都拥有update方法
function Watcher(vm, exp, fn) {
  this.fn = fn; // 将fn放到实例上
  this.vm = vm; // 根实例
  this.exp = exp; // 要监听的值
  // 添加一个事件
  // 这里我们先定义一个属性
  Dep.target = this;
  let arr = exp.split('.');
  let val = vm;
  arr.forEach(key => {
    val = val[key]; // 这里注意 val[key] 获取到的值时就是默认调用了 get 方法
  })
  Dep.target = null;
}
Watcher.prototype.update = function() {
  // 在 notify 的时候，值已经改了
  // 我们需要再通过 vm, exp 来获取新的值
  let arr = this.exp.split('.');
  let val = this.vm;
  arr.forEach(key => {
    val = val[key]; // 通过 get 获取新的值
  })
  this.fn(val);
}

function initComputed() {
  let vm = this;
  let computed = this.$options.computed;
  // 把得到的对象的key组成数组 -> Object.keys()
  Object.keys(computed).forEach(key => {
    Object.defineProperty(vm, key, {
      // 判断computed里的key是对象还是函数
      // 函数的话就会直接调用get
      // 对象的话就收到调一下get
      // 此处不需要new Watcher 去监听变化，直接执行定义的函数就好，因为函数内部去取的那些值始终都是当时最新的值
      get: typeof computed[key] === 'function' ? computed[key] : computed[key].get,
      set() {}
    })
  })
}
