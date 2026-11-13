import type { ReactNode } from "react";

type Props = {
  children?: ReactNode;
  hatchSides?: boolean;
  bottomPlus?: boolean;
  className?: string;
};

const Plus = ({ x, y }: { x: string; y: "top" | "bottom" }) => <i className={`plus ${x} ${y}`} />;

/** One row of the 3-column guide grid: [side | inner | side] with + markers on corners. */
export default function GridRow({ children, hatchSides, bottomPlus, className = "" }: Props) {
  const xs = ["x0", "x1", "x2", "x3"];
  return (
    <div className={`grid-row ${className}`}>
      {xs.map((x) => (
        <Plus key={`t${x}`} x={x} y="top" />
      ))}
      {bottomPlus && xs.map((x) => <Plus key={`b${x}`} x={x} y="bottom" />)}
      <div className={`side ${hatchSides ? "hatch" : ""}`} />
      <div className="inner">{children}</div>
      <div className={`side ${hatchSides ? "hatch" : ""}`} />
    </div>
  );
}
