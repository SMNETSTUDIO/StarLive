/** 迷你柱状图（纯 CSS，无依赖） */
export default function MiniBars({
  values,
  labels,
  color = "#0a84ff",
  format = (v: number) => String(v),
}: {
  values: number[];
  labels: string[];
  color?: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(...values, 1);
  return (
    <div>
      <div className="mini-bars">
        {values.map((v, i) => (
          <div
            key={i}
            className="bar"
            title={`${labels[i]}：${format(v)}`}
            style={
              {
                height: `${Math.max((v / max) * 100, 3)}%`,
                "--bar-color": color,
                opacity: v === 0 ? 0.25 : 1,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="mini-bars-labels">
        {labels.map((l, i) => (
          // 只显示部分标签避免拥挤
          <span key={i}>{i % 2 === labels.length % 2 ? l : ""}</span>
        ))}
      </div>
    </div>
  );
}
