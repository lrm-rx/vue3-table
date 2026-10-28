// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { ref, nextTick } from "vue";
import { useFilterPanelPosition } from "../../src/components/tablePro/composables/useFilterPanelPosition.js";

const rect = (left, width) => ({
  left,
  right: left + width,
  width,
  top: 40,
  bottom: 72,
  height: 32,
  x: left,
  y: 40,
});

const waitClamp = async () => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/**
 * 冻结列会同时存在两份表头：
 *  - 主表 fixed--hidden 副本（随横向滚动位移，用户看不到）
 *  - fixed-left 浮层 fixed--visible 副本（用户点击的那个）
 * DOM 顺序上主表在前，所以旧实现 document.querySelector 会先命中隐藏副本。
 */
const setup = ({ visibleLeft, hiddenLeft }) => {
  document.body.innerHTML = `
    <div id="grid">
      <div class="vxe-table--main-wrapper">
        <table><thead><tr>
          <th class="vxe-table--column vxe-header--column col_1 fixed--hidden">
            <span class="vxe-filter--btn"></span>
          </th>
        </tr></thead></table>
      </div>
      <div class="vxe-table--fixed-left-wrapper">
        <table><thead><tr>
          <th class="vxe-table--column vxe-header--column col_1 fixed--visible">
            <span class="vxe-filter--btn"></span>
          </th>
        </tr></thead></table>
      </div>
    </div>
    <div class="vxe-table--filter-wrapper is--active" style="left: 200px; top: 100px"></div>
  `;

  const hiddenBtn = document.querySelector(
    ".fixed--hidden .vxe-filter--btn",
  );
  hiddenBtn.getBoundingClientRect = () => rect(hiddenLeft, 16);
  const visibleBtn = document.querySelector(
    ".fixed--visible .vxe-filter--btn",
  );
  visibleBtn.getBoundingClientRect = () => rect(visibleLeft, 16);

  const panel = document.querySelector(".vxe-table--filter-wrapper");
  Object.defineProperty(panel, "offsetWidth", {
    value: 400,
    configurable: true,
  });
  Object.defineProperty(panel, "offsetHeight", {
    value: 150,
    configurable: true,
  });

  const gridRef = ref({ $el: document.getElementById("grid") });
  return { panel, gridRef };
};

describe("useFilterPanelPosition（冻结列箭头定位）", () => {
  it("冻结列存在隐藏副本时，箭头按可见副本（用户点击的固定列）计算", async () => {
    // 可见副本中心 = 250 + 8 = 258，隐藏副本中心 = 50 + 8 = 58
    // 面板 left = 200 → 正确箭头 = 258 - 200 = 58px；
    // 若误用隐藏副本则 58 - 200 = -142，会被 clamp 到 20px（明显偏移）
    const { panel, gridRef } = setup({ visibleLeft: 250, hiddenLeft: 50 });
    const { openFilterPanel } = useFilterPanelPosition(gridRef);

    openFilterPanel({ id: "col_1" });
    await waitClamp();

    expect(panel.style.getPropertyValue("--vxe-filter-arrow-left")).toBe("58px");
    expect(panel.style.left).toBe("200px");
  });

  it("非冻结列（只有一份表头）仍按该列过滤按钮中心定位", async () => {
    const { panel, gridRef } = setup({ visibleLeft: 260, hiddenLeft: 260 });
    const { openFilterPanel } = useFilterPanelPosition(gridRef);

    openFilterPanel({ id: "col_1" });
    await waitClamp();

    // 260 + 8 - 200 = 68
    expect(panel.style.getPropertyValue("--vxe-filter-arrow-left")).toBe("68px");
  });

  it("可见副本找不到过滤按钮时回退整列中心（不指向隐藏副本）", async () => {
    const { panel, gridRef } = setup({ visibleLeft: 300, hiddenLeft: 0 });
    document.querySelector(".fixed--visible .vxe-filter--btn").remove();
    const colEl = document.querySelector(".fixed--visible");
    colEl.getBoundingClientRect = () => rect(300, 100);

    const { openFilterPanel } = useFilterPanelPosition(gridRef);
    openFilterPanel({ id: "col_1" });
    await waitClamp();

    // 300 + 100 / 2 - 200 = 150
    expect(panel.style.getPropertyValue("--vxe-filter-arrow-left")).toBe(
      "150px",
    );
  });
});
