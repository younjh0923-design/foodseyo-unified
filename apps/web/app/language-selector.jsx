"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { storePendingAnalysis } from "./analysis-handoff.js";

const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";
const ACCEPTED_IMAGE_TYPE_SET = new Set(ACCEPTED_IMAGE_TYPES.split(","));
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_COUNT = 5;

const COPY = {
  en: {
    languageLabel: "Choose language",
    title: "Know what you're ordering.",
    description: "See the taste, texture, ingredients, and details behind every dish.",
    action: "Scan or upload a menu",
    actionDescription: "Take or choose up to 5 menu photos.",
    actionAria: "Scan or upload menu photos",
    linkPlaceholder: "Paste a restaurant or menu link",
    linkAction: "Check link",
    invalidLink: "Enter a complete http:// or https:// link.",
    checkingLink: "Finding the restaurant from this link…",
    linkAnalyzeError: "We couldn't find the restaurant from that link. Try another link or upload menu photos.",
    reviewEyebrow: "Menu photo",
    reviewTitle: "Check your menu photo.",
    reviewDescription: "Make sure the menu is clear, then add the restaurant name if you know it.",
    previewAlt: "Selected menu preview",
    changePhoto: "Change photos",
    restaurant: "Restaurant name",
    optional: "Optional",
    placeholder: "For example, the name on the sign",
    finding: "Reading the menu and finding restaurant matches…",
    analyze: "Find restaurant matches",
    analyzing: "Analyzing…",
    back: "Back to home",
    invalidImage: "Choose 1 to 5 JPG, PNG, or WebP images, up to 10 MB each.",
    analyzeError: "We couldn't complete the menu analysis. Please try again.",
  },
  ko: {
    languageLabel: "언어 선택",
    title: "뭐 먹지?",
    description: "모든 음식의 맛, 식감, 재료와 세부 정보를 확인하세요.",
    action: "메뉴 촬영 또는 업로드",
    actionDescription: "메뉴 사진을 최대 5장 촬영하거나 선택하세요.",
    actionAria: "메뉴 사진 촬영 또는 업로드하기",
    linkPlaceholder: "식당 또는 메뉴 링크 붙여넣기",
    linkAction: "링크 확인",
    invalidLink: "http:// 또는 https://로 시작하는 전체 링크를 입력해 주세요.",
    checkingLink: "링크에서 식당을 찾고 있어요…",
    linkAnalyzeError: "링크에서 식당을 찾지 못했어요. 다른 링크를 쓰거나 메뉴 사진을 올려 주세요.",
    reviewEyebrow: "메뉴 사진",
    reviewTitle: "메뉴 사진을 확인해 주세요.",
    reviewDescription: "메뉴가 선명하게 보이는지 확인하고, 알고 있다면 식당 이름을 함께 입력해 주세요.",
    previewAlt: "선택한 메뉴 사진 미리보기",
    changePhoto: "사진 다시 선택",
    restaurant: "식당 이름",
    optional: "선택 사항",
    placeholder: "예: 간판에 적힌 식당 이름",
    finding: "메뉴를 읽고 식당 후보를 찾는 중…",
    analyze: "식당 후보 찾기",
    analyzing: "분석 중…",
    back: "홈으로 돌아가기",
    invalidImage: "장당 10MB 이하의 JPG, PNG 또는 WebP 이미지를 1~5장 선택해 주세요.",
    analyzeError: "메뉴 분석을 완료하지 못했어요. 다시 시도해 주세요.",
  },
};

