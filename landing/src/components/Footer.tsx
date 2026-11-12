import GridRow from "./GridRow";
import Reveal from "./Reveal";
import { Logo } from "./Icons";

const links = [
  { label: "Trade", href: "#" },
  { label: "Vault", href: "#" },
  { label: "Portfolio", href: "#" },
  { label: "GitHub", href: "https://github.com/snehendu098/maas-exchange" },
];

export default function Footer() {
  return (
    <footer className="foot">
      <div className="frame">
        <GridRow hatchSides bottomPlus className="foot-row">
          <Reveal className="foot-reveal">
          <a className="logo small" href="#">
            <Logo className="logo-mark" />
            <span>maas</span>
          </a>
          <nav>
            {links.map((l) => (
              <a key={l.label} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
          <span className="mono muted">Built on NEAR · Pyth</span>
          </Reveal>
        </GridRow>
      </div>
    </footer>
  );
}
