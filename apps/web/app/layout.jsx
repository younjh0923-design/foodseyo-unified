import { cookies } from "next/headers";

import "./globals.css";

export const metadata = {
  title: "Foodseyo",
  description: "Read a menu photo with restaurant-aware guidance. 메뉴 사진을 식당 정보와 함께 확인하세요.",
};

export default async function RootLayout({ children }) {
  const cookieStore = await cookies();
  const language = cookieStore.get("foodseyo_language")?.value === "en" ? "en" : "ko";

  return (
    <html lang={language}>
      <body>{children}</body>
    </html>
  );
}
