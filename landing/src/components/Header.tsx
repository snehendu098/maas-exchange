import SearchBox from "./SearchBox";
import { Avatar, Bell, Bolt, Chevron, Logo, Target, Trend, Wallet } from "./Icons";

const cats = ["Perps", "Portfolio", "Activity", "System"];

export default function Header() {
  return (
    <header className="header">
      <div className="header-top">
        <a className="logo" href="#">
          <Logo className="logo-mark" />
          <span>maas</span>
        </a>
        <SearchBox />
        <div className="header-right">
          <div className="stat">
            <span>Portfolio</span>
            <b>$24,580.42</b>
          </div>
          <div className="stat">
            <span>Available</span>
            <b>$8,742.16</b>
          </div>
          <button className="btn-ghost deposit">
            <Wallet className="ico" />
            Deposit
          </button>
          <button className="btn-ghost icon" aria-label="Notifications">
            <Bell className="ico" />
            <i className="notif-dot" />
          </button>
          <button className="btn-ghost icon" aria-label="Account">
            <Avatar className="ico" />
          </button>
        </div>
      </div>
      <nav className="cats">
        <a className="active" href="#">
          <Trend className="ico" />
          Overview
        </a>
        <a href="#">
          <Bolt className="ico" />
          Live
        </a>
        <a href="#">
          <Target className="ico" />
          Vault
        </a>
        <span className="sep" />
        {cats.map((c) => (
          <a key={c} href="#">
            {c}
          </a>
        ))}
        <a href="#">
          More <Chevron className="ico chev" />
        </a>
      </nav>
    </header>
  );
}
