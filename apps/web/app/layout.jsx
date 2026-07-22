import "./globals.css";

export const metadata = {
  title: "Foodseyo",
  description: "메뉴 사진과 연결된 식당 지점을 직접 확인하세요.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
