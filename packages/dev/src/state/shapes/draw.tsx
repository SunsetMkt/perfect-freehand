import * as React from 'react'
import {
  TLBounds,
  Utils,
  Vec,
  TLShapeUtil,
  TLTransformInfo,
  TLRenderInfo,
  Intersect,
} from '@tldraw/core'
import getStroke, { getStrokePoints } from 'perfect-freehand'
import type { DrawShape } from '../../types'

export class Draw extends TLShapeUtil<DrawShape> {
  type = 'draw' as const

  pointsBoundsCache = new WeakMap<DrawShape['points'], TLBounds>([])
  rotatedCache = new WeakMap<DrawShape, number[][]>([])
  drawPathCache = new WeakMap<DrawShape['points'], string>([])
  simplePathCache = new WeakMap<DrawShape['points'], string>([])
  strokeCache = new WeakMap<DrawShape, number[][]>([])

  defaultProps: DrawShape = {
    id: 'id',
    type: 'draw' as const,
    name: 'Draw',
    parentId: 'page',
    childIndex: 1,
    point: [0, 0],
    points: [[0, 0, 0.5]],
    rotation: 0,
    isDone: false,
    style: {
      size: 8,
      strokeWidth: 0,
      thinning: 0.75,
      streamline: 0.5,
      smoothing: 0.5,
      taperStart: 0,
      taperEnd: 0,
      capStart: true,
      capEnd: true,
      isFilled: true,
      color: '#000',
    },
  }

  shouldRender(prev: DrawShape, next: DrawShape): boolean {
    return next.points !== prev.points || next.style !== prev.style
  }

