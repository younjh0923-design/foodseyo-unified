"use client";

import React, { useRef, useState } from "react";

const EMPTY_CALLBACK = () => {};
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";

const safeErrorMessage = (payload, fallback) =>
  typeof payload?.error?.message === "string" ? payload.error.message : fallback;

export function RestaurantConfirmationPanel({
  screen,
  selectedCandidateId = null,
  submissionState = "idle",
  statusMessage = "",
  onSelect = EMPTY_CALLBACK,
  onConfirm = EMPTY_CALLBACK,
  onRetry = EMPTY_CALLBACK,
}) {
  const isSubmitting = submissionState === "loading";
  const isError = submissionState === "error";
  const canChoose = screen.candidates.some((candidate) => candidate.canSelect);
  const selectedCandidate = screen.candidates.find(
    (candidate) => candidate.candidateId === selectedCandidateId,
  );

  return (
    <main
      className="shell confirmation-shell"
      aria-labelledby="confirmation-title"
      aria-busy={isSubmitting}
    >
      <header className="page-header">
        <p className="eyebrow">식당 확인</p>
        <h1 id="confirmation-title">{screen.title}</h1>
        <p className="lede">{screen.description}</p>
      </header>

      {screen.candidates.length > 0 ? (
        <section aria-labelledby="candidate-heading">
          <div className="section-heading">
            <h2 id="candidate-heading">식당 지점을 확인해 주세요</h2>
            {canChoose ? <span>하나를 선택하세요</span> : null}
          </div>
          {canChoose ? (
            <p className="candidate-notice">
              아래 정보는 메뉴 사진에서 찾은 후보입니다. 직접 선택하기 전에는
              어떤 식당도 저장하지 않습니다.
            </p>
          ) : null}
          <div className="candidate-list">
            {screen.candidates.map((candidate) => {
              const isSelected = candidate.candidateId === selectedCandidateId;
              const CandidateContainer = candidate.canSelect ? "button" : "article";
              const selectionStatus = candidate.canSelect
                ? isSelected
                  ? "선택됨"
                  : "선택"
                : "확인됨";
              const interactionProps = candidate.canSelect
                ? {
                    type: "button",
                    "aria-pressed": isSelected,
                    "aria-label": candidate.confirmAriaLabel ?? candidate.name,
                    disabled: isSubmitting,
                    onClick: () => onSelect(candidate.candidateId),
                  }
                : {
                    "aria-label": `${candidate.name}, ${candidate.address}, ${selectionStatus}`,
                  };

              return (
                <CandidateContainer
                  className={`candidate-card${isSelected ? " is-selected" : ""}`}
                  key={candidate.candidateId}
                  {...interactionProps}
                >
                  <span className="candidate-name">{candidate.name}</span>
                  <span className="candidate-address">{candidate.address}</span>
                  <span className="reason-list" aria-label="후보로 제시된 단서">
                    {candidate.matchReasons.map((reason) => (
                      <span className="reason-chip" key={reason}>
                        {reason}
                      </span>
                    ))}
                  </span>
                  <span className="selection-mark" aria-hidden="true">
                    {selectionStatus}
                  </span>
                </CandidateContainer>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="empty-state" aria-labelledby="empty-heading">
          <p className="empty-icon" aria-hidden="true">?</p>
          <h2 id="empty-heading">일치하는 식당 후보를 찾지 못했어요</h2>
          <p>식당 이름을 추가하거나 더 선명한 메뉴 사진으로 다시 시도해 주세요.</p>
        </section>
      )}

      <div
        className={`status-message${isError ? " is-error" : ""}`}
        role={isError ? "alert" : "status"}
        aria-live={isError ? "assertive" : "polite"}
      >
        {isSubmitting ? "식당을 확인하고 메뉴를 저장하는 중…" : statusMessage}
      </div>

      <div className="action-stack">
        {canChoose ? (
          <button
            className="primary-button"
            type="button"
            disabled={!selectedCandidate || isSubmitting}
            onClick={() => onConfirm(selectedCandidate?.candidateId ?? null)}
          >
            {isSubmitting ? "저장 중…" : "네, 이 식당이에요"}
          </button>
        ) : null}
        <button
          className="secondary-button"
          type="button"
          disabled={isSubmitting}
          onClick={onRetry}
        >
          다른 사진으로 다시 찾기
        </button>
      </div>
    </main>
  );
}

function UploadStep({ onAnalyze, loading, errorMessage }) {
  const [image, setImage] = useState(null);
  const [restaurantName, setRestaurantName] = useState("");

  return (
    <main className="shell confirmation-shell" aria-busy={loading}>
      <header className="page-header">
        <p className="eyebrow">Foodseyo</p>
        <h1>메뉴 사진으로 주문할 음식을 찾아보세요.</h1>
        <p className="lede">
          메뉴를 읽고 식당 후보를 보여드린 뒤, 선택한 지점에 분석 결과를 저장합니다.
        </p>
      </header>
      <form
        className="upload-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (image && !loading) onAnalyze(image, restaurantName);
        }}
      >
        <label className="field-label" htmlFor="menu-image">메뉴 사진</label>
        <input
          className="file-input"
          id="menu-image"
          name="menu-image"
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          required
          disabled={loading}
          onChange={(event) => setImage(event.target.files?.[0] ?? null)}
        />
        <p className="field-help">JPG, PNG, WebP · 최대 10MB</p>
        <label className="field-label" htmlFor="restaurant-name">
          식당 이름 <span>선택 사항</span>
        </label>
        <input
          className="text-input"
          id="restaurant-name"
          name="restaurant-name"
          type="text"
          maxLength={200}
          autoComplete="organization"
          disabled={loading}
          value={restaurantName}
          onChange={(event) => setRestaurantName(event.target.value)}
          placeholder="예: 간판에 적힌 식당 이름"
        />
        {errorMessage ? (
          <p className="status-message is-error" role="alert">{errorMessage}</p>
        ) : (
          <p className="status-message" role="status" aria-live="polite">
            {loading ? "메뉴를 읽고 식당 후보를 찾는 중…" : ""}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={!image || loading}>
          {loading ? "분석 중…" : "식당 후보 찾기"}
        </button>
      </form>
    </main>
  );
}

function ResultStep({ result, onRestart }) {
  return (
    <main className="shell confirmation-shell" aria-labelledby="result-title">
      <header className="page-header">
        <p className="eyebrow">분석 완료</p>
        <h1 id="result-title">{result.title}</h1>
        {result.restaurantAddress ? <p className="lede">{result.restaurantAddress}</p> : null}
      </header>
      <section aria-labelledby="menu-heading">
        <div className="section-heading"><h2 id="menu-heading">메뉴</h2></div>
        <div className="menu-list">
          {result.menuItems.map((item) => (
            <article className="menu-card" key={item.menuItemId}>
              <div className="menu-card-heading">
                <h3>{item.name}</h3>
                <strong>{item.price}</strong>
              </div>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
      <p className="safety-notice">{result.safetyNotice}</p>
      <button className="secondary-button" type="button" onClick={onRestart}>
        다른 메뉴 분석하기
      </button>
    </main>
  );
}

export function RestaurantConfirmationExperience() {
  const [stage, setStage] = useState("upload");
  const [screen, setScreen] = useState(null);
  const [analysisToken, setAnalysisToken] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [submissionState, setSubmissionState] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [result, setResult] = useState(null);
  const confirmationInFlight = useRef(false);

  const reset = () => {
    confirmationInFlight.current = false;
    setStage("upload");
    setScreen(null);
    setAnalysisToken(null);
    setSelectedCandidateId(null);
    setSubmissionState("idle");
    setStatusMessage("");
    setResult(null);
  };

  const analyze = async (image, restaurantName) => {
    setSubmissionState("loading");
    setStatusMessage("");
    const form = new FormData();
    form.append("image", image);
    if (restaurantName.trim()) form.append("restaurantName", restaurantName.trim());
    try {
      const response = await fetch("/api/analyze/menu-images", {
        method: "POST",
        body: form,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true || !payload.data?.restaurantScreen) {
        throw new Error(safeErrorMessage(payload, "메뉴 분석을 완료하지 못했어요. 다시 시도해 주세요."));
      }
      setScreen(payload.data.restaurantScreen);
      setAnalysisToken(payload.data.analysisToken);
      setSelectedCandidateId(null);
      setSubmissionState("idle");
      setStage("confirmation");
    } catch (error) {
      setSubmissionState("error");
      setStatusMessage(error instanceof Error ? error.message : "메뉴 분석을 완료하지 못했어요.");
    }
  };

  const confirm = async (candidateId) => {
    if (!candidateId || !analysisToken || confirmationInFlight.current) return;
    confirmationInFlight.current = true;
    setSubmissionState("loading");
    setStatusMessage("");
    try {
      const response = await fetch("/api/restaurant/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisToken, selectedCandidateId: candidateId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true || !payload.data?.result) {
        throw new Error(safeErrorMessage(payload, "선택한 식당에 메뉴를 저장하지 못했어요. 다시 시도해 주세요."));
      }
      setResult(payload.data.result);
      setSubmissionState("idle");
      setStage("result");
    } catch (error) {
      setSubmissionState("error");
      setStatusMessage(error instanceof Error ? error.message : "메뉴를 저장하지 못했어요.");
    } finally {
      confirmationInFlight.current = false;
    }
  };

  if (stage === "result" && result) {
    return <ResultStep result={result} onRestart={reset} />;
  }
  if (stage === "confirmation" && screen) {
    return (
      <RestaurantConfirmationPanel
        screen={screen}
        selectedCandidateId={selectedCandidateId}
        submissionState={submissionState}
        statusMessage={statusMessage}
        onSelect={(candidateId) => {
          setSelectedCandidateId(candidateId);
          setSubmissionState("idle");
          setStatusMessage("");
        }}
        onConfirm={confirm}
        onRetry={reset}
      />
    );
  }
  return (
    <UploadStep
      loading={submissionState === "loading"}
      errorMessage={submissionState === "error" ? statusMessage : ""}
      onAnalyze={analyze}
    />
  );
}
