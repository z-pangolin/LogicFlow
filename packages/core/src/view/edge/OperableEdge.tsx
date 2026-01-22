import { createElement as h } from 'preact/compat'
import LogicFlow from '../../LogicFlow'
import { EventType } from '../../constant'
import type { GraphModel, LineEdgeModel } from '../../model'
import { IDragParams, StepDrag } from '../../util'
import { Circle, Path } from '../shape'
import { LineEdge } from './LineEdge'

import Point = LogicFlow.Point

type OperablePoint = {
  x: number
  y: number
}

type OperableHandle = {
  x: number
  y: number
  segmentIndex: number
}

export type IOperableEdgeProps = {
  model: LineEdgeModel
  graphModel: GraphModel
}

export class OperableEdge extends LineEdge {
  private controlDrag: StepDrag
  private draggingMode: 'insert' | 'move' | null = null
  private draggingSegmentIndex: number | null = null
  private draggingVertexIndex: number | null = null
  private draggingPoint: Point | null = null
  private prevDraggingPath: string | null = null

  constructor() {
    super()
    this.controlDrag = new StepDrag({
      onDragStart: this.onControlDragStart,
      onDragging: this.onControlDragging,
      onDragEnd: this.onControlDragEnd,
      isStopPropagation: true,
    })
  }

  private getPointerRadius() {
    const {
      graphModel: { theme },
      model,
    } = this.props
    const p = model.properties || {}
    const r = p.controlPointRadius ?? p.pointerRadius ?? p.radius
    if (typeof r === 'number' && r > 0) return r
    const themeR = (theme as any)?.edgeAdjust?.r
    return typeof themeR === 'number' && themeR > 0 ? themeR + 1 : 6
  }

  componentDidMount() {
    this.ensureInitPointerList()
  }

  // 将 properties.pointerList 规整为 [{x,y}, ...] 的纯坐标数组：
  // - 过滤掉无效项（缺 x/y 或非 number）
  // - 不依赖外部传入的结构（避免脏数据导致渲染/拖拽报错）
  private normalizePointerList(raw): OperablePoint[] {
    if (!Array.isArray(raw)) return []
    const result: OperablePoint[] = []
    raw.forEach((item) => {
      const x = item?.x
      const y = item?.y
      if (typeof x === 'number' && typeof y === 'number') {
        result.push({ x, y })
      }
    })
    return result
  }

  // 初始化时保证 pointerList 一定包含起点与终点，并且首尾始终与当前 model.startPoint/endPoint 对齐：
  private ensureInitPointerList() {
    const { model } = this.props
    const start = { x: model.startPoint.x, y: model.startPoint.y }
    const end = { x: model.endPoint.x, y: model.endPoint.y }
    model.setProperties({ pointerList: [start, end] })
  }

  // basePoints 是渲染/命中计算使用的“真实折线顶点”（包含起点/终点）：
  // - 起终点使用 model.startPoint/endPoint（跟随锚点变化）
  // - 内部点来自 pointerList 的内部点（用户插入/移动的控制顶点）
  private getBasePoints(): Point[] {
    const { model } = this.props
    const p: any = model.properties || {}
    const list = this.normalizePointerList(p.pointerList)
    if (list.length >= 2) {
      const internal = list.slice(1, -1)
      return [model.startPoint, ...internal, model.endPoint]
    }
    return [model.startPoint, model.endPoint]
  }

  private getEffectivePoints(): Point[] {
    // effectivePoints 是“渲染态点集”：用于拖拽过程中的实时形变展示。
    // 注意：这里不直接写入 properties.pointerList（持久化点集），避免拖拽中频繁落盘；
    // 持久化发生在 onControlDragEnd（松手）阶段。
    const points = this.getBasePoints()

    if (this.draggingPoint && this.draggingMode === 'insert') {
      // insert：拖拽的是某一段线段的“中点控制点”，实时表现为在该线段中临时插入一个新顶点。
      if (this.draggingSegmentIndex !== null) {
        const insertIndex = this.draggingSegmentIndex + 1
        points.splice(insertIndex, 0, {
          x: this.draggingPoint.x,
          y: this.draggingPoint.y,
        })
      }
    } else if (this.draggingPoint && this.draggingMode === 'move') {
      // move：拖拽的是“已存在的内部顶点”，实时表现为把该顶点替换到拖拽位置。
      if (this.draggingVertexIndex !== null) {
        const idx = this.draggingVertexIndex
        // 保护起点/终点不被 move 模式修改（它们应由锚点决定）
        if (idx > 0 && idx < points.length - 1) {
          points[idx] = { x: this.draggingPoint.x, y: this.draggingPoint.y }
        }
      }
    }

    return points
  }