  render(shape: DrawShape, { isDarkMode }: TLRenderInfo): JSX.Element {
    const {
      style: {
        size,
        thinning,
        strokeWidth,
        streamline,
        smoothing,
        taperStart,
        taperEnd,
        capStart,
        capEnd,
        color,
        isFilled,
      },
      isDone,
    } = shape

    let drawPathData = ''

    const fill = isFilled ? color : 'none'

    // For very short lines, draw a point instead of a line
    const bounds = this.getBounds(shape)

    if (
      (shape.points.length <= 2 ||
        (bounds.width < size / 2 && bounds.height < size / 2)) &&
      isDone
    ) {
      return (
        <circle
          r={size * 0.32}
          fill={fill}
          stroke={color}
          strokeWidth={fill ? strokeWidth || 1 : strokeWidth}
          pointerEvents="all"
        />
      )
    }

    if (shape.points.length > 2) {
      const simulatePressure = shape.points[1][2] === 0.5

      const stroke = getStroke(shape.points.slice(2), {
        size,
        thinning,
        streamline,
        smoothing,
        end: { taper: taperEnd, cap: capEnd },
        start: { taper: taperStart, cap: capStart },
        simulatePressure,
        last: isDone,
      })

      this.strokeCache.set(shape, stroke)

      drawPathData = Utils.getSvgPathFromStroke(stroke)
    }

    return (
      <path
        d={drawPathData}
        fill={fill}
        stroke={color}
        strokeWidth={fill ? strokeWidth || 1 : strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        pointerEvents="all"
      />
    )
  }

  renderIndicator(shape: DrawShape): JSX.Element {
    const { points } = shape

    const path = Utils.getFromCache(this.simplePathCache, points, () =>
      getSolidStrokePath(shape)
    )

    return <path d={path} />
  }

  getBounds = (shape: DrawShape): TLBounds => {
    return Utils.translateBounds(
      Utils.getFromCache(this.pointsBoundsCache, shape.points, () =>
        Utils.getBoundsFromPoints(shape.points)
      ),
      shape.point
    )
  }

  getRotatedBounds = (shape: DrawShape): TLBounds => {
    return Utils.translateBounds(
      Utils.getBoundsFromPoints(shape.points, shape.rotation),
      shape.point
    )
  }

  getCenter = (shape: DrawShape): number[] => {
    return Utils.getBoundsCenter(this.getBounds(shape))
  }

  hitTest(): boolean {
    return true
  }

  hitTestBounds(shape: DrawShape, brushBounds: TLBounds): boolean {
    // Test axis-aligned shape
    if (!shape.rotation) {
      const bounds = this.getBounds(shape)

      return (
        Utils.boundsContain(brushBounds, bounds) ||
        ((Utils.boundsContain(bounds, brushBounds) ||
          Intersect.bounds.bounds(bounds, brushBounds).length > 0) &&
          Intersect.polyline.bounds(
            shape.points,
            Utils.translateBounds(brushBounds, Vec.neg(shape.point))
          ).length > 0)
      )
    }

    // Test rotated shape
    const rBounds = this.getRotatedBounds(shape)

    const rotatedBounds = Utils.getFromCache(this.rotatedCache, shape, () => {
      const c = Utils.getBoundsCenter(Utils.getBoundsFromPoints(shape.points))
      return shape.points.map((pt) => Vec.rotWith(pt, c, shape.rotation || 0))
    })

    return (
      Utils.boundsContain(brushBounds, rBounds) ||
      Intersect.bounds.polyline(
        Utils.translateBounds(brushBounds, Vec.neg(shape.point)),
        rotatedBounds
      ).length > 0
    )
  }

  transform(
    shape: DrawShape,
    bounds: TLBounds,
    { initialShape, scaleX, scaleY }: TLTransformInfo<DrawShape>
  ): Partial<DrawShape> {
    const initialShapeBounds = Utils.getFromCache(
      this.boundsCache,
      initialShape,
      () => Utils.getBoundsFromPoints(initialShape.points)
    )

    const points = initialShape.points.map(([x, y, r]) => {
      return [
        bounds.width *
          (scaleX < 0 // * sin?
            ? 1 - x / initialShapeBounds.width
            : x / initialShapeBounds.width),
        bounds.height *
          (scaleY < 0 // * cos?
            ? 1 - y / initialShapeBounds.height
            : y / initialShapeBounds.height),
        r,
      ]
    })

    const newBounds = Utils.getBoundsFromPoints(shape.points)

    const point = Vec.sub(
      [bounds.minX, bounds.minY],
      [newBounds.minX, newBounds.minY]
    )

    return {
      points,
      point,
    }
  }

  transformSingle(
    shape: DrawShape,
    bounds: TLBounds,
    info: TLTransformInfo<DrawShape>
  ): Partial<DrawShape> {
    return this.transform(shape, bounds, info)
  }

  onSessionComplete(shape: DrawShape): Partial<DrawShape> {
    const bounds = this.getBounds(shape)

    const [x1, y1] = Vec.sub([bounds.minX, bounds.minY], shape.point)

    return {
      points: shape.points.map(([x0, y0, p]) => [x0 - x1, y0 - y1, p]),
      point: Vec.add(shape.point, [x1, y1]),
    }
  }
}

function getSolidStrokePath(shape: DrawShape) {
  let { points } = shape

  let len = points.length

  if (len === 0) return 'M 0 0 L 0 0'
  if (len < 3) return `M ${points[0][0]} ${points[0][1]}`

  points = getStrokePoints(points).map((pt) => pt.point)

  len = points.length

  const d = points.reduce(
    (acc, [x0, y0], i, arr) => {
      if (i === len - 1) {
        acc.push('L', x0, y0)
        return acc
      }

      const [x1, y1] = arr[i + 1]
      acc.push(
        x0.toFixed(2),
        y0.toFixed(2),
        ((x0 + x1) / 2).toFixed(2),
        ((y0 + y1) / 2).toFixed(2)
      )
      return acc
    },
    ['M', points[0][0], points[0][1], 'Q']
  )

  const path = d.join(' ').replaceAll(/(\s[0-9]*\.[0-9]{2})([0-9]*)\b/g, '$1')

  return path
}
