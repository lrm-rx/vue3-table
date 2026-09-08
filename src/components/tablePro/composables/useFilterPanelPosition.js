/**
 * 过滤 popover 二次定位 + 滚动跟随 composable（原 index.vue 内的大块 DOM 定位逻辑）
 *
 * 背景：
 *  - vxe transfer=true 下 filter 面板 clamp 时 viewport/document 坐标混用，水平滚动时首尾列
 *    弹窗会超出视口 → 每次 filter-visible 后基于视口尺寸二次 clamp，箭头始终指向触发列。
 *  - 面板为 position:absolute 定位到 body；表格位于外层可滚动容器或页面滚动时面板不会跟随，
 *    造成视觉偏移 → 「基准快照 + delta 增量」方式在滚动时平移面板（垂直只改 top 不重算 left，
 *    避免滚动条 gutter 出现 / clamp 边界浮点造成的水平抖动）。
 *
 * 用法（tablePro/index.vue）：
 *   const { openFilterPanel, closeFilterPanel } = useFilterPanelPosition(gridRef);
 *   - 面板打开（filter-visible=true）时调用 openFilterPanel(column)
 *   - 面板关闭（filter-visible=false）时调用 closeFilterPanel()
 */
import { computed, nextTick } from "vue";
import { useEventListener } from "@vueuse/core";