  private getPath(): string {
    const points = this.getEffectivePoints()
    if (points.length < 2) return ''
    const [start, ...rest] = points
    return `M ${start.x} ${start.y} ${rest
      .map((p) => `L ${p.x} ${p.y}`)
      .join(' ')}`
  }

  private handleControlPointerDown = (
    mode: 'insert' | 'move',
    index: number,
    e: PointerEvent,
  ) => {
    const { model, graphModel } = this.props
    console.log('handleControlPointerDown', mode, model, index)

    if (!model.isSelected) {
      graphModel.selectEdgeById(model.id)
    }
    this.draggingMode = mode
    this.draggingSegmentIndex = mode === 'insert' ? index : null
    this.draggingVertexIndex = mode === 'move' ? index : null
    this.draggingPoint = null
    this.controlDrag.handleMouseDown(e)
  }

  private onControlDragStart = () => {
    const { model } = this.props
    this.prevDraggingPath = this.getPath()
    model.isDragging = true
  }

  private onControlDragging = ({ event }: IDragParams) => {
    const { model, graphModel } = this.props
    if (!event || !this.draggingMode) return

    const {
      canvasOverlayPosition: { x, y },
    } = graphModel.getPointByClient({
      x: event.clientX,
      y: event.clientY,
    })

    this.draggingPoint = { x, y }
    this.forceUpdate()

    if (model.text.value && graphModel.editConfigModel.adjustEdge) {
      model.setText(Object.assign({}, model.text, model.textPosition))
    }

    graphModel.eventCenter.emit(EventType.EDGE_ADJUST, {
      data: model.getData(),
    })
  }

  private onControlDragEnd = () => {
    const { model, graphModel } = this.props
    try {
      if (!this.draggingPoint || !this.draggingMode) return
      const stored = this.getBasePoints()
      const start = { x: model.startPoint.x, y: model.startPoint.y }
      const end = { x: model.endPoint.x, y: model.endPoint.y }
      const internal = stored.length >= 2 ? stored.slice(1, -1) : []

      if (this.draggingMode === 'insert') {
        if (this.draggingSegmentIndex === null) return
        internal.splice(this.draggingSegmentIndex, 0, {
          x: this.draggingPoint.x,
          y: this.draggingPoint.y,
        })
        model.setProperties({ pointerList: [start, ...internal, end] })
      }

      if (this.draggingMode === 'move') {
        if (this.draggingVertexIndex === null) return
        const internalIndex = this.draggingVertexIndex - 1
        if (internalIndex < 0 || internalIndex >= internal.length) return
        internal[internalIndex] = {
          x: this.draggingPoint.x,
          y: this.draggingPoint.y,
        }
        model.setProperties({ pointerList: [start, ...internal, end] })
      }
    } finally {
      model.isDragging = false
      this.draggingMode = null
      this.draggingSegmentIndex = null
      this.draggingVertexIndex = null
      this.draggingPoint = null
      this.prevDraggingPath = null
      this.forceUpdate()
      graphModel.eventCenter.emit(EventType.EDGE_ADJUST, {
        data: model.getData(),
      })
    }
  }

