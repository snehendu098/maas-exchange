import GridRow from "./GridRow";
import MoveCard from "./MoveCard";
import Reveal from "./Reveal";
import SplitText from "./SplitText";
import { Arrow } from "./Icons";
import { marketCards } from "@/lib/markets";

export default function BiggestMoves() {
  return (
    <section className="moves">
      <div className="frame">
        <GridRow hatchSides className="moves-head">
          <span className="tag-date mono d1 pop" style={{ animationDelay: "0.2s" }}>settled onchain</span>
          <SplitText as="h2" text="Live Markets" stagger={90} />
          <span className="tag-date mono d2 pop" style={{ animationDelay: "0.4s" }}>funding 1h</span>
        </GridRow>

        <GridRow className="moves-cards">
          {marketCards.map((m, i) => (
            <MoveCard key={m.title} market={m} delay={i * 180} />
          ))}
        </GridRow>

        <GridRow hatchSides bottomPlus className="moves-foot">
          <Reveal>
            <a className="view-all" href="#">
              Open terminal <Arrow className="ico" />
            </a>
          </Reveal>
        </GridRow>
      </div>
    </section>
  );
}