export function isSupportedRestaurantLink(value) {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

const BrandMark = () => (
  <span className="brand-mark" aria-hidden="true">
    <svg viewBox="0 0 48 48" role="img">
      <circle cx="24" cy="24" r="13" />
      <path d="M14 23h7l3-7 4 9h6M24 25v9M18 31h12" />
    </svg>
  </span>
);

const UploadMark = () => (
  <span className="upload-mark" aria-hidden="true">
    <svg viewBox="0 0 48 48" role="img">
      <rect x="13" y="12" width="24" height="24" rx="4" />
      <circle cx="30" cy="20" r="2.5" />
      <path d="m17 31 6-6 4 4 3-3 4 5M10 18v20h20" />
    </svg>
  </span>
);

export function LanguageSelector({ initialLanguage = "en" }) {
  const [language, setLanguage] = useState(initialLanguage === "ko" ? "ko" : "en");
  const [images, setImages] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantLink, setRestaurantLink] = useState("");
  const [linkStatus, setLinkStatus] = useState("idle");
  const [submissionState, setSubmissionState] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const fileInputRef = useRef(null);
  const analyzeRequestRef = useRef({ controller: null, id: 0 });
  const linkRequestRef = useRef({ controller: null, id: 0 });
  const copy = COPY[language];

  const cancelRequests = useCallback(() => {
    analyzeRequestRef.current.controller?.abort();
    linkRequestRef.current.controller?.abort();
    analyzeRequestRef.current = { controller: null, id: analyzeRequestRef.current.id + 1 };
    linkRequestRef.current = { controller: null, id: linkRequestRef.current.id + 1 };
  }, []);

  useEffect(() => {
    if (images.length === 0) {
      setPreviewUrls([]);
      return undefined;
    }
    const nextPreviewUrls = images.map((image) => URL.createObjectURL(image));
    setPreviewUrls(nextPreviewUrls);
    return () => nextPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [images]);

  useEffect(() => {
    const resetRestoredIntake = (event) => {
      if (!event.persisted) return;
      cancelRequests();
      setImages([]);
      setRestaurantName("");
      setRestaurantLink("");
      setLinkStatus("idle");
      setSubmissionState("idle");
      setStatusMessage("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    window.addEventListener("pageshow", resetRestoredIntake);
    return () => {
      window.removeEventListener("pageshow", resetRestoredIntake);
      cancelRequests();
    };
  }, [cancelRequests]);

  const chooseLanguage = (nextLanguage) => {
    setLanguage(nextLanguage);
    document.cookie = `foodseyo_language=${nextLanguage}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE}; SameSite=Lax`;
    document.documentElement.lang = nextLanguage;
  };

  const chooseImages = (fileList) => {
    cancelRequests();
    setStatusMessage("");
    setSubmissionState("idle");
    setRestaurantName("");
    setRestaurantLink("");
    setLinkStatus("idle");
    const nextImages = Array.from(fileList ?? []);
    if (
      nextImages.length === 0 ||
      nextImages.length > MAX_IMAGE_COUNT ||
      nextImages.some(
        (image) =>
          !ACCEPTED_IMAGE_TYPE_SET.has(image.type) ||
          image.size <= 0 ||
          image.size > MAX_IMAGE_BYTES,
      )
    ) {
      setImages([]);
      if (nextImages.length > 0) setStatusMessage(copy.invalidImage);
      return;
    }
    setImages(nextImages);
  };

  const resetImage = () => {
    cancelRequests();
    setImages([]);
    setRestaurantName("");
    setStatusMessage("");
    setSubmissionState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const analyze = async (event) => {
    event.preventDefault();
    if (images.length === 0 || submissionState === "loading") return;
    setSubmissionState("loading");
    setStatusMessage("");
    analyzeRequestRef.current.controller?.abort();
    const requestId = analyzeRequestRef.current.id + 1;
    const controller = new AbortController();
    analyzeRequestRef.current = { controller, id: requestId };
    const form = new FormData();
    images.forEach((image) => form.append("image", image));
    form.append("language", language);
    if (restaurantName.trim()) form.append("restaurantName", restaurantName.trim());

    try {
      const response = await fetch("/api/analyze/menu-images", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (analyzeRequestRef.current.id !== requestId) return;
      if (!response.ok || payload?.ok !== true || !payload.data?.restaurantScreen) {
        throw new Error();
      }
      const stored = storePendingAnalysis(window.sessionStorage, {
        analysisToken: payload.data.analysisToken,
        restaurantScreen: payload.data.restaurantScreen,
        language,
      });
      if (!stored) throw new Error();
      window.location.assign(`/restaurant-confirmation?lang=${language}`);
    } catch (error) {
      if (controller.signal.aborted || analyzeRequestRef.current.id !== requestId) return;
      setSubmissionState("error");
      setStatusMessage(copy.analyzeError);
    } finally {
      if (analyzeRequestRef.current.id === requestId) {
        analyzeRequestRef.current.controller = null;
      }
    }
  };

  const checkRestaurantLink = async (event) => {
    event.preventDefault();
    if (!isSupportedRestaurantLink(restaurantLink)) {
      setLinkStatus("invalid");
      return;
    }
    if (linkStatus === "loading") return;
    setLinkStatus("loading");
    linkRequestRef.current.controller?.abort();
    const requestId = linkRequestRef.current.id + 1;
    const controller = new AbortController();
    linkRequestRef.current = { controller, id: requestId };
    try {
      const response = await fetch("/api/analyze/restaurant-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ link: restaurantLink.trim(), language }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (linkRequestRef.current.id !== requestId) return;
      if (!response.ok || payload?.ok !== true || !payload.data?.restaurantScreen) {
        throw new Error();
      }
      const stored = storePendingAnalysis(window.sessionStorage, {
        analysisToken: payload.data.analysisToken,
        restaurantScreen: payload.data.restaurantScreen,
        language,
      });
      if (!stored) throw new Error();
      window.location.assign(`/restaurant-confirmation?lang=${language}`);
    } catch {
      if (controller.signal.aborted || linkRequestRef.current.id !== requestId) return;
      setLinkStatus("error");
    } finally {
      if (linkRequestRef.current.id === requestId) {
        linkRequestRef.current.controller = null;
      }
    }
  };

  if (images.length > 0) {
    const loading = submissionState === "loading";
    return (
      <main className="photo-review-page" aria-labelledby="photo-review-title" aria-busy={loading}>
        <div className="photo-review-shell">
          <button className="review-back-button" type="button" onClick={resetImage} disabled={loading}>
            <span aria-hidden="true">‹</span> {copy.back}
          </button>

          <header className="photo-review-header">
            <p className="eyebrow">{copy.reviewEyebrow}</p>
            <h1 id="photo-review-title">{copy.reviewTitle}</h1>
            <p>{copy.reviewDescription}</p>
          </header>

          <form className="photo-review-form" onSubmit={analyze}>
            <div className="selected-photo-card">
              <div className="selected-photo-grid">
                {previewUrls.map((previewUrl, index) => (
                  <img
                    src={previewUrl}
                    alt={`${copy.previewAlt} ${index + 1}`}
                    key={previewUrl}
                  />
                ))}
              </div>
              <button type="button" className="change-photo-button" disabled={loading}
                onClick={() => fileInputRef.current?.click()}>
                {copy.changePhoto}
              </button>
            </div>

            <label className="field-label" htmlFor="restaurant-name">
              {copy.restaurant} <span>{copy.optional}</span>
            </label>
            <input className="text-input" id="restaurant-name" name="restaurant-name"
              type="text" maxLength={200} autoComplete="organization" disabled={loading}
              value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)}
              placeholder={copy.placeholder} />

            <input ref={fileInputRef} className="visually-hidden" type="file"
              accept={ACCEPTED_IMAGE_TYPES} multiple disabled={loading} tabIndex={-1} aria-hidden="true"
              onChange={(event) => chooseImages(event.target.files)} />

            <div className={`status-message${submissionState === "error" ? " is-error" : ""}`}
              role={submissionState === "error" ? "alert" : "status"} aria-live="polite">
              {loading ? copy.finding : statusMessage}
            </div>
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? copy.analyzing : copy.analyze}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="landing-page" aria-labelledby="landing-title">
      <div className="landing-shell">
        <header className="landing-topbar">
          <div className="brand-lockup" aria-label="Foodseyo, AI Food Copilot">
            <BrandMark />
            <span className="brand-copy">
              <strong>Foodseyo</strong>
              <span>AI Food Copilot</span>
            </span>
          </div>

          <div className="language-switcher" role="group" aria-label={copy.languageLabel}>
            <button
              type="button"
              lang="en"
              aria-pressed={language === "en"}
              onClick={() => chooseLanguage("en")}
            >
              EN
            </button>
            <button
              type="button"
              lang="ko"
              aria-pressed={language === "ko"}
              onClick={() => chooseLanguage("ko")}
            >
              한국어
            </button>
          </div>
        </header>

        <section className="landing-hero">
          <h1 id="landing-title">{copy.title}</h1>
          <p>{copy.description}</p>
        </section>

        <form className="link-intake-form" onSubmit={checkRestaurantLink} noValidate>
          <div className="link-field-row">
            <input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off"
              value={restaurantLink} aria-label={copy.linkPlaceholder}
              placeholder={copy.linkPlaceholder}
              onChange={(event) => {
                linkRequestRef.current.controller?.abort();
                linkRequestRef.current = {
                  controller: null,
                  id: linkRequestRef.current.id + 1,
                };
                setRestaurantLink(event.target.value);
                setLinkStatus("idle");
              }} />
            <button type="submit" aria-label={copy.linkAction}
              disabled={!restaurantLink.trim() || linkStatus === "loading"}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5 12h13M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
          <p className={`link-status${linkStatus === "invalid" || linkStatus === "error" ? " is-error" : ""}`}
            role={linkStatus === "invalid" || linkStatus === "error" ? "alert" : "status"} aria-live="polite">
            {linkStatus === "invalid"
              ? copy.invalidLink
              : linkStatus === "loading"
                ? copy.checkingLink
                : linkStatus === "error"
                  ? copy.linkAnalyzeError
                  : ""}
          </p>
        </form>

        <button
          type="button"
          className="upload-entry-card"
          onClick={() => {
            cancelRequests();
            fileInputRef.current?.click();
          }}
          aria-label={copy.actionAria}
        >
          <UploadMark />
          <span className="upload-entry-copy">
            <strong>{copy.action}</strong>
            <span>{copy.actionDescription}</span>
          </span>
          <svg className="entry-arrow" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>
        <input ref={fileInputRef} className="visually-hidden" type="file"
          accept={ACCEPTED_IMAGE_TYPES} multiple tabIndex={-1} aria-hidden="true"
          onChange={(event) => chooseImages(event.target.files)} />
        {statusMessage ? <p className="landing-error" role="alert">{statusMessage}</p> : null}
      </div>
    </main>
  );
}
