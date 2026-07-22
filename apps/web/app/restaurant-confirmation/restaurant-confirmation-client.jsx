"use client";

import React, { useEffect, useRef, useState } from "react";

import { takePendingAnalysis } from "../analysis-handoff.js";

const NOOP = () => {};
const COOKIE_AGE = 60 * 60 * 24 * 365;

const COPY = {
  en: {
    confirmation: "Restaurant confirmation",
    loadingTitle: "Preparing restaurant matches…",
    loadingText: "Your selected menu photo has been analyzed. This may take a moment.",
    missingTitle: "Choose a menu photo first",
    missingText: "Start from the home screen to take or choose a menu photo.",
    startFromHome: "Go to home",
    candidateHeading: "Confirm the restaurant location",
    chooseOne: "Choose one",
    notice: "These matches come from clues in the menu photo. Foodseyo does not save a restaurant until you choose it.",
    linkNotice: "These matches come from the link you entered. Foodseyo does not save a restaurant until you choose the right location.",
    selected: "Selected", select: "Select", confirmed: "Confirmed",
    reasons: "Why this match is shown",
    emptyTitle: "No matching restaurant found",
    emptyText: "You can keep the menu analysis without saving a restaurant, or try again.",
    saving: "Confirming the restaurant and saving the menu…",
    continue: "Use this restaurant", menuOnly: "Continue with menu only",
    retry: "Try another photo",
    uploadTitle: "Find what to order from a menu photo",
    uploadText: "We read the menu and show restaurant matches. Your analysis is saved only after you choose the right location.",
    photo: "Menu photo", fileHelp: "JPG, PNG, or WebP · up to 10 MB",
    restaurant: "Restaurant name", optional: "Optional",
    placeholder: "For example, the name on the sign",
    finding: "Reading the menu and finding restaurant matches…",
    analyzing: "Analyzing…", find: "Find restaurant matches",
    complete: "Analysis complete", menu: "Menu", another: "Analyze another menu",
    section: "Menu section",
    viewDetails: "View details",
    close: "Close",
    dishDetails: "Dish details",
    orderTip: "Ordering tip",
    evidence: "Evidence",
    askAi: "Ask the ordering copilot",
    assistantTitle: "What sounds good?",
    assistantText: "Ask about taste, texture, heat, ingredients, or what to choose.",
    assistantPlaceholder: "For example, what is mild and crispy?",
    assistantSend: "Ask",
    assistantThinking: "Thinking from this menu…",
    assistantError: "The ordering copilot couldn't answer. Please try again.",
    analyzeError: "We couldn't complete the menu analysis. Please try again.",
    confirmError: "We couldn't save the menu with that restaurant. Please try again.",
  },
  ko: {
    confirmation: "식당 확인",
    loadingTitle: "식당 후보를 준비하고 있어요…",
    loadingText: "선택한 메뉴 사진의 분석 결과를 불러오는 중입니다.",
    missingTitle: "먼저 메뉴 사진을 선택해 주세요",
    missingText: "홈 화면에서 메뉴 사진을 촬영하거나 선택해 주세요.",
    startFromHome: "홈으로 이동",
    candidateHeading: "식당 지점을 확인해 주세요",
    chooseOne: "하나를 선택하세요",
    notice: "아래 정보는 메뉴 사진에서 찾은 후보입니다. 직접 선택하기 전에는 어떤 식당도 저장하지 않습니다.",
    linkNotice: "아래 정보는 입력한 링크에서 찾은 후보입니다. 올바른 지점을 직접 선택하기 전에는 식당을 저장하지 않습니다.",
    selected: "선택됨", select: "선택", confirmed: "확인됨",
    reasons: "후보로 표시된 단서",
    emptyTitle: "일치하는 식당 후보를 찾지 못했어요",
    emptyText: "식당을 저장하지 않고 메뉴 분석만 계속하거나 다시 시도할 수 있어요.",
    saving: "식당을 확인하고 메뉴를 저장하는 중…",
    continue: "이 식당으로 계속", menuOnly: "메뉴만 계속 보기",
    retry: "다른 사진으로 다시 찾기",
    uploadTitle: "메뉴 사진으로 주문할 음식을 찾아보세요",
    uploadText: "메뉴를 읽고 식당 후보를 보여드린 뒤, 선택한 지점에 분석 결과를 저장합니다.",
    photo: "메뉴 사진", fileHelp: "JPG, PNG, WebP · 최대 10MB",
    restaurant: "식당 이름", optional: "선택 사항",
    placeholder: "예: 간판에 적힌 식당 이름",
    finding: "메뉴를 읽고 식당 후보를 찾는 중…",
    analyzing: "분석 중…", find: "식당 후보 찾기",
    complete: "분석 완료", menu: "메뉴", another: "다른 메뉴 분석하기",
    section: "메뉴 섹션",
    viewDetails: "상세 보기",
    close: "닫기",
    dishDetails: "음식 상세",
    orderTip: "주문 팁",
    evidence: "근거",
    askAi: "AI 주문 도우미에게 묻기",
    assistantTitle: "어떤 음식이 당기세요?",
    assistantText: "맛, 식감, 맵기, 재료 또는 메뉴 선택을 물어보세요.",
    assistantPlaceholder: "예: 맵지 않고 바삭한 메뉴가 뭐야?",
    assistantSend: "질문하기",
    assistantThinking: "이 메뉴를 바탕으로 생각하는 중…",
    assistantError: "주문 도우미가 답하지 못했어요. 다시 시도해 주세요.",
    analyzeError: "메뉴 분석을 완료하지 못했어요. 다시 시도해 주세요.",
    confirmError: "선택한 식당에 메뉴를 저장하지 못했어요. 다시 시도해 주세요.",
  },
};