export const useFilterPanelPosition = (gridRef) => {
  // ========== 当前追踪的过滤列（滚动重定位目标）==========
  let activeFilterColumn = null;
  let repositionRafId = null;
  // 基准快照：记录面板首次 clamp 完成 / 重算整量 时的 left/top 与页面滚动坐标
  let filterReposBaseline = null;
  const takeRepositionBaseline = (panel) => {
    if (!panel) return;
    filterReposBaseline = {
      left: parseFloat(panel.style.left) || 0,
      top: parseFloat(panel.style.top) || 0,
      docScrollLeft:
        document.documentElement.scrollLeft || document.body.scrollLeft || 0,
      docScrollTop:
        document.documentElement.scrollTop || document.body.scrollTop || 0,
    };
  };

  // 1. 获取触发元素中心 X（document 坐标系），优先 .vxe-filter--btn，回退列中心
  const getFilterTriggerCenterX = (column, fallbackX) => {
    if (!column || !column.id) return fallbackX;
    const colEl = document.querySelector(`.vxe-header--column.${column.id}`);
    if (!colEl) return fallbackX;
    const docScrollLeft =
      document.documentElement.scrollLeft || document.body.scrollLeft || 0;
    const filterBtnEl = colEl.querySelector(".vxe-filter--btn");
    const targetEl = filterBtnEl || colEl;
    const targetRect = targetEl.getBoundingClientRect();
    return docScrollLeft + targetRect.left + targetRect.width / 2;
  };

  // 3. 水平边界 clamp：保证弹窗整体在视口内（宽度溢出时设 maxWidth）
  const clampFilterPanelHorizontal = (panel, left, vw, pw, margin) => {
    const docScrollLeft =
      document.documentElement.scrollLeft || document.body.scrollLeft || 0;
    const minLeft = docScrollLeft + margin;
    const maxLeft = docScrollLeft + vw - pw - margin;
    if (pw < vw - margin * 2) {
      if (left < minLeft) left = minLeft;
      else if (left > maxLeft) left = maxLeft;
    } else {
      left = minLeft;
      panel.style.maxWidth = `${vw - margin * 2}px`;
    }
    return left;
  };

  // 4. 垂直边界 clamp（含箭头空间）
  const clampFilterPanelVertical = (top, vh, ph, margin) => {
    const docScrollTop =
      document.documentElement.scrollTop || document.body.scrollTop || 0;
    const minTop = docScrollTop + margin;
    const maxTop = docScrollTop + vh - ph - margin;
    if (ph < vh - margin * 2) {
      if (top < minTop) top = minTop;
      else if (top > maxTop) top = maxTop;
    }
    return top;
  };

  // 5. 计算箭头水平偏移（相对 panel 左上角），clamp 留 12px 防止露出圆角外
  const setFilterArrowOffset = (panel, triggerCenterX, left, pw, arrowSize) => {
    const arrowHalf = arrowSize; // 三角形底边一半
    let arrowLeft = triggerCenterX - left;
    const arrowMin = 12 + arrowHalf;
    const arrowMax = pw - 12 - arrowHalf;
    if (arrowLeft < arrowMin) arrowLeft = arrowMin;
    else if (arrowLeft > arrowMax) arrowLeft = arrowMax;
    // 通过 CSS 变量传给 ::before / ::after 伪元素
    panel.style.setProperty("--vxe-filter-arrow-left", `${arrowLeft}px`);
  };

  // 同步执行面板定位的核心逻辑（供初次打开 clamp 与滚动重定位复用）
  // recalcFromTrigger=true 时基于触发元素当前位置重新计算 top（滚动场景），
  // false 时仅基于面板已有 top 进行 clamp（初次打开场景，vxe 已定位过）
  const doClampFilterPanel = (column, recalcFromTrigger = false) => {
    const panel = document.querySelector(
      ".vxe-table--filter-wrapper.is--active",
    );
    if (!panel) return;
    const margin = 16;
    // 箭头本身 8px + 与表头/面板之间 2px 安全间隙
    const ARROW_SIZE = 8;
    const ARROW_GAP = 2;
    const ARROW_EXTRA = ARROW_SIZE + ARROW_GAP;

    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    let left = parseFloat(panel.style.left) || 0;
    let top = parseFloat(panel.style.top) || 0;

    if (recalcFromTrigger) {
      // 滚动重定位：基于触发元素当前 viewport 位置重新计算 top（document 坐标系）
      // 确保面板始终紧跟触发元素，不会因外层滚动容器滚动而偏移
      const colEl =
        column && column.id
          ? document.querySelector(`.vxe-header--column.${column.id}`)
          : null;
      const filterBtnEl = colEl?.querySelector(".vxe-filter--btn");
      const triggerEl = filterBtnEl || colEl;
      if (triggerEl) {
        const rect = triggerEl.getBoundingClientRect();
        const docScrollTop =
          document.documentElement.scrollTop || document.body.scrollTop || 0;
        const docScrollLeft =
          document.documentElement.scrollLeft || document.body.scrollLeft || 0;
        // 面板顶部 = 触发元素底部 + 箭头空间（document 坐标）
        top = docScrollTop + rect.bottom + ARROW_EXTRA;
        // 面板左对齐触发元素中心
        const triggerCenterX = docScrollLeft + rect.left + rect.width / 2;
        left = triggerCenterX - pw / 2;
        // 水平边界
        left = clampFilterPanelHorizontal(panel, left, vw, pw, margin);
        // 垂直边界
        top = clampFilterPanelVertical(top, vh, ph, margin);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        // 箭头水平偏移
        setFilterArrowOffset(panel, triggerCenterX, left, pw, ARROW_SIZE);
        // 记录最新基准快照，后续滚动 reposition 用 delta 增量更新
        takeRepositionBaseline(panel);
        return;
      }
      // 触发元素找不到则回退到 clamp 逻辑
    }

    // 初次打开 clamp 逻辑：基于 vxe 已设置的 top/left 进行边界修正
    // 1. 获取触发元素中心 X
    const triggerCenterX = getFilterTriggerCenterX(column, left + pw / 2);
    // 2. 面板整体向下挪 ARROW_EXTRA，给箭头留出表头下方到面板上方的可见空间
    //    否则伪元素 translate(-100%) 会被表头白色背景挡住
    top += ARROW_EXTRA;
    // 3. 水平边界
    left = clampFilterPanelHorizontal(panel, left, vw, pw, margin);
    // 4. 垂直边界
    top = clampFilterPanelVertical(top, vh, ph, margin);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    // 5. 箭头水平偏移
    setFilterArrowOffset(panel, triggerCenterX, left, pw, ARROW_SIZE);
    // 记录最新基准快照，后续滚动 reposition 用 delta 增量更新
    takeRepositionBaseline(panel);
  };

  // clampFilterPanelToViewport 总入口：nextTick + setTimeout 内按步骤执行
  const clampFilterPanelToViewport = async (column) => {
    await nextTick();
    // setTimeout 让 vxe 内部完成 filterStore.style 写入后再覆盖
    setTimeout(() => doClampFilterPanel(column, false), 0);
  };

  // ========== 滚动时重新定位过滤面板（不关闭面板）==========
  // 内部 scroll 跳过：FilterCheckbox 列表的 scroll 不影响外层位置，直接 return。
  const repositionActiveFilterPanel = (evt) => {
    if (!activeFilterColumn) return;
    if (repositionRafId != null) return;
    // 若 scroll 事件目标在当前激活的 filter panel 内部（例如 FilterCheckbox 选项列表滚动），
    // 则跳过重定位：面板本身不需要移动。
    if (evt && evt.target instanceof Node) {
      const panelEl = document.querySelector(
        ".vxe-table--filter-wrapper.is--active",
      );
      if (panelEl && panelEl.contains(evt.target)) return;
    }
    repositionRafId = requestAnimationFrame(() => {
      repositionRafId = null;
      const panel = document.querySelector(
        ".vxe-table--filter-wrapper.is--active",
      );
      if (!panel) return;
      // 优先走「基准快照 + delta 增量」，只改需要改的方向，避免引入不必要的偏移
      if (filterReposBaseline) {
        const scrollLeftNow =
          document.documentElement.scrollLeft || document.body.scrollLeft || 0;
        const scrollTopNow =
          document.documentElement.scrollTop || document.body.scrollTop || 0;
        const dLeft = scrollLeftNow - filterReposBaseline.docScrollLeft;
        const dTop = scrollTopNow - filterReposBaseline.docScrollTop;
        if (dLeft === 0 && dTop === 0) return;
        const margin = 16;
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const vh = document.documentElement.clientHeight || window.innerHeight;
        const pw = panel.offsetWidth;
        const ph = panel.offsetHeight;
        // 只在对应方向有滚动时，才更新该方向坐标
        let left = filterReposBaseline.left;
        let top = filterReposBaseline.top;
        if (dLeft !== 0) {
          left = clampFilterPanelHorizontal(
            panel,
            filterReposBaseline.left + dLeft,
            vw,
            pw,
            margin,
          );
        }
        if (dTop !== 0) {
          top = clampFilterPanelVertical(
            filterReposBaseline.top + dTop,
            vh,
            ph,
            margin,
          );
        }
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        return;
      }
      // 无基准快照（极少出现）时回退到按触发元素整量重算
      doClampFilterPanel(activeFilterColumn, true);
    });
  };

  // 1) window capture 阶段捕获页面外层滚动 + 所有嵌套滚动容器的 scroll 事件
  //    （scroll 事件不冒泡，需 capture 才能在 window 层捕获嵌套元素的滚动）
  useEventListener(window, "scroll", repositionActiveFilterPanel, {
    capture: true,
  });
  // 2) 直接监听表格 body wrapper 的 scroll 事件（内层滚动，双保险）
  //    bodyWrapperEl 在 gridRef 挂载后动态计算
  const filterBodyWrapperEl = computed(() => {
    const el = gridRef.value?.$el;
    if (!el || !el.querySelector) return null;
    return (
      el.querySelector(".vxe-table--body-wrapper") ||
      el.querySelector(".vxe-table--body") ||
      null
    );
  });
  useEventListener(filterBodyWrapperEl, "scroll", repositionActiveFilterPanel);

  // ========== 对外 API ==========
  // 面板打开：记录当前打开的列，供滚动重定位使用 + 二次 clamp 面板位置
  const openFilterPanel = (column) => {
    activeFilterColumn = column;
    clampFilterPanelToViewport(column);
  };

  // 面板关闭：清除当前打开列记录（面板已关闭，不再需要滚动重定位）
  const closeFilterPanel = () => {
    activeFilterColumn = null;
    filterReposBaseline = null;
    if (repositionRafId != null) {
      cancelAnimationFrame(repositionRafId);
      repositionRafId = null;
    }
  };

  return { openFilterPanel, closeFilterPanel };
};
