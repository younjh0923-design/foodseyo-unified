import { cookies } from "next/headers";

import { LanguageSelector } from "./language-selector.jsx";

export default async function HomePage() {
  const cookieStore = await cookies();
  const language = cookieStore.get("foodseyo_language")?.value === "ko" ? "ko" : "en";

  return <LanguageSelector initialLanguage={language} />;
}
