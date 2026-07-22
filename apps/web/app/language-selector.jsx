"use client";

const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const chooseLanguage = (language) => {
  document.cookie = `foodseyo_language=${language}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE}; SameSite=Lax`;
  document.documentElement.lang = language;
  window.location.assign(`/restaurant-confirmation?lang=${language}`);
};

export function LanguageSelector() {
  return (
    <main className="shell landing-shell" aria-labelledby="language-title">
      <p className="eyebrow">Foodseyo</p>
      <h1 id="language-title">Choose your language</h1>
      <p className="lede" lang="ko">언어를 선택하세요</p>
      <div className="language-options" aria-label="Language selection">
        <button
          className="language-button"
          type="button"
          lang="en"
          onClick={() => chooseLanguage("en")}
        >
          English
        </button>
        <button
          className="language-button"
          type="button"
          lang="ko"
          onClick={() => chooseLanguage("ko")}
        >
          한국어
        </button>
      </div>
    </main>
  );
}