  private getHandles(): OperableHandle[] {
    const points = this.getBasePoints()
    const handles: OperableHandle[] = []
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]
      const p2 = points[i + 1]
      handles.push({
        segmentIndex: i,
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      })
    }
    return handles
  }

  private getControlPoints(): h.JSX.Element | null {
    const { model } = this.props
    // 仅在边被选中时渲染控制点，避免画布上控制点过多导致视觉/交互干扰
    if (!model.isSelected) return null

    // 控制点半径优先走用户 properties 配置，其次走主题默认值
    const r = this.getPointerRadius()
    const {
      graphModel: { theme },
    } = this.props
    const baseStyle = (theme as any)?.edgeAdjust || {}
    const RealStyle = {
      ...baseStyle,
      r,
    }
    const virtualStyle = {
      ...baseStyle,
      r,
      stroke: 'transparent',
      fill: '#FFAEF3',
    }
    // basePoints: 当前边真实的“折线顶点”列表（包含起点/终点）
    const basePoints = this.getBasePoints().map((p) => ({ x: p.x, y: p.y }))
    // vertexPoints: basePoints 中的内部顶点（不含起点/终点），用于“移动顶点”的控制点
    const vertexPoints = basePoints
      .map((p, index) => ({ ...p, index }))
      .filter((p) => p.index > 0 && p.index < basePoints.length - 1)

    return (
      <g>
        {vertexPoints.map((v) => {
          // move 模式拖拽时，用 draggingPoint 覆盖该顶点的渲染位置，实现拖拽中的实时形变
          const point =
            this.draggingMode === 'move' &&
            this.draggingVertexIndex === v.index &&
            this.draggingPoint
              ? this.draggingPoint
              : { x: v.x, y: v.y }
          return (
            <g
              key={`lf-operable-vertex-${v.index}`}
              onPointerDown={(e) =>
                this.handleControlPointerDown('move', v.index, e)
              }
            >
              <Circle
                className="lf-operable-edge-control"
                {...RealStyle}
                x={point.x}
                y={point.y}
              />
            </g>
          )
        })}
        {this.getHandles().map((hItem) => {
          // insert 模式拖拽时，拖的是“线段中点控制点”，用于在该线段中插入一个新顶点
          const point =
            this.draggingMode === 'insert' &&
            this.draggingSegmentIndex === hItem.segmentIndex &&
            this.draggingPoint
              ? this.draggingPoint
              : { x: hItem.x, y: hItem.y }
          return (
            <g
              key={`lf-operable-handle-${hItem.segmentIndex}`}
              onPointerDown={(e) =>
                this.handleControlPointerDown(
                  'insert',
                  hItem.segmentIndex,
                  e as any,
                )
              }
            >
              <Circle
                className="lf-operable-edge-control"
                {...(this.getBasePoints().length > 2
                  ? virtualStyle
                  : RealStyle)}
                x={point.x}
                y={point.y}
              />
            </g>
          )
        })}
      </g>
    )
  }

  getAppendWidth() {
    const d = this.getPath()
    return <Path d={d} strokeWidth={10} stroke="transparent" fill="none" />
  }

  getEdge() {
    const { model } = this.props
    const { isAnimation, arrowConfig } = model
    const style = model.getEdgeStyle()
    const animationStyle = model.getEdgeAnimationStyle()
    const {
      strokeDasharray,
      stroke,
      strokeDashoffset,
      animationName,
      animationDuration,
      animationIterationCount,
      animationTimingFunction,
      animationDirection,
    } = animationStyle

    const d = this.getPath()
    return (
      <g>
        {model.isDragging ? (
          <Path
            d={this.prevDraggingPath!}
            {...style}
            opacity={0.35}
            fill="transparent"
            pointerEvents="none"
          />
        ) : null}
        <Path
          d={d}
          {...style}
          fill="transparent"
          {...arrowConfig}
          {...(isAnimation
            ? {
                strokeDasharray,
                stroke,
                style: {
                  strokeDashoffset,
                  animationName,
                  animationDuration,
                  animationIterationCount,
                  animationTimingFunction,
                  animationDirection,
                },
              }
            : {})}
        />
        {this.getControlPoints()}
      </g>
    )
  }

  getLastTwoPoints(): [Point, Point] {
    const points = this.getEffectivePoints()
    if (points.length < 2) {
      const { model } = this.props
      return [model.startPoint, model.endPoint]
    }
    return [points[points.length - 2], points[points.length - 1]]
  }
}

export default OperableEdge
