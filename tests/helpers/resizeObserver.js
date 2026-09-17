/**
 * ResizeObserver 测试桩
 * jsdom 不实现 ResizeObserver，也不做真实布局（offsetHeight/clientHeight 恒为 0）。
 * 本桩在 observe 时通过微任务异步回调（贴近真实时序），
 * 高度取 el.__simHeight（可在元素上自定义）或 defaultHeight；
 * fire(el, h) 可供测试手动模拟元素后续尺寸变化（如楼中楼展开）。
 */
export const createResizeObserverMock = (defaultHeight = 200) => {
  const instances = [];

  class ResizeObserverMock {
    constructor(callback) {
      this.callback = callback;
      this.elements = new Map();
      instances.push(this);
    }

    observe(el) {
      const h = el.__simHeight ?? defaultHeight;
      this.elements.set(el, h);
      // 异步上报，保证走完整的「渲染 → 测量 → 重算」流程
      queueMicrotask(() => this.fire(el, h));
    }

    unobserve(el) {
      this.elements.delete(el);
    }

    disconnect() {
      this.elements.clear();
    }

    // 手动上报某元素的新尺寸
    fire(el, height) {
      this.elements.set(el, height);
      this.callback([
        {
          target: el,
          contentRect: { height },
          borderBoxSize: [{ blockSize: height }],
        },
      ]);
    }
  }

  return { ResizeObserverMock, instances };
};
