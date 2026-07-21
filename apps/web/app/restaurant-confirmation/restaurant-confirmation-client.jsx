"use client";

import React, { useMemo, useState } from "react";

const STATE_LABELS = {
  candidate: "후보",
  conflicting: "단서 충돌",
  rejected: "후보 없음",
  user_confirmed: "사용자 선택",
  externally_verified: "외부 확인",
};

const EMPTY_CALLBACK = () => {};

export function RestaurantConfirmationPanel({
  screen,
  selectedCandidateId = null,
  submissionState = "idle",
  statusMessage = "",
  onSelect = EMPTY_CALLBACK,
  onConfirm = EMPTY_CALLBACK,
  onRetry = EMPTY_CALLBACK,
  onMenuOnly = EMPTY_CALLBACK,
  onContinue = EMPTY_CALLBACK,
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
      <div className="fixture-banner" role="note">
        <strong>Fixture 미리보기</strong>
        <span>
          PR #27 병합 전에는 서버 확인이 연결되지 않습니다. 이 화면의
          동작은 브라우저 안에서만 유지됩니다.
        </span>
      </div>

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
              아래 정보는 후보를 찾은 단서이며, 사용자가 선택하기 전에는
              지점이 확정되지 않습니다.
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
                : screen.resolutionState === "externally_verified"
                  ? "외부 확인"
                  : "사용자 선택";
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
          <p>식당을 확정하지 않고 메뉴 사진만으로 계속할 수 있어요.</p>
        </section>
      )}

      <div
        className={`status-message${isError ? " is-error" : ""}`}
        role={isError ? "alert" : "status"}
        aria-live={isError ? "assertive" : "polite"}
      >
        {isSubmitting ? "Fixture 선택을 저장하는 중…" : statusMessage}
      </div>

      <div className="action-stack">
        {canChoose ? (
          <button
            className="primary-button"
            type="button"
            disabled={!selectedCandidate || isSubmitting}
            onClick={() => onConfirm(selectedCandidate?.candidateId ?? null)}
          >
            {isSubmitting ? "선택 저장 중…" : "네, 이 식당이에요"}
          </button>
        ) : null}

        {screen.controls.some(
          (control) => control.id === "retry-restaurant-matching",
        ) ? (
          <button className="secondary-button" type="button" onClick={onRetry}>
            식당 다시 찾기
          </button>
        ) : null}

        {screen.controls.some((control) => control.id === "continue-analysis") ? (
          <button className="primary-button" type="button" onClick={onContinue}>
            메뉴 분석 계속
          </button>
        ) : null}

        {screen.controls.some(
          (control) => control.id === "continue-menu-only",
        ) ? (
          <button className="text-button" type="button" onClick={onMenuOnly}>
            메뉴 사진만으로 계속
          </button>
        ) : null}
      </div>
    </main>
  );
}

export function RestaurantConfirmationExperience({ screens }) {
  const [activeState, setActiveState] = useState("candidate");
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [submissionState, setSubmissionState] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const screen = screens[activeState];

  const previewStates = useMemo(
    () => Object.keys(STATE_LABELS).filter((state) => screens[state]),
    [screens],
  );

  const selectState = (state) => {
    setActiveState(state);
    setSelectedCandidateId(
      screens[state].candidates.find((candidate) => candidate.isSelected)
        ?.candidateId ?? null,
    );
    setSubmissionState("idle");
    setStatusMessage("");
  };

  const previewSubmission = (state) => {
    setActiveState("candidate");
    setSelectedCandidateId(screens.candidate.candidates[0]?.candidateId ?? null);
    setSubmissionState(state);
    setStatusMessage(
      state === "error"
        ? "Fixture 선택을 저장하지 못했어요. 선택 내용은 그대로 남아 있어요."
        : "",
    );
  };

  const confirmFixtureChoice = () => {
    setSubmissionState("loading");
    setStatusMessage("");
    window.setTimeout(() => {
      setSubmissionState("idle");
      setStatusMessage(
        "Fixture 선택을 로컬에 기록했어요. 아직 서버 확인에는 연결되지 않았어요.",
      );
    }, 450);
  };

  const setLocalOutcome = (message) => {
    setSubmissionState("idle");
    setStatusMessage(message);
  };

  return (
    <>
      <aside className="preview-toolbar" aria-label="Fixture 상태 미리보기">
        <fieldset>
          <legend>상태 미리보기</legend>
          <div className="preview-options">
            {previewStates.map((state) => (
              <button
                type="button"
                key={state}
                aria-pressed={activeState === state && submissionState === "idle"}
                onClick={() => selectState(state)}
              >
                {STATE_LABELS[state]}
              </button>
            ))}
            <button type="button" onClick={() => previewSubmission("loading")}>
              저장 중
            </button>
            <button type="button" onClick={() => previewSubmission("error")}>
              오류
            </button>
          </div>
        </fieldset>
      </aside>
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
        onConfirm={confirmFixtureChoice}
        onRetry={() =>
          setLocalOutcome("다시 찾을 수 있어요. 실제 서버 검색은 아직 연결되지 않았어요.")
        }
        onMenuOnly={() =>
          setLocalOutcome("메뉴 사진만으로 계속할 준비가 되었어요. 실제 서버 연결은 아직 없어요.")
        }
        onContinue={() =>
          setLocalOutcome("확인된 fixture로 메뉴 분석을 계속할 준비가 되었어요.")
        }
      />
    </>
  );
}
