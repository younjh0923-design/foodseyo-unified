import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell landing-shell">
      <p className="eyebrow">Foodseyo</p>
      <h1>어느 식당의 메뉴인지 먼저 확인해요.</h1>
      <p className="lede">
        메뉴 분석을 시작하기 전에 식당 후보를 직접 확인해 다른 지점의
        정보가 섞이지 않도록 합니다.
      </p>
      <Link className="primary-link" href="/restaurant-confirmation">
        메뉴 사진 분석하기
      </Link>
    </main>
  );
}
