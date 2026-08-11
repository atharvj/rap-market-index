export function buildSparklinePath(
  coordinates: Array<{ x: number; y: number }>,
  interpolation: "linear" | "step"
) {
  if (!coordinates.length) {
    return "";
  }

  const [first, ...rest] = coordinates;
  const start = `M${first.x.toFixed(2)},${first.y.toFixed(2)}`;

  if (interpolation === "step") {
    return [
      start,
      ...rest.map((point) => `H${point.x.toFixed(2)} V${point.y.toFixed(2)}`)
    ].join(" ");
  }

  return [
    start,
    ...rest.map((point) => `L${point.x.toFixed(2)},${point.y.toFixed(2)}`)
  ].join(" ");
}
