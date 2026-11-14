import CtaArt from "./CtaArt";
import Reveal from "./Reveal";
import { Arrow } from "./Icons";

export default function Cta() {
  return (
    <section className="cta">
      <div className="frame cta-frame">
        <div className="cta-copy">
          <h2>
            Earn while
            <br />
            neutral
          </h2>
          <Reveal>
            <p>
              Deposit USDC. The vault holds spot ETH + an equal perp short and earns funding. Negative funding? It
              goes flat.
            </p>
            <a className="btn-dark" href="#">
              Deposit USDC <Arrow className="ico" />
            </a>
          </Reveal>
        </div>
        <div className="cta-art">
          <CtaArt />
        </div>
      </div>
    </section>
  );
}
