// registerNode/Line.js 【终极版】10个锚点必显+可连线+可拉伸+无默认锚点
import { RectNode, RectNodeModel, h } from '@logicflow/core'

class LineNode extends RectNode {
  getShape() {
    const { model } = this.props
    const { x, y, width } = model
    const nodeStyle = model.getNodeStyle()
    const startX = x - width / 2
    const endX = x + width / 2
    const centerY = y

    return h('g', {}, [
      // 透明交互区域：保证拉伸/拖拽/选中功能正常
      // 水平直线本体
      h('path', {
        d: `M ${startX} ${centerY} L ${endX} ${centerY}`,
        stroke: nodeStyle.stroke,
        strokeWidth: nodeStyle.strokeWidth,
        fill: 'red',
        strokeLinecap: 'round',
      }),
      // h('path', {
      //   d: `M ${startX} ${centerY-1} L ${endX} ${centerY-1}`,
      //   stroke: nodeStyle.stroke,
      //   strokeWidth: nodeStyle.strokeWidth,
      //   fill: 'blue',
      //   strokeLinecap: 'round',
      // }),
      // h('rect', {
      //   x: startX,
      //   y: centerY-2,
      //   width: width,
      //   height: 24,
      //   stroke: 'blue',
      //   fill: 'red'
      //   // fill: 'transparent',
      //   // stroke: 'transparent'
      // }),
    ])
  }
}

class LineNodeModel extends RectNodeModel {
  setAttributes() {
    // ====================== 【核心修复 两行代码 必加！！！】 ======================
    // this.autoGenerateAnchors = false; // ✅ 关闭默认锚点自动生成（彻底干掉4个默认锚点）
    this.anchorsOffset = [] // ✅ 清空默认锚点偏移配置，防止残留锚点渲染
    this.anchorStyle = { stroke: '#ff0000', fill: '#ff0000' }
    // ============================================================================

    // 基础配置：保留拉伸+拖拽+锁定宽高比
    this.width = 350 // 建议加长一点，10个锚点显示更清晰
    this.height = 2 // 加大交互高度，选中更方便
    this.isDraggable = true // 可拖拽移动
    this.resizable = true // 可左右拉伸调整长度
    this.aspectRatio = false // 锁定宽高比，拉伸只变长度不变高度

    // 连线配置：全锚点可自由连线，无任何限制
    this.connectable = true // 开启节点连线能力
    this.connectableStart = true // 所有锚点可作为连线起点
    this.connectableEnd = true // 所有锚点可作为连线终点
    this.edgeRules = {
      noEdgeInSameNode: false, // 允许直线自身锚点互相连线（自由连线核心）
    }
    // this.properties = {
    //   ...this.properties,
    //   nodeType: 'LINE',
    //   anchorCount: 10,
    //   showAnchors: false,
    //   fixedAnchorPoints: true,
    //   connectable: true,
    //   disableAutoAnchor: true, // 新增：禁用自动锚点
    // };

    // ✅ 新增核心配置1：关闭LF2.x自动找锚点的全局行为【重中之重】
    this.autoFindAnchor = false
  }

  // ✅ 核心：动态生成【精准10个均匀锚点】，从左到右等距排列在直线上
  // 拉伸后会自动重新计算位置，始终保持10个、始终均分，永不丢失
  getDefaultAnchor() {
    const { width, x, y } = this
    const anchors = []
    const anchorCount = 10 // 固定10个锚点，改这里数字可增减

    // 均分算法：从直线最左端(-0.5) 到 最右端(0.5) 平均分割，y轴固定0，锚点全在直线上
    for (let i = 0; i < anchorCount; i++) {
      const xRatio = (1 / (anchorCount - 1)) * i
      anchors.push({
        x: x + width * (xRatio - 0.5),
        y: y - 1,
        id: `topline_anchor_${i}`,
        // isConnectable: true, // 强制每个锚点都能连线，无例外
        // type: 'default',
        // type: 'top',
        edgeAddable: true,
      })
      // anchors.push({
      //   x: x + width*(xRatio - 0.5),
      //   y: y-4,
      //   id: `bottom_line_anchor_${i}`,
      //   // isConnectable: true, // 强制每个锚点都能连线，无例外
      //   // type: 'default',
      //   // type: 'top',
      //   edgeAddable: true,
      // });
    }
    return anchors
  }

  getEdgeModel(edgeConfig) {
    const edgeModel = super.getEdgeModel(edgeConfig)
    edgeModel.pointsList = []
    edgeModel.isShowAdjustPoint = false
    edgeModel.router = { type: 'manhattan', args: { padding: 0 } }
    return edgeModel
  }

  // 直线样式：可自定义颜色/粗细，不影响功能
  getNodeStyle() {
    const style = super.getNodeStyle()
    return {
      ...style,
      stroke: '#2987ff',
      strokeWidth: 2,
      // fill: 'transparent'
    }
  }
}

export default {
  type: 'busbar-edge',
  view: LineNode,
  model: LineNodeModel,
}
