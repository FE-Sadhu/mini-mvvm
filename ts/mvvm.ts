interface Options {
  data?: Object
  mounted?: Function
}

class TsMvvm {
  $options: any
  _data: any
  initMounted: boolean

  constructor(options: Options = {}) {
    this.$options = options
    let data = this._data = this.$options.data

    // 数据劫持
    observe(data);

    // 数据代理 -> this 代理 this.data
    for(let key in data) {
      if (data.hasOwnProperty(key)) {
        Object.defineProperty(this, key, {
          configurable: false,
          enumerable: true,
          get() {
            return this._data[key]
          },
          set(newVal) {
            this._data[key] = newVal
          }
        })
      }
    }

    // 初始化 computed
    initComputed.call(this)

    // 编译
    new Compile(this.$options.el, this) // 编译阶段会执行 Watcher 类，所以会收集需要响应式的数据的依赖 watcher 实例

    // 所有事情处理好后执行 mounted 钩子函数
    options.mounted.call(this);
    this.initMounted = true
  }
}

function observe(data) {
  if (!data || typeof data !== 'object') return;
  return new Observe(data)
}

class Observe {
  constructor(data) {
    let dep = new Dep()
    for (let key in data) {
      if (data.hasOwnProperty(key)) {
        let val = data[key]
        observe(val); // 递归 深度数据劫持
        Object.defineProperty(data, key, {
          configurable: false,
          enumerable: true,
          get() {
            Dep.target &&  dep.addSub(Dep.target)
            return val
          },
          set(newVal) {
            if(val === newVal) return;
            val = newVal
            observe(newVal)
            dep.notify()
          }
        })
      }
    }
  }
}

class Compile{
  constructor(el: string, vm) {
    vm.$el = document.querySelector(el)

    let fragment = document.createDocumentFragment()
    let child: HTMLElement
    while(child = vm.$el.firstChild) {
      fragment.appendChild(child)
    }

    function replace(frag) { // 替换插值表达式的值
      Array.from((frag.childNodes as NodeList)).forEach(node => {
        let txt = node.textContent // 获得一个节点及其后代节点的所有文本内容
        const reg: RegExp = /\{\{\s*([^}]+\S)\s*\}\}/g

        if(node.nodeType === 3 && reg.test(txt)) { // 文本节点且有插值表达式
          function replaceTxt() {
            node.textContent = txt.replace(reg, (matched, placeholder) => {
              // placeholder 对应分组的内容
             vm.initMounted || new Watcher(vm, placeholder, replaceTxt)

             return placeholder.split('.').reduce((val, key) => {
               return val[key]
             }, vm)
            })
          }
          replaceTxt()
        }

        if (node.nodeType === 1) { // 元素节点，如 input 节点，双向绑定用
          let nodeAttr = (node as Element).attributes; // 所有属性，是个类数组对象
          Array.from(nodeAttr).forEach((attr) => {
            let name: string = attr.name // 属性名 v-model type
            let exp: string = attr.value // 属性值 

            if (name.includes('v-')) {
              node.value = vm[exp]; // 节点的值是 v-model 里的值
            }

            // 双向绑定的从 model -> view 的响应式绑定
            new Watcher(vm, exp, (newVal) => {
              node.value = newVal
            })

            // 双向绑定的从 view -> model 的响应式绑定
            node.addEventListener('input', (e) => {
              let newVal = e.target.value
              vm[exp] = newVal
            })
          })
        }

        // 如果还有子节点，继续递归 replace
        if (node.childNodes && node.childNodes.length) {
          replace(node)
        }

      })
    }
    replace(fragment)
    
    vm.$el.appendChild(fragment)
  }
}

class Dep {
  subs: any[]
  static target

  constructor () {
    this.subs = [] // 存放订阅者
  }

  addSub(sub) {
    this.subs.push(sub)
  }

  notify() {
    this.subs.forEach((item)=> {
      item.update()
    })
  }
}

// Watcher 这个类的作用，是触发已劫持的 getter 收集依赖，添加上 watcher 实例这个订阅者
class Watcher {
  fn
  vm
  exp: string

  constructor(vm, exp, fn) {
    this.fn = fn
    this.vm = vm
    this.exp = exp // 插值表达式中的 path
    Dep.target = this // 该 watcher 实例本身
    let arr = exp.split('.')
    let val = this.vm
    arr.forEach(key => {
      val = val[key] // 触发 path 对应的 getter, 在 getter 中添加依赖
    })
    Dep.target = null
  }

  update() {
    // 先获取 setter 更新后的值
    let arr = this.exp.split('.')
    let val = this.vm
    arr.forEach(path => {
      val = val[path]
    })
    this.fn(val)
  }

}

function initComputed() {
  let vm = this
  let computed = this.$options.computed
  Object.keys(computed).forEach(key => {
    Object.defineProperty(vm, key, {
      get: typeof computed[key] === 'function' ? computed[key] : computed[key].get,
      set() {}
    })
  })
}