export function RestaurantConfirmationPanel({
  screen, language = "ko", selectedCandidateId = null,
  submissionState = "idle", statusMessage = "",
  onSelect = NOOP, onConfirm = NOOP, onContinueMenuOnly = NOOP,
  onRetry = NOOP,
}) {
  const copy = COPY[language];
  const loading = submissionState === "loading";
  const error = submissionState === "error";
  const canChoose = screen.candidates.some((candidate) => candidate.canSelect);
  const selected = screen.candidates.find(
    (candidate) => candidate.candidateId === selectedCandidateId,
  );
  const fromLink = Boolean(screen.draft?.linkInput);
  const canContinueMenuOnly =
    !fromLink &&
    screen.candidates.length === 0 &&
    screen.canContinueMenuOnly;

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
          {canChoose ? <p className="candidate-notice">{fromLink ? copy.linkNotice : copy.notice}</p> : null}
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
        ) : canContinueMenuOnly ? (
          <button className="primary-button" type="button" disabled={loading}
            onClick={onContinueMenuOnly}>
            {loading ? copy.saving : copy.menuOnly}
          </button>
        ) : null}
        <button className="secondary-button" type="button" disabled={loading} onClick={onRetry}>
          {copy.retry}
        </button>
      </div>
    </main>
  );
}

function IntakeTransitionStep({ language, missing = false, onHome = NOOP }) {
  const copy = COPY[language];
  return (
    <main className="shell confirmation-shell" aria-busy={!missing}>
      <header className="page-header">
        <p className="eyebrow">Foodseyo</p>
        <h1>{missing ? copy.missingTitle : copy.loadingTitle}</h1>
        <p className="lede">{missing ? copy.missingText : copy.loadingText}</p>
      </header>
      {missing ? (
        <button className="primary-button" type="button" onClick={onHome}>
          {copy.startFromHome}
        </button>
      ) : <p className="status-message" role="status" aria-live="polite">{copy.loadingTitle}</p>}
    </main>
  );
}

