// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import Pagination from "../../src/components/tablePro/pagination/Pagination.vue";
import { ElPaginationStub } from "../helpers/stubs.js";

const mountPagination = (props = {}, beforePageChange) =>
  mount(Pagination, {
    props: {
      pagerConfig: { currentPage: 2, pageSize: 10, total: 100 },
      beforePageChange: beforePageChange || null,
      ...props,
    },
    global: {
      stubs: { "el-pagination": ElPaginationStub },
    },
  });

const elPagination = (wrapper) =>
  wrapper.findComponent(ElPaginationStub);

describe("Pagination 无拦截路径（commit 语义与事件顺序）", () => {
  it("size-change：提交 { currentPage:1, pageSize:20 }，事件顺序 update→size-change→change", async () => {
    const wrapper = mountPagination();
    elPagination(wrapper).vm.$emit("size-change", 20);
    expect(wrapper.emitted("update:pagerConfig")).toHaveLength(1);
    expect(wrapper.emitted("update:pagerConfig")[0][0]).toEqual({
      currentPage: 1,
      pageSize: 20,
      total: 100,
    });
    expect(wrapper.emitted("size-change")[0]).toEqual([20]);
    expect(wrapper.emitted("change")[0][0]).toEqual({
      currentPage: 1,
      pageSize: 20,
      total: 100,
    });
    // current-change 不应因 size 变化额外触发
    expect(wrapper.emitted("current-change")).toBeUndefined();
  });

  it("current-change：提交新页码并抛事件", () => {
    const wrapper = mountPagination();
    elPagination(wrapper).vm.$emit("current-change", 5);
    expect(wrapper.emitted("update:pagerConfig")[0][0]).toEqual({
      currentPage: 5,
      pageSize: 10,
      total: 100,
    });
    expect(wrapper.emitted("current-change")[0]).toEqual([5]);
  });

  it("页码相同为 no-op（不产生任何事件）", () => {
    const wrapper = mountPagination();
    elPagination(wrapper).vm.$emit("current-change", 2);
    expect(wrapper.emitted("update:pagerConfig")).toBeUndefined();
    expect(wrapper.emitted("change")).toBeUndefined();
  });

  it("pageSizes 优先取 pagerConfig.pageSizes，否则回退 props.pageSizes", () => {
    const fromPager = mountPagination({
      pagerConfig: { currentPage: 1, pageSize: 10, pageSizes: [5, 10] },
      pageSizes: [10, 20],
    });
    expect(elPagination(fromPager).props("pageSizes")).toEqual([5, 10]);

    const fallback = mountPagination({ pagerConfig: { currentPage: 1, pageSize: 10 } });
    expect(elPagination(fallback).props("pageSizes")).toEqual([10, 20, 50, 100]);
  });

  it("visible=false 时不渲染", () => {
    const wrapper = mount(Pagination, {
      props: { visible: false, pagerConfig: {} },
      global: { stubs: { "el-pagination": ElPaginationStub } },
    });
    expect(wrapper.findComponent(ElPaginationStub).exists()).toBe(false);
  });
});

describe("beforePageChange 前置拦截", () => {
  it("返回 false 阻止切换且不提交（回滚由 key 重挂载完成）", async () => {
    const before = async () => false;
    const wrapper = mountPagination({}, before);
    const keyBefore = elPagination(wrapper).props("currentPage");
    elPagination(wrapper).vm.$emit("size-change", 20);
    await flushPromises();
    expect(wrapper.emitted("update:pagerConfig")).toBeUndefined();
    expect(wrapper.emitted("change")).toBeUndefined();
    // 重挂载后仍按 props 显示旧状态
    expect(elPagination(wrapper).props("currentPage")).toBe(keyBefore);
  });

  it("Promise reject 同样拦截", async () => {
    const before = async () => {
      throw new Error("deny");
    };
    const wrapper = mountPagination({}, before);
    elPagination(wrapper).vm.$emit("current-change", 9);
    await flushPromises();
    expect(wrapper.emitted("update:pagerConfig")).toBeUndefined();
    expect(wrapper.emitted("change")).toBeUndefined();
  });

  it("守卫 resolve 非 false 值放行并提交", async () => {
    const before = async () => true;
    const wrapper = mountPagination({}, before);
    elPagination(wrapper).vm.$emit("current-change", 8);
    await flushPromises();
    expect(wrapper.emitted("update:pagerConfig")[0][0]).toEqual({
      currentPage: 8,
      pageSize: 10,
      total: 100,
    });
  });

  it("守卫进行中忽略新的分页交互（防抖）", async () => {
    let resolveGuard;
    const before = () => new Promise((r) => { resolveGuard = r; });
    const wrapper = mountPagination({}, before);
    // 第一次切换挂起
    elPagination(wrapper).vm.$emit("current-change", 5);
    // 等待守卫函数被调用（resolveGuard 赋值）后再触发第二次切换
    await flushPromises();
    expect(typeof resolveGuard).toBe("function");
    elPagination(wrapper).vm.$emit("current-change", 6);
    resolveGuard(true);
    await flushPromises();
    expect(wrapper.emitted("update:pagerConfig")).toHaveLength(1);
    expect(wrapper.emitted("update:pagerConfig")[0][0].currentPage).toBe(5);
  });
});
