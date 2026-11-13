import Header from "@/components/Header";
import Hero from "@/components/Hero";
import BiggestMoves from "@/components/BiggestMoves";
import Cta from "@/components/Cta";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main className="page">
        <Hero />
        <div className="band">
          <div className="frame hatch" />
        </div>
        <BiggestMoves />
        <div className="band">
          <div className="frame hatch" />
        </div>
        <Cta />
        <div className="band">
          <div className="frame hatch" />
        </div>
        <Footer />
      </main>
    </>
  );
}
