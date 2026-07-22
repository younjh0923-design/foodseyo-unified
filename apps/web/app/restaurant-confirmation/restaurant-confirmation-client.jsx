"use client";

import React, { useEffect, useRef, useState } from "react";

const NOOP = () => {};
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";
const COOKIE_AGE = 60 * 60 * 24 * 365;

const COPY = {
  en: {
    confirmation: "Restaurant confirmation",
    candidateHeading: "Confirm the restaurant location",
    chooseOne: "Choose one",
    notice: "These matches come from clues in the menu photo. Foodseyo does not save a restaurant until you choose it.",
    selected: "Selected", select: "Select", confirmed: "Confirmed",
    reasons: "Why this match is shown",
    emptyTitle: "No matching restaurant found",
    emptyText: "Add the restaurant name or try again with a clearer menu photo.",
    saving: "Confirming the restaurant and saving the menu…",
    continue: "Use this restaurant", retry: "Try another photo",
    uploadTitle: "Find what to order from a menu photo",
    uploadText: "We read the menu and show restaurant matches. Your analysis is saved only after you choose the right location.",
    photo: "Menu photo", fileHelp: "JPG, PNG, or WebP · up to 10 MB",
    restaurant: "Restaurant name", optional: "Optional",
    placeholder: "For example, the name on the sign",
    finding: "Reading the menu and finding restaurant matches…",
    analyzing: "Analyzing…", find: "Find restaurant matches",
    complete: "Analysis complete", menu: "Menu", another: "Analyze another menu",
    analyzeError: "We couldn't complete the menu analysis. Please try again.",
    confirmError: "We couldn't save the menu with that restaurant. Please try again.",
  },
  ko: {
    confirmation: "식당 확인",
    candidateHeading: "식당 지점을 확인해 주세요",
    chooseOne: "하나를 선택하세요",
    notice: "아래 정보는 메뉴 사진에서 찾은 후보입니다. 직접 선택하기 전에는 어떤 식당도 저장하지 않습니다.",
    selected: "선택됨", select: "선택", confirmed: "확인됨",
    reasons: "후보로 표시된 단서",
    emptyTitle: "일치하는 식당 후보를 찾지 못했어요",
    emptyText: "식당 이름을 추가하거나 더 선명한 메뉴 사진으로 다시 시도해 주세요.",
    saving: "식당을 확인하고 메뉴를 저장하는 중…",
    continue: "이 식당으로 계속", retry: "다른 사진으로 다시 찾기",
    uploadTitle: "메뉴 사진으로 주문할 음식을 찾아보세요",
    uploadText: "메뉴를 읽고 식당 후보를 보여드린 뒤, 선택한 지점에 분석 결과를 저장합니다.",
    photo: "메뉴 사진", fileHelp: "JPG, PNG, WebP · 최대 10MB",
    restaurant: "식당 이름", optional: "선택 사항",
    placeholder: "예: 간판에 적힌 식당 이름",
    finding: "메뉴를 읽고 식당 후보를 찾는 중…",
    analyzing: "분석 중…", find: "식당 후보 찾기",
    complete: "분석 완료", menu: "메뉴", another: "다른 메뉴 분석하기",
    analyzeError: "메뉴 분석을 완료하지 못했어요. 다시 시도해 주세요.",
    confirmError: "선택한 식당에 메뉴를 저장하지 못했어요. 다시 시도해 주세요.",
  },
};

