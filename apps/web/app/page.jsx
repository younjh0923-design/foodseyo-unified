import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell landing-shell">
      <p className="eyebrow">Foodseyo</p>
      <h1>Find the menu that belongs to your restaurant.</h1>
      <p className="lede">
        Review restaurant candidates before analysis so menu details stay tied
        to the place you actually visited.
      </p>
      <Link className="primary-link" href="/restaurant-confirmation">
        Preview restaurant confirmation
      </Link>
    </main>
  );
}
