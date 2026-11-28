// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import ElectronicFlow from "../../src/components/electronicFlow/index.vue";

const nodes = [
  { id: "done", name: "已完成节点", status: "completed", handler: "张三" },
  { id: "doing", name: "进行中节点", status: "processing", handler: "李四" },
  { id: "waiting", name: "未流转节点", status: "pending" },
];

const edges = [
  { source: "done", target: "doing" },
  { source: "doing", target: "waiting" },
];

let wrapper;

function mountFlow(props = {}) {
  wrapper = mount(ElectronicFlow, {
    attachTo: document.body,
    props: {
      nodes,
      edges,
      activeNodeId: "done",
      ...props,
    },
  });
  return wrapper;
}

function getCircles() {
  return wrapper.findAll("circle.electronic-flow__circle");
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
});

describe("ElectronicFlow 节点切换", () => {
  it("使用无箭头直连线，未流转节点不可聚焦且没有点击行为", async () => {
    mountFlow();
    const circles = getCircles();
    const waiting = circles[2];

    expect(wrapper.findAll("marker")).toHaveLength(0);
    expect(wrapper.findAll("path.electronic-flow__edge")).toHaveLength(2);
    expect(waiting.classes()).not.toContain("is-clickable");
    expect(waiting.attributes("tabindex")).toBeUndefined();
    expect(waiting.attributes("aria-disabled")).toBe("true");
    expect(circles[0].classes()).toContain("is-clickable");

    await waiting.trigger("click");
    expect(wrapper.emitted("click")).toBeUndefined();
    expect(wrapper.emitted("change")).toBeUndefined();
  });

  it("beforeChange 返回 false 时触发 click，但不切换且不触发 change", async () => {
    const beforeChange = vi.fn(() => false);
    mountFlow({ beforeChange });

    await getCircles()[1].trigger("click");

    expect(wrapper.emitted("click")).toHaveLength(1);
    expect(wrapper.emitted("click")[0][0].id).toBe("doing");
    expect(beforeChange).toHaveBeenCalledOnce();
    expect(wrapper.emitted("change")).toBeUndefined();
    expect(wrapper.emitted("update:activeNodeId")).toBeUndefined();
    expect(wrapper.find(".electronic-flow__node.is-active text").text()).toBe("已完成节点");
  });

  it("beforeChange 返回 true 时更新当前节点并触发 change", async () => {
    const beforeChange = vi.fn(() => true);
    mountFlow({ beforeChange });

    await getCircles()[1].trigger("click");
    await nextTick();

    expect(wrapper.emitted("update:activeNodeId")).toEqual([["doing"]]);
    expect(wrapper.emitted("change")).toHaveLength(1);
    expect(wrapper.emitted("change")[0][0].id).toBe("doing");
    expect(wrapper.emitted("change")[0][1].id).toBe("done");
    expect(wrapper.find(".electronic-flow__node.is-active text").text()).toBe("进行中节点");

    await getCircles()[1].trigger("click");
    expect(wrapper.emitted("click")).toHaveLength(2);
    expect(wrapper.emitted("change")).toHaveLength(1);
    expect(beforeChange).toHaveBeenCalledOnce();
  });

  it("支持通过 Enter 键切换可交互节点", async () => {
    mountFlow({ beforeChange: () => true });

    await getCircles()[1].trigger("keydown", { key: "Enter" });
    await nextTick();

    expect(wrapper.emitted("click")).toHaveLength(1);
    expect(wrapper.emitted("change")[0][0].id).toBe("doing");
  });

  it("分支配置更新后重新渲染外部汇接、节点直连和节点直角线", async () => {
    mountFlow({
      nodes: [
        { id: "root", name: "开始", status: "completed" },
        { id: "a", name: "分支 A", status: "processing" },
        { id: "b", name: "分支 B", status: "pending" },
        { id: "merge", name: "合并", status: "pending" },
      ],
      edges: [
        { source: "root", target: "a" },
        { source: "root", target: "b" },
        { source: "a", target: "merge" },
        { source: "b", target: "merge" },
      ],
      activeNodeId: "root",
    });
    const getFirstPath = () => wrapper.find("path.electronic-flow__edge").attributes("d");

    expect(getFirstPath()).toContain(" H ");

    await wrapper.setProps({ branchFromNode: true, branchLineType: "direct" });
    await nextTick();
    expect(getFirstPath()).toContain(" L ");
    expect(getFirstPath()).not.toContain(" H ");

    await wrapper.setProps({ branchLineType: "orthogonal" });
    await nextTick();
    expect(getFirstPath()).toContain(" H ");
    expect(getFirstPath()).toContain(" V ");
  });
});