export function RestaurantConfirmationPanel({
  screen, language = "ko", selectedCandidateId = null,
  submissionState = "idle", statusMessage = "",
  onSelect = NOOP, onConfirm = NOOP, onRetry = NOOP,
}) {
  const copy = COPY[language];
  const loading = submissionState === "loading";
  const error = submissionState === "error";
  const canChoose = screen.candidates.some((candidate) => candidate.canSelect);
  const selected = screen.candidates.find(
    (candidate) => candidate.candidateId === selectedCandidateId,
  );

  return (
    <main className="shell confirmation-shell" aria-labelledby="confirmation-title" aria-busy={loading}>
      <header className="page-header">
        <p className="eyebrow">{copy.confirmation}</p>
        <h1 id="confirmation-title">{screen.title}</h1>
        <p className="lede">{screen.description}</p>
      </header>
      {screen.candidates.length > 0 ? (
        <section aria-labelledby="candidate-heading">
          <div className="section-heading">
            <h2 id="candidate-heading">{copy.candidateHeading}</h2>
            {canChoose ? <span>{copy.chooseOne}</span> : null}
          </div>
          {canChoose ? <p className="candidate-notice">{copy.notice}</p> : null}
          <div className="candidate-list">
            {screen.candidates.map((candidate) => {
              const isSelected = candidate.candidateId === selectedCandidateId;
              const Container = candidate.canSelect ? "button" : "article";
              const status = candidate.canSelect
                ? isSelected ? copy.selected : copy.select
                : copy.confirmed;
              const props = candidate.canSelect
                ? { type: "button", "aria-pressed": isSelected,
                    "aria-label": candidate.confirmAriaLabel ?? candidate.name,
                    disabled: loading, onClick: () => onSelect(candidate.candidateId) }
                : { "aria-label": `${candidate.name}, ${candidate.address}, ${status}` };
              return (
                <Container className={`candidate-card${isSelected ? " is-selected" : ""}`}
                  key={candidate.candidateId} {...props}>
                  <span className="candidate-name">{candidate.name}</span>
                  <span className="candidate-address">{candidate.address}</span>
                  <span className="reason-list" aria-label={copy.reasons}>
                    {candidate.matchReasons.map((reason) => (
                      <span className="reason-chip" key={reason}>{reason}</span>
                    ))}
                  </span>
                  <span className="selection-mark" aria-hidden="true">{status}</span>
                </Container>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="empty-state" aria-labelledby="empty-heading">
          <p className="empty-icon" aria-hidden="true">?</p>
          <h2 id="empty-heading">{copy.emptyTitle}</h2>
          <p>{copy.emptyText}</p>
        </section>
      )}
      <div className={`status-message${error ? " is-error" : ""}`}
        role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>
        {loading ? copy.saving : statusMessage}
      </div>
      <div className="action-stack">
        {canChoose ? (
          <button className="primary-button" type="button" disabled={!selected || loading}
            onClick={() => onConfirm(selected?.candidateId ?? null)}>
            {loading ? copy.saving : copy.continue}
          </button>
        ) : null}
        <button className="secondary-button" type="button" disabled={loading} onClick={onRetry}>
          {copy.retry}
        </button>
      </div>
    </main>
  );
}

function UploadStep({ language, onAnalyze, loading, errorMessage }) {
  const copy = COPY[language];
  const [image, setImage] = useState(null);
  const [restaurantName, setRestaurantName] = useState("");
  return (
    <main className="shell confirmation-shell" aria-busy={loading}>
      <header className="page-header">
        <p className="eyebrow">Foodseyo</p>
        <h1>{copy.uploadTitle}</h1><p className="lede">{copy.uploadText}</p>
      </header>
      <form className="upload-form" onSubmit={(event) => {
        event.preventDefault();
        if (image && !loading) onAnalyze(image, restaurantName);
      }}>
        <label className="field-label" htmlFor="menu-image">{copy.photo}</label>
        <input className="file-input" id="menu-image" name="menu-image" type="file"
          accept={ACCEPTED_IMAGE_TYPES} required disabled={loading}
          onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
        <p className="field-help">{copy.fileHelp}</p>
        <label className="field-label" htmlFor="restaurant-name">
          {copy.restaurant} <span>{copy.optional}</span>
        </label>
        <input className="text-input" id="restaurant-name" name="restaurant-name"
          type="text" maxLength={200} autoComplete="organization" disabled={loading}
          value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)}
          placeholder={copy.placeholder} />
        {errorMessage ? <p className="status-message is-error" role="alert">{errorMessage}</p> :
          <p className="status-message" role="status" aria-live="polite">{loading ? copy.finding : ""}</p>}
        <button className="primary-button" type="submit" disabled={!image || loading}>
          {loading ? copy.analyzing : copy.find}
        </button>
      </form>
    </main>
  );
}

function ResultStep({ language, result, onRestart }) {
  const copy = COPY[language];
  return (
    <main className="shell confirmation-shell" aria-labelledby="result-title">
      <header className="page-header">
        <p className="eyebrow">{copy.complete}</p><h1 id="result-title">{result.title}</h1>
        {result.restaurantAddress ? <p className="lede">{result.restaurantAddress}</p> : null}
      </header>
      <section aria-labelledby="menu-heading">
        <div className="section-heading"><h2 id="menu-heading">{copy.menu}</h2></div>
        <div className="menu-list">{result.menuItems.map((item) => (
          <article className="menu-card" key={item.menuItemId}>
            <div className="menu-card-heading"><h3>{item.name}</h3><strong>{item.price}</strong></div>
            <p>{item.description}</p>
          </article>
        ))}</div>
      </section>
      <p className="safety-notice">{result.safetyNotice}</p>
      <button className="secondary-button" type="button" onClick={onRestart}>{copy.another}</button>
    </main>
  );
}

export function RestaurantConfirmationExperience({ initialLanguage = "ko" }) {
  const language = initialLanguage === "en" ? "en" : "ko";
  const copy = COPY[language];
  const [stage, setStage] = useState("upload");
  const [screen, setScreen] = useState(null);
  const [analysisToken, setAnalysisToken] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [submissionState, setSubmissionState] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [result, setResult] = useState(null);
  const inFlight = useRef(false);

  useEffect(() => {
    document.cookie = `foodseyo_language=${language}; Path=/; Max-Age=${COOKIE_AGE}; SameSite=Lax`;
    document.documentElement.lang = language;
  }, [language]);

  const reset = () => {
    inFlight.current = false; setStage("upload"); setScreen(null);
    setAnalysisToken(null); setSelectedCandidateId(null); setSubmissionState("idle");
    setStatusMessage(""); setResult(null);
  };

  const analyze = async (image, restaurantName) => {
    setSubmissionState("loading"); setStatusMessage("");
    const form = new FormData();
    form.append("image", image); form.append("language", language);
    if (restaurantName.trim()) form.append("restaurantName", restaurantName.trim());
    try {
      const response = await fetch("/api/analyze/menu-images", { method: "POST", body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true || !payload.data?.restaurantScreen) throw new Error();
      setScreen(payload.data.restaurantScreen); setAnalysisToken(payload.data.analysisToken);
      setSelectedCandidateId(null); setSubmissionState("idle"); setStage("confirmation");
    } catch {
      setSubmissionState("error"); setStatusMessage(copy.analyzeError);
    }
  };

  const confirm = async (candidateId) => {
    if (!candidateId || !analysisToken || inFlight.current) return;
    inFlight.current = true; setSubmissionState("loading"); setStatusMessage("");
    try {
      const response = await fetch("/api/restaurant/confirm", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisToken, selectedCandidateId: candidateId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true || !payload.data?.result) throw new Error();
      setResult(payload.data.result); setSubmissionState("idle"); setStage("result");
    } catch {
      setSubmissionState("error"); setStatusMessage(copy.confirmError);
    } finally { inFlight.current = false; }
  };

  if (stage === "result" && result) return <ResultStep language={language} result={result} onRestart={reset} />;
  if (stage === "confirmation" && screen) return (
    <RestaurantConfirmationPanel screen={screen} language={language}
      selectedCandidateId={selectedCandidateId} submissionState={submissionState}
      statusMessage={statusMessage} onSelect={(candidateId) => {
        setSelectedCandidateId(candidateId); setSubmissionState("idle"); setStatusMessage("");
      }} onConfirm={confirm} onRetry={reset} />
  );
  return <UploadStep language={language} loading={submissionState === "loading"}
    errorMessage={submissionState === "error" ? statusMessage : ""} onAnalyze={analyze} />;
}