function ResultStep({ language, result, assistantToken, onRestart }) {
  const copy = COPY[language];
  const [selectedItem, setSelectedItem] = useState(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [assistantState, setAssistantState] = useState("idle");
  const [assistantAnswer, setAssistantAnswer] = useState(null);
  const sections = [...new Set(result.menuItems.map((item) => item.sectionIndex))]
    .sort((left, right) => left - right);

  const askAssistant = async (event) => {
    event.preventDefault();
    const normalized = question.trim();
    if (!normalized || !assistantToken || assistantState === "loading") return;
    setAssistantState("loading");
    setAssistantAnswer(null);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assistantToken, question: normalized }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true || typeof payload.data?.answer !== "string") {
        throw new Error();
      }
      setAssistantAnswer(payload.data);
      setAssistantState("idle");
    } catch {
      setAssistantState("error");
    }
  };

  return (
    <>
      <main className="shell confirmation-shell result-shell" aria-labelledby="result-title">
        <header className="page-header result-header">
          <p className="eyebrow">{copy.complete}</p>
          <h1 id="result-title">{result.title}</h1>
          {result.restaurantAddress ? <p className="lede">{result.restaurantAddress}</p> : null}
        </header>
        <div className="result-section-list">
          {sections.map((sectionIndex) => (
            <section className="result-menu-section" key={sectionIndex}
              aria-labelledby={`menu-section-${sectionIndex}`}>
              <div className="section-heading">
                <h2 id={`menu-section-${sectionIndex}`}>
                  {sections.length === 1 ? copy.menu : `${copy.section} ${sectionIndex + 1}`}
                </h2>
              </div>
              <div className="menu-list">
                {result.menuItems
                  .filter((item) => item.sectionIndex === sectionIndex)
                  .map((item) => (
                    <button className="menu-card result-menu-card" key={item.menuItemId}
                      type="button" onClick={() => setSelectedItem(item)}>
                      <span className="menu-card-heading">
                        <strong>{item.name}</strong><b>{item.price}</b>
                      </span>
                      <span className="menu-card-description">{item.description}</span>
                      <span className="menu-card-detail-link">{copy.viewDetails} <span aria-hidden="true">→</span></span>
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>
        <p className="safety-notice">{result.safetyNotice}</p>
        <div className="result-actions">
          <button className="primary-button assistant-entry" type="button"
            onClick={() => setAssistantOpen(true)}>{copy.askAi}</button>
          <button className="secondary-button" type="button" onClick={onRestart}>{copy.another}</button>
        </div>
      </main>

      {selectedItem ? (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedItem(null);
        }}>
          <section className="detail-sheet" role="dialog" aria-modal="true"
            aria-labelledby="dish-detail-title">
            <button className="sheet-close" type="button" onClick={() => setSelectedItem(null)}
              aria-label={copy.close}>×</button>
            <p className="eyebrow">{copy.dishDetails}</p>
            <div className="detail-heading">
              <h2 id="dish-detail-title">{selectedItem.name}</h2>
              <strong>{selectedItem.price}</strong>
            </div>
            <p className="detail-description">{selectedItem.description}</p>
            <dl className="dish-fact-grid">
              {selectedItem.facts.map((fact) => (
                <div className={`dish-fact${fact.state === "unknown" ? " is-unknown" : ""}`}
                  key={fact.key}>
                  <dt>{fact.label}</dt><dd>{fact.value}</dd>
                  <span>{copy.evidence}: {fact.evidence.label}</span>
                </div>
              ))}
            </dl>
            {selectedItem.orderTip ? (
              <div className="order-tip"><strong>{copy.orderTip}</strong><p>{selectedItem.orderTip}</p></div>
            ) : null}
            <p className="safety-notice">{selectedItem.safetyNotice}</p>
          </section>
        </div>
      ) : null}

      {assistantOpen ? (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAssistantOpen(false);
        }}>
          <section className="assistant-sheet" role="dialog" aria-modal="true"
            aria-labelledby="assistant-title">
            <button className="sheet-close" type="button" onClick={() => setAssistantOpen(false)}
              aria-label={copy.close}>×</button>
            <p className="eyebrow">Foodseyo AI</p>
            <h2 id="assistant-title">{copy.assistantTitle}</h2>
            <p>{copy.assistantText}</p>
            {assistantAnswer ? (
              <div className="assistant-answer" aria-live="polite">
                <p>{assistantAnswer.answer}</p>
                <div className="assistant-suggestions">
                  {assistantAnswer.suggestedMenuItemIds.map((id) => {
                    const item = result.menuItems.find((candidate) => candidate.menuItemId === id);
                    return item ? <button type="button" key={id} onClick={() => {
                      setAssistantOpen(false); setSelectedItem(item);
                    }}>{item.name}</button> : null;
                  })}
                </div>
              </div>
            ) : null}
            <form className="assistant-form" onSubmit={askAssistant}>
              <label className="visually-hidden" htmlFor="assistant-question">{copy.assistantPlaceholder}</label>
              <textarea id="assistant-question" maxLength={500} value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={copy.assistantPlaceholder} disabled={assistantState === "loading"} />
              <button className="primary-button" type="submit"
                disabled={!question.trim() || assistantState === "loading"}>
                {assistantState === "loading" ? copy.assistantThinking : copy.assistantSend}
              </button>
            </form>
            {assistantState === "error" ? <p className="status-message is-error" role="alert">{copy.assistantError}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

export function RestaurantConfirmationExperience({ initialLanguage = "ko" }) {
  const language = initialLanguage === "en" ? "en" : "ko";
  const copy = COPY[language];
  const [stage, setStage] = useState("loading");
  const [screen, setScreen] = useState(null);
  const [analysisToken, setAnalysisToken] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [submissionState, setSubmissionState] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [result, setResult] = useState(null);
  const [assistantToken, setAssistantToken] = useState(null);
  const inFlight = useRef(false);
  const hydrated = useRef(false);

  useEffect(() => {
    document.cookie = `foodseyo_language=${language}; Path=/; Max-Age=${COOKIE_AGE}; SameSite=Lax`;
    document.documentElement.lang = language;
    if (hydrated.current) return;
    hydrated.current = true;
    const pending = takePendingAnalysis(window.sessionStorage);
    if (!pending || pending.language !== language) {
      setStage("missing");
      return;
    }
    setScreen(pending.restaurantScreen);
    setAnalysisToken(pending.analysisToken);
    setStage("confirmation");
  }, [language]);

  const reset = () => {
    inFlight.current = false;
    window.location.assign("/");
  };

  const confirm = async (candidateId) => {
    if (!analysisToken || inFlight.current) return;
    inFlight.current = true; setSubmissionState("loading"); setStatusMessage("");
    try {
      const response = await fetch("/api/restaurant/confirm", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisToken, selectedCandidateId: candidateId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true || !payload.data?.result) throw new Error();
      setResult(payload.data.result); setAssistantToken(payload.data.assistantToken ?? null);
      setSubmissionState("idle"); setStage("result");
    } catch {
      setSubmissionState("error"); setStatusMessage(copy.confirmError);
    } finally { inFlight.current = false; }
  };

  if (stage === "result" && result) return <ResultStep language={language} result={result}
    assistantToken={assistantToken} onRestart={reset} />;
  if (stage === "confirmation" && screen) return (
    <RestaurantConfirmationPanel screen={screen} language={language}
      selectedCandidateId={selectedCandidateId} submissionState={submissionState}
      statusMessage={statusMessage} onSelect={(candidateId) => {
        setSelectedCandidateId(candidateId); setSubmissionState("idle"); setStatusMessage("");
      }} onConfirm={confirm} onContinueMenuOnly={() => confirm(null)}
      onRetry={reset} />
  );
  return <IntakeTransitionStep language={language} missing={stage === "missing"} onHome={reset} />;
}
